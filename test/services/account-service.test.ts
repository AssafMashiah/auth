import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountService } from '../../src/services/account-service';
import { authService } from '../../src/services/auth-service';
import { emailService } from '../../src/services/email-service';
import { projectService } from '../../src/services/project-service';
import { hashPassword, hashToken } from '../../src/utils/crypto';
import type { Env, Project, User } from '../../src/types';

/**
 * The member's own account surface, against a real SQLite database built from the migrations.
 * The email is the only thing mocked; everything else is the real service.
 */
function d1(sqlite: DatabaseSync) {
  return {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      let params: SQLInputValue[] = [];
      return {
        bind(...values: SQLInputValue[]) { params = values; return this; },
        async run() { return { success: true, meta: statement.run(...params) }; },
        async all() { return { results: statement.all(...params) }; },
        async first() { return statement.get(...params) ?? null; },
        async raw() {
          statement.setReturnArrays(true);
          return statement.all(...params);
        },
      };
    },
  };
}

const USER_TABLE = 'calisthenics_care_users';

const USER_TABLE_DDL = `
  CREATE TABLE ${USER_TABLE} (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    email_verified INTEGER DEFAULT 0,
    phone TEXT,
    phone_verified INTEGER DEFAULT 0,
    password_hash TEXT,
    oauth_provider TEXT,
    oauth_provider_user_id TEXT,
    oauth_raw_user_data TEXT,
    display_name TEXT,
    avatar_url TEXT,
    metadata TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT,
    UNIQUE(oauth_provider, oauth_provider_user_id)
  );
`;

const project: Project = {
  id: 'calisthenics_care',
  name: 'Calisthenics Care',
  description: null,
  environment: 'production',
  jwtSecret: 'fixture-jwt',
  jwtAlgorithm: 'HS256',
  jwtExpirySeconds: 3600,
  refreshTokenExpirySeconds: 604800,
  enabled: true,
  userTableName: USER_TABLE,
  siteUrl: 'https://health.sharpthought.app',
  redirectUrls: null,
  createdAt: '2026-01-01 00:00:00',
  updatedAt: '2026-01-01 00:00:00',
  createdBy: null,
};

describe('AccountService', () => {
  let sqlite: DatabaseSync;
  let env: Env;
  const service = new AccountService();

  const insertUser = (overrides: Partial<User> = {}) => {
    const user: User = {
      id: 'user-1',
      email: 'member@example.com',
      emailVerified: true,
      phone: null,
      phoneVerified: false,
      passwordHash: null,
      oauthProvider: 'google',
      oauthProviderUserId: 'google-sub-1',
      oauthRawUserData: null,
      displayName: 'Member',
      avatarUrl: null,
      metadata: null,
      status: 'active',
      createdAt: '2026-01-01 00:00:00',
      updatedAt: '2026-01-01 00:00:00',
      lastLoginAt: null,
      ...overrides,
    };
    sqlite.prepare(
      `INSERT INTO ${USER_TABLE}
       (id, email, email_verified, password_hash, oauth_provider, oauth_provider_user_id, display_name, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`
    ).run(
      user.id, user.email, user.emailVerified ? 1 : 0, user.passwordHash,
      user.oauthProvider, user.oauthProviderUserId, user.displayName
    );
    return user;
  };

  const insertSession = (id: string, userId: string, deviceName: string | null, revoked = false) => {
    sqlite.prepare(
      `INSERT INTO refresh_tokens
       (id, project_id, user_id, token_hash, device_name, user_agent, ip_address, expires_at, revoked, created_at, last_used_at)
       VALUES (?, 'calisthenics_care', ?, ?, ?, 'fixture-agent', '127.0.0.1', ?, ?, '2026-01-01 00:00:00', '2026-01-02 00:00:00')`
    ).run(id, userId, `${id}-hash`, deviceName, new Date(Date.now() + 86400000).toISOString(), revoked ? 1 : 0);
  };

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
    for (const file of readdirSync('migrations').filter(name => name.endsWith('.sql')).sort()) {
      sqlite.exec(readFileSync(join('migrations', file), 'utf8'));
    }
    sqlite.exec(USER_TABLE_DDL);
    sqlite.exec(
      `INSERT INTO projects (id, name, jwt_secret, user_table_name, site_url)
       VALUES ('calisthenics_care', 'Calisthenics Care', 'fixture-jwt', '${USER_TABLE}', 'https://health.sharpthought.app')`
    );
    env = {
      DB: d1(sqlite),
      EMAIL_CONFIRMATION_BASE_URL: 'https://health.sharpthought.app',
    } as unknown as Env;
    vi.spyOn(projectService, 'getProject').mockResolvedValue(project);
    vi.spyOn(emailService, 'sendProjectTemplate').mockResolvedValue(undefined);
    vi.spyOn(emailService, 'sendConfirmationEmail').mockResolvedValue(undefined);
  });
  afterEach(() => { vi.restoreAllMocks(); sqlite.close(); });

  describe('summary', () => {
    it('lists the ways in and the devices, and marks the one the request came from', async () => {
      const user = insertUser();
      insertSession('session-1', user.id, 'Member iPhone');
      insertSession('session-2', user.id, 'Member iPad');
      insertSession('session-old', user.id, 'Old phone', true);

      const summary = await service.summary(env, project, user, 'Member iPhone');

      expect(summary.waysIn).toEqual([
        { type: 'password', connected: false },
        { type: 'google', connected: true, detail: 'member@example.com' },
        { type: 'apple', connected: false },
      ]);
      expect(summary.devices.map(device => device.id)).toEqual(['session-1', 'session-2']);
      expect(summary.devices.map(device => device.current)).toEqual([true, false]);
      expect(summary.user.email).toBe('member@example.com');
    });

    it('leaves the current device unmarked when the request names no device', async () => {
      const user = insertUser();
      insertSession('session-1', user.id, 'Member iPhone');

      const summary = await service.summary(env, project, user);

      expect(summary.devices[0].current).toBe(false);
    });
  });

  describe('setPassword', () => {
    it('sets a first password on an account that has none', async () => {
      const user = insertUser();

      const result = await service.setPassword(env, project, user, { newPassword: 'StrongPass1' });

      expect(result.user.passwordHash).toBeTruthy();
      expect(await (await import('../../src/utils/crypto')).verifyPassword('StrongPass1', result.user.passwordHash!)).toBe(true);
    });

    it('asks for the current password when the account has one', async () => {
      const user = insertUser({ passwordHash: await hashPassword('OldPass1'), oauthProvider: null });

      await expect(service.setPassword(env, project, user, { newPassword: 'NewPass1' }))
        .rejects.toThrow('Your current password is required to change it');
      await expect(service.setPassword(env, project, user, { currentPassword: 'WrongPass1', newPassword: 'NewPass1' }))
        .rejects.toThrow('Your current password is not correct');
    });

    it('ends the other sessions and leaves the one it came from signed in', async () => {
      const user = insertUser();
      insertSession('session-1', user.id, 'Member iPhone');
      insertSession('session-2', user.id, 'Member iPad');
      const keepToken = 'keep-me';
      sqlite.prepare(
        `UPDATE refresh_tokens SET token_hash = ? WHERE id = 'session-1'`
      ).run(await hashToken(keepToken));

      const ended = await authService.endOtherSessions(env, project.id, user.id, keepToken);

      expect(ended).toBe(1);
      const rows = sqlite.prepare(`SELECT id, revoked FROM refresh_tokens ORDER BY id`).all() as any[];
      expect(rows.find(row => row.id === 'session-1').revoked).toBe(0);
      expect(rows.find(row => row.id === 'session-2').revoked).toBe(1);
    });
  });

  describe('requestEmailChange', () => {
    it('sends the link to the new address and tells the old one', async () => {
      const user = insertUser();

      const result = await service.requestEmailChange(env, project, user, 'New@Example.com');

      expect(result.pendingEmail).toBe('new@example.com');
      const sent = vi.mocked(emailService.sendProjectTemplate).mock.calls;
      expect(sent[0][1]).toBe('new@example.com');
      expect(sent[0][3]).toBe('email_change');
      expect(sent[1][1]).toBe('member@example.com');
      expect(sent[1][3]).toBe('email_changed');
      const token = sqlite.prepare(`SELECT token_hash, payload FROM one_time_tokens WHERE token_type = 'email_change'`).get() as any;
      expect(JSON.parse(token.payload).previousEmail).toBe('member@example.com');
    });

    it('refuses the address already in use and one another account holds', async () => {
      const user = insertUser();
      await expect(service.requestEmailChange(env, project, user, 'member@example.com'))
        .rejects.toThrow('That is the address you already use');
      insertUser({ id: 'user-2', email: 'taken@example.com', oauthProvider: null, oauthProviderUserId: null });
      await expect(service.requestEmailChange(env, project, user, 'taken@example.com'))
        .rejects.toThrow('That address is already used by another account');
    });
  });

  describe('confirmEmailChange', () => {
    it('changes the sign-in name and keeps the rest of the account', async () => {
      const user = insertUser({ oauthProvider: 'google' });
      const { pendingEmail } = await service.requestEmailChange(env, project, user, 'new@example.com');
      const token = (await vi.mocked(emailService.sendProjectTemplate).mock.calls[0][4]).action_url!.split('token=')[1];

      const result = await service.confirmEmailChange(env, project.id, token);

      expect(result.email).toBe(pendingEmail);
      const row = sqlite.prepare(`SELECT email, email_verified, display_name, oauth_provider FROM ${USER_TABLE} WHERE id = ?`).get(user.id) as any;
      expect(row.email).toBe('new@example.com');
      expect(row.email_verified).toBe(1);
      expect(row.display_name).toBe('Member');
      expect(row.oauth_provider).toBe('google');
    });

    it('refuses a link that was already used', async () => {
      const user = insertUser();
      await service.requestEmailChange(env, project, user, 'new@example.com');
      const token = (await vi.mocked(emailService.sendProjectTemplate).mock.calls[0][4]).action_url!.split('token=')[1];

      await service.confirmEmailChange(env, project.id, token);

      await expect(service.confirmEmailChange(env, project.id, token))
        .rejects.toThrow('This link has already been used');
    });

    it('refuses a link that was never sent', async () => {
      await expect(service.confirmEmailChange(env, project.id, 'not-a-token'))
        .rejects.toThrow('This link is not valid');
    });
  });

  describe('disconnectProvider', () => {
    it('refuses when the account would be left with no way in', async () => {
      const user = insertUser({ passwordHash: null });

      await expect(service.disconnectProvider(env, project, user, 'google'))
        .rejects.toThrow('Set a password before you disconnect this');
    });

    it('removes the identity when the account has a password', async () => {
      const user = insertUser({ passwordHash: await hashPassword('StrongPass1') });

      const result = await service.disconnectProvider(env, project, user, 'google');

      expect(result.user.oauthProvider).toBeNull();
      expect(result.user.oauthProviderUserId).toBeNull();
    });

    it('refuses a way in that is not connected', async () => {
      const user = insertUser({ passwordHash: await hashPassword('StrongPass1') });

      await expect(service.disconnectProvider(env, project, user, 'apple'))
        .rejects.toThrow('apple is not connected to this account');
    });
  });

  describe('deleteAccount', () => {
    it('ends every session and leaves only the record that the account existed', async () => {
      const user = insertUser({ passwordHash: await hashPassword('StrongPass1') });
      insertSession('session-1', user.id, 'Member iPhone');

      await service.deleteAccount(env, project, user, { password: 'StrongPass1' });

      const row = sqlite.prepare(`SELECT email, display_name, password_hash, oauth_provider, status FROM ${USER_TABLE} WHERE id = ?`).get(user.id) as any;
      expect(row.email).toBe(`deleted-${user.id}@deleted.invalid`);
      expect(row.display_name).toBeNull();
      expect(row.password_hash).toBeNull();
      expect(row.oauth_provider).toBeNull();
      expect(row.status).toBe('deleted');
      const sessions = sqlite.prepare(`SELECT revoked FROM refresh_tokens`).all() as any[];
      expect(sessions[0].revoked).toBe(1);
    });

    it('asks for the password when the account has one', async () => {
      const user = insertUser({ passwordHash: await hashPassword('StrongPass1') });

      await expect(service.deleteAccount(env, project, user, {}))
        .rejects.toThrow('Your password is required to delete the account');
      await expect(service.deleteAccount(env, project, user, { password: 'WrongPass1' }))
        .rejects.toThrow('Your password is not correct');
    });

    it('deletes an account that only has a provider identity', async () => {
      const user = insertUser({ passwordHash: null });

      await service.deleteAccount(env, project, user, {});

      const row = sqlite.prepare(`SELECT status FROM ${USER_TABLE} WHERE id = ?`).get(user.id) as any;
      expect(row.status).toBe('deleted');
    });
  });
});
