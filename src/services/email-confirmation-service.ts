import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { passwordResetTokens } from '../db/schema';
import { hashToken } from '../utils/crypto';
import { sanitizeTableName } from '../utils/helpers';
import { auditService } from './audit-service';
import { userService } from './user-service';
import { projectService } from './project-service';
import type { Env } from '../types';
import { NotFoundError, AuthenticationError } from '../utils/errors';

/**
 * Email Confirmation Service - Handles email confirmation token generation and validation
 *
 * Reuses the password reset token table for simplicity, but with different semantics.
 * Email confirmation tokens are similar to password reset tokens but used for verifying email addresses.
 */
export class EmailConfirmationService {
  /**
   * Create an email confirmation token
   *
   * Generates a secure random token, hashes it with SHA-256, and stores it in the database
   * with a 24-hour expiration time. Returns the plaintext token to be sent via email.
   *
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @param userId - User ID
   * @param email - User email address
   * @returns Object containing the plaintext token and token ID
   *
   * @example
   * ```typescript
   * const { token, tokenId } = await emailConfirmationService.createConfirmationToken(
   *   env,
   *   'project-123',
   *   'user-456',
   *   'user@example.com'
   * );
   * // Send token via email: https://app.com/confirm-email?token=${token}
   * ```
   */
  async createConfirmationToken(
    env: Env,
    projectId: string,
    userId: string,
    email: string
  ): Promise<{ token: string; tokenId: string }> {
    const db = drizzle(env.DB);

    // Verify project exists
    const project = await projectService.getProject(env, projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Verify user exists
    const user = await userService.getUserById(env, project.userTableName, userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Generate secure random token (32 characters, URL-safe)
    const token = nanoid(32);

    // Hash token for storage
    const tokenHash = await hashToken(token);

    // Calculate expiry time (24 hours from now, in Unix seconds)
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 86400; // 24 hours

    // Store the hashed token (reusing password_reset_tokens table)
    const result = await db.insert(passwordResetTokens).values({
      projectId,
      userId,
      email,
      tokenHash,
      expiresAt,
      createdAt: now,
      usedAt: null,
    }).returning({ id: passwordResetTokens.id });

    const tokenId = result[0].id;

    // Log audit event
    await auditService.logEvent(env, {
      projectId,
      eventType: 'email_confirmation_requested',
      eventStatus: 'success',
      userId,
      eventData: { email },
    });

    return { token, tokenId };
  }

  /**
   * Validate an email confirmation token
   *
   * Verifies that the token exists, hasn't expired, hasn't been used, and belongs to the
   * correct project. Returns user information if valid.
   *
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @param token - Plaintext confirmation token
   * @returns Object containing user info (userId, email, tokenId)
   * @throws {AuthenticationError} If token is invalid, expired, or used
   * @throws {NotFoundError} If project not found
   *
   * @example
   * ```typescript
   * const { userId, email } = await emailConfirmationService.validateConfirmationToken(
   *   env,
   *   'project-123',
   *   'token-from-email'
   * );
   * ```
   */
  async validateConfirmationToken(
    env: Env,
    projectId: string,
    token: string
  ): Promise<{ userId: string; email: string; tokenId: string }> {
    const db = drizzle(env.DB);

    // Hash the provided token
    const tokenHash = await hashToken(token);

    // Look up the token
    const tokenRecord = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.projectId, projectId),
          eq(passwordResetTokens.tokenHash, tokenHash)
        )
      )
      .get();

    if (!tokenRecord) {
      throw new AuthenticationError('Invalid confirmation token');
    }

    // Check if token has been used
    if (tokenRecord.usedAt !== null) {
      throw new AuthenticationError('Confirmation token has already been used');
    }

    // Check if token has expired
    const now = Math.floor(Date.now() / 1000);
    if (now > tokenRecord.expiresAt) {
      throw new AuthenticationError('Confirmation token has expired');
    }

    return {
      userId: tokenRecord.userId,
      email: tokenRecord.email,
      tokenId: tokenRecord.id,
    };
  }

  /**
   * Mark a confirmation token as used
   *
   * Sets the usedAt timestamp to prevent token reuse.
   *
   * @param env - Environment bindings
   * @param tokenId - Token ID
   *
   * @example
   * ```typescript
   * await emailConfirmationService.useConfirmationToken(env, 'token-id-123');
   * ```
   */
  async useConfirmationToken(env: Env, tokenId: string): Promise<void> {
    const db = drizzle(env.DB);

    const now = Math.floor(Date.now() / 1000);

    await db
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(eq(passwordResetTokens.id, tokenId));
  }

  /**
   * Confirm user email using a valid token
   *
   * Validates the token, marks the user's email as verified in the per-project user table,
   * marks the token as used, and logs the action.
   *
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @param token - Plaintext confirmation token
   * @returns User information
   * @throws {AuthenticationError} If token is invalid
   * @throws {NotFoundError} If project or user not found
   *
   * @example
   * ```typescript
   * const user = await emailConfirmationService.confirmEmail(
   *   env,
   *   'project-123',
   *   'confirmation-token-from-email'
   * );
   * ```
   */
  async confirmEmail(
    env: Env,
    projectId: string,
    token: string
  ): Promise<{ userId: string; email: string }> {
    // Validate the token and get user info
    const { userId, email, tokenId } = await this.validateConfirmationToken(env, projectId, token);

    // Get project to access user table
    const project = await projectService.getProject(env, projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Mark email as verified in the per-project user table
    await userService.updateUser(env, project.userTableName, userId, {
      emailVerified: true,
    });

    // Mark token as used
    await this.useConfirmationToken(env, tokenId);

    // Log audit event
    await auditService.logEvent(env, {
      projectId,
      eventType: 'email_confirmed',
      eventStatus: 'success',
      userId,
      eventData: { email },
    });

    return { userId, email };
  }
}

// Export singleton instance
export const emailConfirmationService = new EmailConfirmationService();