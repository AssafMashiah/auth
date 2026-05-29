import type { Env, RegisterData, LoginData, User, JWTPayload } from '../types';
import { projectService } from './project-service';
import { userService } from './user-service';
import { jwtService } from './jwt-service';
import { auditService } from './audit-service';
import { rateLimitService } from './rate-limit-service';
import { hashPassword, verifyPassword, generateRefreshToken, hashToken } from '../utils/crypto';
import { AuthenticationError, NotFoundError } from '../utils/errors';
import { addSeconds, getTimestamp, getIpAddress, getUserAgent } from '../utils/helpers';
import { drizzle } from 'drizzle-orm/d1';
import { refreshTokens } from '../db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Auth Service - Main authentication logic
 */
export class AuthService {
  /**
   * Register a new user
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @param data - Registration data
   * @param request - Request object for IP/UA
   * @returns User and tokens
   */
  async register(
    env: Env,
    projectId: string,
    data: RegisterData,
    request: Request
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const ipAddress = getIpAddress(request);
    const userAgent = getUserAgent(request);

    // Check rate limit
    await rateLimitService.checkRateLimit(env, projectId, 'register', ipAddress, data.email);

    // Get project
    const project = await projectService.getProject(env, projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    if (!project.enabled) {
      throw new AuthenticationError('Project is disabled');
    }

    try {
      // Hash password
      const passwordHash = await hashPassword(data.password);

      // Create user
      const user = await userService.createUser(env, project.userTableName, {
        email: data.email,
        password: data.password, // Will be ignored
        passwordHash,
        displayName: data.displayName,
      });

      // Generate tokens
      const accessToken = await jwtService.generateAccessToken(project, user.id, user.email);
      const refreshToken = await this.createRefreshToken(
        env,
        projectId,
        user.id,
        { ipAddress, userAgent }
      );

      // Record successful attempt
      await rateLimitService.recordAttempt(env, projectId, 'register', ipAddress, data.email, true, user.id);

      // Log audit event
      await auditService.logEvent(env, {
        projectId,
        eventType: 'user_created',
        eventStatus: 'success',
        userId: user.id,
        ipAddress,
        userAgent,
        eventData: { email: user.email, method: 'password' },
      });

      return { user, accessToken, refreshToken };
    } catch (error) {
      // Record failed attempt
      await rateLimitService.recordAttempt(
        env,
        projectId,
        'register',
        ipAddress,
        data.email,
        false,
        undefined,
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  /**
   * Login a user
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @param data - Login data
   * @param request - Request object
   * @returns User and tokens
   */
  async login(
    env: Env,
    projectId: string,
    data: LoginData,
    request: Request
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const ipAddress = getIpAddress(request);
    const userAgent = getUserAgent(request);

    // Check rate limit
    await rateLimitService.checkRateLimit(env, projectId, 'login', ipAddress, data.email);

    // Get project
    const project = await projectService.getProject(env, projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    if (!project.enabled) {
      throw new AuthenticationError('Project is disabled');
    }

    try {
      // Get user by email
      const user = await userService.getUserByEmail(env, project.userTableName, data.email);
      if (!user) {
        throw new AuthenticationError('Invalid credentials');
      }

      if (user.status !== 'active') {
        throw new AuthenticationError('Account is not active');
      }

      // D1 returns snake_case column names, not camelCase
      const passwordHash = (user as any).password_hash || user.passwordHash;

      if (!passwordHash) {
        throw new AuthenticationError('Password authentication not set up. Please use OAuth.');
      }

      // Verify password
      const isValidPassword = await verifyPassword(data.password, passwordHash);
      if (!isValidPassword) {
        throw new AuthenticationError('Invalid credentials');
      }

      // Update last login
      await userService.updateLastLogin(env, project.userTableName, user.id);

      // Generate tokens
      const accessToken = await jwtService.generateAccessToken(project, user.id, user.email);
      const refreshToken = await this.createRefreshToken(
        env,
        projectId,
        user.id,
        { ipAddress, userAgent }
      );

      // Record successful attempt
      await rateLimitService.recordAttempt(env, projectId, 'login', ipAddress, data.email, true, user.id);

      // Clear previous failed attempts for this email
      await rateLimitService.clearAttempts(env, projectId, data.email);

      // Log audit event
      await auditService.logEvent(env, {
        projectId,
        eventType: 'user_login',
        eventStatus: 'success',
        userId: user.id,
        ipAddress,
        userAgent,
        eventData: { email: user.email, method: 'password' },
      });

      return { user, accessToken, refreshToken };
    } catch (error) {
      // Record failed attempt
      await rateLimitService.recordAttempt(
        env,
        projectId,
        'login',
        ipAddress,
        data.email,
        false,
        undefined,
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  /**
   * Verify access token and get user
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @param token - Access token
   * @returns User
   */
  async verifyToken(
    env: Env,
    projectId: string,
    token: string
  ): Promise<{ user: User; payload: JWTPayload }> {
    // Get project
    const project = await projectService.getProject(env, projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Verify token
    const payload = await jwtService.verifyAccessToken(token, project.jwtSecret, project.jwtAlgorithm);

    // Verify project ID matches
    if (payload.projectId !== projectId) {
      throw new AuthenticationError('Invalid token for this project');
    }

    // Get user
    const user = await userService.getUserById(env, project.userTableName, payload.sub);
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    if (user.status !== 'active') {
      throw new AuthenticationError('Account is not active');
    }

    return { user, payload };
  }

  /**
   * Refresh access token using refresh token
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @param refreshTokenValue - Refresh token
   * @returns New access token
   */
  async refreshToken(
    env: Env,
    projectId: string,
    refreshTokenValue: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const db = drizzle(env.DB);

    // Hash the refresh token to find it
    const tokenHash = await hashToken(refreshTokenValue);

    // Find refresh token
    const tokenRecord = await db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.projectId, projectId),
          eq(refreshTokens.tokenHash, tokenHash),
          eq(refreshTokens.revoked, false)
        )
      )
      .get();

    if (!tokenRecord) {
      throw new AuthenticationError('Invalid refresh token');
    }

    // Check expiration
    if (new Date(tokenRecord.expiresAt) < new Date()) {
      throw new AuthenticationError('Refresh token expired');
    }

    // Get project
    const project = await projectService.getProject(env, projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Get user
    const user = await userService.getUserById(env, project.userTableName, tokenRecord.userId);
    if (!user || user.status !== 'active') {
      throw new AuthenticationError('User not found or inactive');
    }

    // Update last used
    await db
      .update(refreshTokens)
      .set({ lastUsedAt: getTimestamp() })
      .where(eq(refreshTokens.id, tokenRecord.id));

    // Generate new tokens
    const accessToken = await jwtService.generateAccessToken(project, user.id, user.email);
    const newRefreshToken = await this.createRefreshToken(
      env,
      projectId,
      user.id,
      {
        ipAddress: tokenRecord.ipAddress || undefined,
        userAgent: tokenRecord.userAgent || undefined,
      }
    );

    // Optionally revoke old refresh token (rotation strategy)
    await this.revokeRefreshToken(env, tokenRecord.id, 'rotated');

    return { accessToken, refreshToken: newRefreshToken };
  }

  /**
   * Logout user by revoking refresh token
   * @param env - Environment bindings
   * @param refreshTokenValue - Refresh token to revoke
   */
  async logout(env: Env, refreshTokenValue: string): Promise<void> {
    const db = drizzle(env.DB);
    const tokenHash = await hashToken(refreshTokenValue);

    const tokenRecord = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .get();

    if (tokenRecord) {
      await this.revokeRefreshToken(env, tokenRecord.id, 'user_logout');
    }
  }

  /**
   * Create a refresh token
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @param userId - User ID
   * @param metadata - Token metadata
   * @returns Refresh token value
   */
  private async createRefreshToken(
    env: Env,
    projectId: string,
    userId: string,
    metadata: {
      ipAddress?: string;
      userAgent?: string;
      deviceName?: string;
    }
  ): Promise<string> {
    const db = drizzle(env.DB);

    // Get project for expiry config
    const project = await projectService.getProject(env, projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Generate refresh token
    const token = generateRefreshToken();
    const tokenHash = await hashToken(token);

    // Calculate expiry
    const expiresAt = addSeconds(new Date(), project.refreshTokenExpirySeconds);

    // Store refresh token
    await db.insert(refreshTokens).values({
      projectId,
      userId,
      tokenHash,
      deviceName: metadata.deviceName || null,
      userAgent: metadata.userAgent || null,
      ipAddress: metadata.ipAddress || null,
      expiresAt: expiresAt.toISOString(),
      revoked: false,
    });

    return token;
  }

  /**
   * Revoke a refresh token
   * @param env - Environment bindings
   * @param tokenId - Token ID
   * @param reason - Revocation reason
   */
  private async revokeRefreshToken(
    env: Env,
    tokenId: string,
    reason: string
  ): Promise<void> {
    const db = drizzle(env.DB);

    await db
      .update(refreshTokens)
      .set({
        revoked: true,
        revokedAt: getTimestamp(),
        revokedReason: reason,
      })
      .where(eq(refreshTokens.id, tokenId));
  }

  /**
   * Revoke all refresh tokens for a user
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @param userId - User ID
   */
  async revokeAllUserTokens(
    env: Env,
    projectId: string,
    userId: string
  ): Promise<void> {
    const db = drizzle(env.DB);

    await db
      .update(refreshTokens)
      .set({
        revoked: true,
        revokedAt: getTimestamp(),
        revokedReason: 'all_tokens_revoked',
      })
      .where(
        and(
          eq(refreshTokens.projectId, projectId),
          eq(refreshTokens.userId, userId),
          eq(refreshTokens.revoked, false)
        )
      );
  }
}

// Export singleton instance
export const authService = new AuthService();