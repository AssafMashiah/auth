import { drizzle } from 'drizzle-orm/d1';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { oneTimeTokens } from '../db/schema';
import type { Env, Project, User } from '../types';
import { hashPassword, hashToken, verifyPassword } from '../utils/crypto';
import { AuthenticationError, BadRequestError, ConflictError, NotFoundError } from '../utils/errors';
import { auditService } from './audit-service';
import { authService } from './auth-service';
import { emailConfirmationService } from './email-confirmation-service';
import { emailService } from './email-service';
import { projectService } from './project-service';
import { userService } from './user-service';

/** A way in. One person, one account, however they came in. */
export type WayInType = 'password' | 'google' | 'apple';

export interface WayIn {
  type: WayInType;
  connected: boolean;
  /** The address a connected provider identity is bound to. */
  detail?: string;
}

export interface Device {
  id: string;
  deviceName: string | null;
  userAgent: string | null;
  lastUsedAt: string | null;
  createdAt: string | null;
  /** True for the device the request came from. */
  current: boolean;
}

export interface AccountSummary {
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    displayName: string | null;
    status: string;
    createdAt: string;
  };
  waysIn: WayIn[];
  devices: Device[];
}

export interface SetPasswordInput {
  /** Required when the account already has a password. */
  currentPassword?: string;
  newPassword: string;
  /** The session that stays signed in; every other session ends. */
  keepSessionToken?: string;
}

export interface DeleteAccountInput {
  /** The password, when the account has one. */
  password?: string;
}

const EMAIL_CHANGE_TOKEN_TYPE = 'email_change' as const;
const EMAIL_CHANGE_TTL_SECONDS = 86400; // 24 hours
const PROVIDERS: WayInType[] = ['google', 'apple'];

/**
 * Account Service - the member's own account surface.
 *
 * One person is one account, whichever way they come in. The account holds a list of ways in: a password and the
 * provider identities bound to it. Everything here works on the account that is signed in; it never reaches another
 * account's records.
 */
export class AccountService {
  /**
   * The account, the ways in connected to it and the devices signed in to it.
   */
  async summary(
    env: Env,
    project: Project,
    user: User,
    currentDeviceName?: string | null
  ): Promise<AccountSummary> {
    const sessions = await authService.listSessions(env, project.id, user.id);

    const waysIn: WayIn[] = [{ type: 'password', connected: !!user.passwordHash }];
    for (const provider of PROVIDERS) {
      const connected = user.oauthProvider === provider;
      waysIn.push({
        type: provider,
        connected,
        ...(connected ? { detail: user.email } : {}),
      });
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        displayName: user.displayName,
        status: user.status,
        createdAt: user.createdAt,
      },
      waysIn,
      devices: sessions.map((session) => ({
        id: session.id,
        deviceName: session.deviceName,
        userAgent: session.userAgent,
        lastUsedAt: session.lastUsedAt,
        createdAt: session.createdAt,
        current: !!currentDeviceName && session.deviceName === currentDeviceName,
      })),
    };
  }

  /**
   * Set a first password on an account that has none, or change the one there is. Every other session ends; the
   * session the request came from stays signed in.
   */
  async setPassword(
    env: Env,
    project: Project,
    user: User,
    input: SetPasswordInput,
    context: { ipAddress?: string; userAgent?: string } = {}
  ): Promise<{ user: User }> {
    if (user.passwordHash) {
      if (!input.currentPassword) {
        throw new AuthenticationError('Your current password is required to change it');
      }
      const matches = await verifyPassword(input.currentPassword, user.passwordHash);
      if (!matches) {
        throw new AuthenticationError('Your current password is not correct');
      }
    }

    const passwordHash = await hashPassword(input.newPassword);
    const updated = await userService.updateUser(env, project.userTableName, user.id, {
      passwordHash,
    });

    const sessionsEnded = await authService.endOtherSessions(
      env,
      project.id,
      user.id,
      input.keepSessionToken
    );

    await auditService.logEvent(env, {
      projectId: project.id,
      eventType: 'password_changed',
      eventStatus: 'success',
      userId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      eventData: { firstPassword: !user.passwordHash, sessionsEnded },
    });

    return { user: updated };
  }

  /**
   * Ask for a new address. The sign-in name changes only when the link is used; the old address is told, so a member
   * who changed it by accident finds out.
   */
  async requestEmailChange(
    env: Env,
    project: Project,
    user: User,
    newEmail: string
  ): Promise<{ pendingEmail: string }> {
    const normalised = newEmail.trim().toLowerCase();

    if (normalised === user.email.toLowerCase()) {
      throw new BadRequestError('That is the address you already use');
    }
    const taken = await userService.getUserByEmail(env, project.userTableName, normalised);
    if (taken) {
      throw new ConflictError('That address is already used by another account');
    }

    const token = nanoid(32);
    const tokenHash = await hashToken(token);
    const now = Math.floor(Date.now() / 1000);
    const db = drizzle(env.DB);
    await db.insert(oneTimeTokens).values({
      projectId: project.id,
      userId: user.id,
      email: normalised,
      tokenHash,
      tokenType: EMAIL_CHANGE_TOKEN_TYPE,
      payload: JSON.stringify({ previousEmail: user.email }),
      expiresAt: now + EMAIL_CHANGE_TTL_SECONDS,
      usedAt: null,
      createdAt: now,
      attempts: 0,
    });

    const baseUrl = project.siteUrl || env.EMAIL_CONFIRMATION_BASE_URL;
    if (!baseUrl) {
      throw new BadRequestError('No site address is configured for this project');
    }
    const confirmationUrl = `${baseUrl}/confirm-email-change?token=${token}`;

    // The new address gets the link that changes the sign-in name.
    await emailService.sendProjectTemplate(env, normalised, project.id, 'email_change', {
      project_name: project.name,
      app_name: project.name,
      action_url: confirmationUrl,
      confirmation_url: confirmationUrl,
      new_email: normalised,
      old_email: user.email,
    });

    // The old address is told, so a change by accident is found out.
    await emailService.sendProjectTemplate(env, user.email, project.id, 'email_changed', {
      project_name: project.name,
      app_name: project.name,
      new_email: normalised,
      old_email: user.email,
    });

    await auditService.logEvent(env, {
      projectId: project.id,
      eventType: 'email_change_requested',
      eventStatus: 'success',
      userId: user.id,
      eventData: { previousEmail: user.email, newEmail: normalised },
    });

    return { pendingEmail: normalised };
  }

  /**
   * Apply the change the link carries. The history, the plan and the backup stay where they are; only the sign-in
   * name and where the messages go change.
   */
  async confirmEmailChange(
    env: Env,
    projectId: string,
    token: string
  ): Promise<{ email: string; previousEmail: string }> {
    const db = drizzle(env.DB);
    const tokenHash = await hashToken(token);
    const record = await db
      .select()
      .from(oneTimeTokens)
      .where(
        and(
          eq(oneTimeTokens.projectId, projectId),
          eq(oneTimeTokens.tokenHash, tokenHash),
          eq(oneTimeTokens.tokenType, EMAIL_CHANGE_TOKEN_TYPE)
        )
      )
      .get();

    if (!record) throw new AuthenticationError('This link is not valid');
    if (record.usedAt !== null) throw new AuthenticationError('This link has already been used');
    const now = Math.floor(Date.now() / 1000);
    if (now > record.expiresAt) throw new AuthenticationError('This link has expired');

    const payload = record.payload ? JSON.parse(record.payload) : {};
    const previousEmail: string = payload.previousEmail || record.email;

    const project = await projectService.getProject(env, projectId);
    if (!project) throw new NotFoundError('Project not found');

    await userService.updateUser(env, project.userTableName, record.userId as string, {
      email: record.email,
      emailVerified: true,
    });

    await db
      .update(oneTimeTokens)
      .set({ usedAt: now })
      .where(eq(oneTimeTokens.id, record.id));

    await auditService.logEvent(env, {
      projectId,
      eventType: 'email_changed',
      eventStatus: 'success',
      userId: record.userId as string,
      eventData: { previousEmail, newEmail: record.email },
    });

    return { email: record.email, previousEmail };
  }

  /**
   * Remove a provider identity from the account. Refused when the account would be left with no way in.
   */
  async disconnectProvider(
    env: Env,
    project: Project,
    user: User,
    provider: string
  ): Promise<{ user: User }> {
    if (!PROVIDERS.includes(provider as WayInType)) {
      throw new BadRequestError('That is not a way in to disconnect');
    }
    if (user.oauthProvider !== provider) {
      throw new BadRequestError(`${provider} is not connected to this account`);
    }
    if (!user.passwordHash) {
      throw new BadRequestError(
        'Set a password before you disconnect this, or you will not be able to sign in again'
      );
    }

    const updated = await userService.updateUser(env, project.userTableName, user.id, {
      oauthProvider: null,
      oauthProviderUserId: null,
      oauthRawUserData: null,
    });

    await auditService.logEvent(env, {
      projectId: project.id,
      eventType: 'oauth_unlinked',
      eventStatus: 'success',
      userId: user.id,
      eventData: { provider },
    });

    return { user: updated };
  }

  /**
   * Send the confirmation message again. The address is used for nothing else.
   */
  async resendConfirmation(env: Env, project: Project, user: User): Promise<void> {
    if (user.emailVerified) {
      throw new BadRequestError('This address is already confirmed');
    }
    const baseUrl = project.siteUrl || env.EMAIL_CONFIRMATION_BASE_URL;
    if (!baseUrl) {
      throw new BadRequestError('No site address is configured for this project');
    }

    const { token } = await emailConfirmationService.createConfirmationToken(
      env,
      project.id,
      user.id,
      user.email
    );
    await emailService.sendConfirmationEmail(
      env,
      user.email,
      project.name,
      `${baseUrl}/confirm-email?token=${token}`,
      project.id
    );
  }

  /**
   * Delete the account: every session ends and the identity goes, and a record that the account existed stays
   * without the name, the address, the password or the connected identity.
   */
  async deleteAccount(
    env: Env,
    project: Project,
    user: User,
    input: DeleteAccountInput
  ): Promise<void> {
    if (user.passwordHash) {
      if (!input.password) {
        throw new AuthenticationError('Your password is required to delete the account');
      }
      const matches = await verifyPassword(input.password, user.passwordHash);
      if (!matches) {
        throw new AuthenticationError('Your password is not correct');
      }
    }

    await authService.revokeAllUserTokens(env, project.id, user.id);

    await userService.removeIdentity(env, project.userTableName, user.id);

    await auditService.logEvent(env, {
      projectId: project.id,
      eventType: 'user_deleted',
      eventStatus: 'success',
      userId: user.id,
      eventData: { by: 'member' },
    });
  }
}

export const accountService = new AccountService();
