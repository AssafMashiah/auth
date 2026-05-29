import { drizzle } from 'drizzle-orm/d1';
import { eq, and, sql } from 'drizzle-orm';
import { adminUsers, adminSessions } from '../db/schema';
import type { Env, AdminUser, AdminSession } from '../types';
import { hashPassword, verifyPassword, generateSessionToken, hashToken } from '../utils/crypto';
import { AuthenticationError, NotFoundError } from '../utils/errors';
import { addSeconds, getTimestamp, isExpired } from '../utils/helpers';
import { auditService } from './audit-service';

/**
 * Admin Auth Service - Handles admin authentication and sessions
 */
export class AdminAuthService {
  private readonly SESSION_DURATION = 1800; // 30 minutes

  /**
   * Admin login
   * @param env - Environment bindings
   * @param email - Admin email
   * @param password - Admin password
   * @param ipAddress - IP address
   * @param userAgent - User agent
   * @returns Session token and admin user
   */
  async adminLogin(
    env: Env,
    email: string,
    password: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ sessionToken: string; admin: AdminUser }> {
    const db = drizzle(env.DB);

    // Get admin user
    const admin = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, email))
      .get();

    if (!admin) {
      throw new AuthenticationError("Invalid credentials");
    }

    const adminData = admin as unknown as AdminUser;

    if (!adminData.enabled) {
      throw new AuthenticationError("Admin account is disabled");
    }

    // Verify password
    const isValidPassword = await verifyPassword(
      password,
      adminData.passwordHash,
    );
    if (!isValidPassword) {
      throw new AuthenticationError("Invalid credentials");
    }

    // Generate session token
    const sessionToken = generateSessionToken();
    const tokenHash = await hashToken(sessionToken);

    // Calculate expiry
    const expiresAt = addSeconds(new Date(), this.SESSION_DURATION);

    // Create session
    await db.insert(adminSessions).values({
      adminUserId: adminData.id,
      sessionTokenHash: tokenHash,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      expiresAt: expiresAt.toISOString(),
    });

    // Update last login
    await db
      .update(adminUsers)
      .set({ lastLoginAt: getTimestamp() })
      .where(eq(adminUsers.id, adminData.id));

    // Log audit event
    await auditService.logEvent(env, {
      eventType: "admin_action",
      eventStatus: "success",
      adminUserId: adminData.id,
      ipAddress,
      userAgent,
      eventData: { action: "login", email: adminData.email },
    });

    return { sessionToken, admin: adminData };
  }

  /**
   * Admin logout
   * @param env - Environment bindings
   * @param sessionToken - Session token
   */
  async adminLogout(env: Env, sessionToken: string): Promise<void> {
    const db = drizzle(env.DB);
    const tokenHash = await hashToken(sessionToken);

    // Find and delete session
    const session = await db
      .select()
      .from(adminSessions)
      .where(eq(adminSessions.sessionTokenHash, tokenHash))
      .get();

    if (session) {
      await db.delete(adminSessions).where(eq(adminSessions.id, session.id));

      // Log audit event
      await auditService.logEvent(env, {
        eventType: "admin_action",
        eventStatus: "success",
        adminUserId: session.adminUserId,
        eventData: { action: "logout" },
      });
    }
  }

  /**
   * Verify admin session
   * @param env - Environment bindings
   * @param sessionToken - Session token
   * @returns Admin user
   */
  async verifyAdminSession(env: Env, sessionToken: string): Promise<AdminUser> {
    const db = drizzle(env.DB);
    const tokenHash = await hashToken(sessionToken);

    // Find session
    const session = await db
      .select()
      .from(adminSessions)
      .where(eq(adminSessions.sessionTokenHash, tokenHash))
      .get();

    if (!session) {
      throw new AuthenticationError("Invalid session");
    }

    const sessionData = session as unknown as AdminSession;

    // Check expiration
    if (isExpired(sessionData.expiresAt)) {
      // Delete expired session
      await db
        .delete(adminSessions)
        .where(eq(adminSessions.id, sessionData.id));
      throw new AuthenticationError("Session expired");
    }

    // Get admin user
    const admin = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, sessionData.adminUserId))
      .get();

    if (!admin) {
      throw new AuthenticationError("Admin user not found");
    }

    const adminData = admin as unknown as AdminUser;

    if (!adminData.enabled) {
      throw new AuthenticationError("Admin account is disabled");
    }

    // Update last activity and extend session
    const now = new Date();
    const newExpiresAt = addSeconds(now, this.SESSION_DURATION);

    await db
      .update(adminSessions)
      .set({
        lastActivityAt: getTimestamp(now),
        expiresAt: getTimestamp(newExpiresAt),
      })
      .where(eq(adminSessions.id, sessionData.id));

    return adminData;
  }

  /**
   * Create admin user
   * @param env - Environment bindings
   * @param data - Admin user data
   * @returns Created admin user
   */
  async createAdminUser(
    env: Env,
    data: {
      email: string;
      password: string;
      displayName: string;
      role?: "super_admin" | "admin" | "viewer";
    },
  ): Promise<AdminUser> {
    const db = drizzle(env.DB);

    // Validate role
    const validRoles = ["super_admin", "admin", "viewer"];
    if (data.role && !validRoles.includes(data.role)) {
      throw new Error(`Invalid role. Must be one of: ${validRoles.join(", ")}`);
    }

    // Check if admin with email exists
    const existing = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, data.email))
      .get();

    if (existing) {
      throw new Error("Admin user with this email already exists");
    }

    // Hash password
    const passwordHash = await hashPassword(data.password);

    // Create admin user
    const created = await db
      .insert(adminUsers)
      .values({
        email: data.email,
        passwordHash,
        displayName: data.displayName,
        role: data.role || "admin",
        enabled: true,
        mfaEnabled: false,
      })
      .returning()
      .get();

    return created as unknown as AdminUser;
  }

  /**
   * Update admin user
   * @param env - Environment bindings
   * @param adminId - Admin ID
   * @param updates - Fields to update
   * @returns Updated admin user
   */
  async updateAdminUser(
    env: Env,
    adminId: string,
    updates: {
      email?: string;
      displayName?: string;
      role?: "super_admin" | "admin" | "viewer";
      enabled?: boolean;
    },
  ): Promise<AdminUser> {
    const db = drizzle(env.DB);

    // Validate role if provided
    const validRoles = ["super_admin", "admin", "viewer"];
    if (updates.role && !validRoles.includes(updates.role)) {
      throw new Error(`Invalid role. Must be one of: ${validRoles.join(", ")}`);
    }

    // Check if email is being changed and if it's already taken
    if (updates.email) {
      const existing = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.email, updates.email))
        .get();

      if (existing) {
        const existingUser = existing as unknown as AdminUser;
        if (existingUser.id !== adminId) {
          throw new Error("Admin user with this email already exists");
        }
      }
    }

    const updated = await db
      .update(adminUsers)
      .set(updates as any)
      .where(eq(adminUsers.id, adminId))
      .returning()
      .get();

    if (!updated) {
      throw new NotFoundError("Admin user not found");
    }

    return updated as unknown as AdminUser;
  }

  /**
   * Change admin password
   * @param env - Environment bindings
   * @param adminId - Admin ID
   * @param currentPassword - Current password
   * @param newPassword - New password
   */
  async changeAdminPassword(
    env: Env,
    adminId: string,
    currentPassword?: string,
    newPassword?: string,
  ): Promise<void> {
    const db = drizzle(env.DB);

    if (!newPassword) {
      throw new Error("New password is required");
    }

    // Get admin user
    const admin = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, adminId))
      .get();

    if (!admin) {
      throw new NotFoundError("Admin user not found");
    }

    const adminData = admin as unknown as AdminUser;

    // Verify current password if provided (it should be required for self-service)
    // We allow skipping current password if it's a super admin resetting another user's password,
    // but for now let's enforce it or maybe pass a flag.
    // Given the requirement "existing password", we enforce it.
    if (!currentPassword) {
      throw new Error("Current password is required");
    }

    const isValidPassword = await verifyPassword(
      currentPassword,
      adminData.passwordHash,
    );
    if (!isValidPassword) {
      throw new AuthenticationError("Invalid current password");
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update password
    await db
      .update(adminUsers)
      .set({ passwordHash, updatedAt: getTimestamp() })
      .where(eq(adminUsers.id, adminId));

    // Log audit event
    await auditService.logEvent(env, {
      eventType: "admin_action",
      eventStatus: "success",
      adminUserId: adminId,
      eventData: { action: "change_password" },
    });
  }

  /**
   * List admin users
   * @param env - Environment bindings
   * @returns List of admin users
   */
  async listAdminUsers(env: Env): Promise<AdminUser[]> {
    const db = drizzle(env.DB);

    const admins = await db.select().from(adminUsers).all();
    return admins as unknown as AdminUser[];
  }

  /**
   * Clean up expired sessions
   * @param env - Environment bindings
   */
  async cleanupExpiredSessions(env: Env): Promise<void> {
    const db = drizzle(env.DB);
    const now = new Date().toISOString();

    await db
      .delete(adminSessions)
      .where(sql`${adminSessions.expiresAt} < ${now}`);
  }
}

// Export singleton instance
export const adminAuthService = new AdminAuthService();