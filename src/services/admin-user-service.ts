import type { Env, User } from '../types';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { userService } from './user-service';
import { projectService } from './project-service';
import { passwordResetService } from './password-reset-service';
import { emailService } from './email-service';
import { auditService } from './audit-service';

/**
 * Admin user management helpers.
 *
 * These functions back the A1-A4 admin endpoints in src/index.ts. The HTTP
 * routes stay thin wrappers that call these helpers, so the business logic
 * (provider mapping, status transitions, audit logging) is testable in
 * isolation.
 */

export interface UserListRow {
  id: string;
  email: string;
  displayName: string | null;
  status: User['status'];
  lastLoginAt: string | null;
  providers: string[];
}

export interface UserProviderEntry {
  provider: string;
  linkedAt: string;
}

export interface UserDetailRow extends Omit<UserListRow, 'providers'> {
  providers: UserProviderEntry[];
  emailVerified: boolean;
  phoneVerified: boolean;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Compute the list-view providers array (string array, deduped, no nulls).
 *
 * Rules:
 * - "password" included if passwordHash is set
 * - The oauthProvider value (google/github/microsoft) included when set
 * - Order: password first, then oauth provider
 */
export function computeProviders(user: Pick<User, 'passwordHash' | 'oauthProvider'>): string[] {
  const out: string[] = [];
  if (user.passwordHash) {
    out.push('password');
  }
  if (user.oauthProvider) {
    out.push(user.oauthProvider);
  }
  return out;
}

/**
 * Format a user row for the admin list endpoint (A1).
 */
export function formatUserListRow(user: User): UserListRow {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    providers: computeProviders(user),
  };
}

/**
 * Format a user row for the admin detail endpoint (A2) with expanded
 * providers (provider + linkedAt).
 */
export function formatUserDetailRow(user: User): UserDetailRow {
  const providers: UserProviderEntry[] = [];
  if (user.passwordHash) {
    providers.push({ provider: 'password', linkedAt: user.createdAt });
  }
  if (user.oauthProvider) {
    providers.push({ provider: user.oauthProvider, linkedAt: user.createdAt });
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    providers,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Change a user's status (active <-> suspended). Rejects "deleted" via
 * API; admin should use the dedicated DELETE flow.
 *
 * Returns the updated user in A1 list-row shape.
 */
export async function changeUserStatus(
  env: Env,
  projectId: string,
  tableName: string,
  userId: string,
  args: { status: 'active' | 'suspended' | 'deleted'; reason?: string }
): Promise<UserListRow> {
  if (args.status === 'deleted') {
    throw new BadRequestError('Use the delete flow to mark a user deleted');
  }

  const previous = await userService.getUserById(env, tableName, userId);
  if (!previous) {
    throw new NotFoundError('User not found');
  }

  const updated = await userService.updateUser(env, tableName, userId, {
    status: args.status,
  });

  await auditService.logEvent(env, {
    projectId,
    eventType: 'user_status_changed',
    eventStatus: 'success',
    userId,
    eventData: {
      from: previous.status,
      to: args.status,
      reason: args.reason ?? null,
    },
  });

  return formatUserListRow(updated);
}

/**
 * Initiate a password reset on behalf of a user (admin action).
 *
 * Bypasses the password_reset rate limit (the caller is an authenticated
 * admin). Writes an audit log entry. Returns only a generic message
 * (never the token or URL).
 */
export async function initiateAdminPasswordReset(
  env: Env,
  projectId: string,
  tableName: string,
  userId: string,
  meta: { ipAddress?: string; userAgent?: string; adminUserId: string }
): Promise<{ message: string }> {
  const project = await projectService.getProject(env, projectId);
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  const user = await userService.getUserById(env, tableName, userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const { token } = await passwordResetService.createResetToken(
    env,
    projectId,
    user.id,
    user.email
  );

  const baseUrl = project.siteUrl || env.PASSWORD_RESET_BASE_URL;
  if (!baseUrl) {
    throw new Error(
      'No siteUrl configured for project and no PASSWORD_RESET_BASE_URL env variable set'
    );
  }
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  await emailService.sendPasswordResetEmail(
    env,
    user.email,
    resetUrl,
    project.name,
    projectId
  );

  await auditService.logEvent(env, {
    projectId,
    eventType: 'admin_initiated_password_reset',
    eventStatus: 'success',
    userId: user.id,
    adminUserId: meta.adminUserId,
    ipAddress: meta.ipAddress ?? undefined,
    userAgent: meta.userAgent ?? undefined,
    eventData: { targetUserId: user.id },
  });

  return { message: 'Reset email sent' };
}