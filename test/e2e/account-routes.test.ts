import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/index';
import { jwtService } from '../../src/services/jwt-service';
import { emailService } from '../../src/services/email-service';
import { hashPassword } from '../../src/utils/crypto';
import type { Env, Project } from '../../src/types';

/**
 * The account routes, over the real service and a real SQLite database built from the migrations.
 * Only the email is mocked.
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

describe('Account routes', () => {
  let sqlite: DatabaseSync;
  let env: Env;
  let token: string;

  const request = (method: string, path: string, body?: any, auth = true) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth && token) headers.Authorization = `Bearer ${token}`;
    return app.fetch(
      new Request(`http://localhost${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env
    );
  };

  const insertUser = (overrides: Record<string, any> = {}) => {
    sqlite.prepare(
      `INSERT INTO ${USER_TABLE}
       (id, email, email_verified, password_hash, oauth_provider, oauth_provider_user_id, display_name, status)
       VALUES ('user-1', 'member@example.com', 1, NULL, 'google', 'google-sub-1', 'Member', 'active')`
    ).run();
    for (const [column, value] of Object.entries(overrides)) {
      sqlite.prepare(`UPDATE ${USER_TABLE} SET ${column} = ? WHERE id = 'user-1'`).run(value);
    }
  };

  beforeEach(async () => {
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
    vi.spyOn(emailService, 'sendProjectTemplate').mockResolvedValue(undefined);
    vi.spyOn(emailService, 'sendConfirmationEmail').mockResolvedValue(undefined);
  });
  afterEach(() => { vi.restoreAllMocks(); sqlite.close(); });

  it('refuses the account routes without an access token', async () => {
    const response = await request('GET', '/api/auth/calisthenics_care/account', undefined, false);
    expect(response.status).toBe(401);
  });

  it('answers the ways in and the devices', async () => {
    insertUser();
    token = await jwtService.generateAccessToken(project, 'user-1', 'member@example.com');

    const response = await request('GET', '/api/auth/calisthenics_care/account');
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.waysIn).toEqual([
      { type: 'password', connected: false },
      { type: 'google', connected: true, detail: 'member@example.com' },
      { type: 'apple', connected: false },
    ]);
    expect(body.data.devices).toEqual([]);
  });

  it('sets a first password', async () => {
    insertUser();
    token = await jwtService.generateAccessToken(project, 'user-1', 'member@example.com');

    const response = await request('POST', '/api/auth/calisthenics_care/account/password', {
      newPassword: 'StrongPass1',
    });

    expect(response.status).toBe(200);
    const row = sqlite.prepare(`SELECT password_hash FROM ${USER_TABLE}`).get() as any;
    expect(row.password_hash).toBeTruthy();
  });

  it('refuses a password that breaks the rules', async () => {
    insertUser();
    token = await jwtService.generateAccessToken(project, 'user-1', 'member@example.com');

    const response = await request('POST', '/api/auth/calisthenics_care/account/password', {
      newPassword: 'short',
    });

    expect(response.status).toBe(400);
  });

  it('refuses to disconnect the only way in', async () => {
    insertUser();
    token = await jwtService.generateAccessToken(project, 'user-1', 'member@example.com');

    const response = await request('POST', '/api/auth/calisthenics_care/account/provider/disconnect', {
      provider: 'google',
    });
    const body = await response.json() as any;

    expect(response.status).toBe(400);
    expect(body.error).toContain('Set a password before you disconnect this');
  });

  it('disconnects a way in when the account has a password', async () => {
    insertUser({ password_hash: await hashPassword('StrongPass1') });
    token = await jwtService.generateAccessToken(project, 'user-1', 'member@example.com');

    const response = await request('POST', '/api/auth/calisthenics_care/account/provider/disconnect', {
      provider: 'google',
    });

    expect(response.status).toBe(200);
    const row = sqlite.prepare(`SELECT oauth_provider FROM ${USER_TABLE}`).get() as any;
    expect(row.oauth_provider).toBeNull();
  });

  it('ends every session', async () => {
    insertUser();
    token = await jwtService.generateAccessToken(project, 'user-1', 'member@example.com');
    sqlite.prepare(
      `INSERT INTO refresh_tokens (id, project_id, user_id, token_hash, expires_at, revoked)
       VALUES ('session-1', 'calisthenics_care', 'user-1', 'hash-1', ?, 0)`
    ).run(new Date(Date.now() + 86400000).toISOString());

    const response = await request('POST', '/api/auth/calisthenics_care/account/sessions/end-all');

    expect(response.status).toBe(200);
    const row = sqlite.prepare(`SELECT revoked FROM refresh_tokens WHERE id = 'session-1'`).get() as any;
    expect(row.revoked).toBe(1);
  });

  it('asks for a new address and applies it when the link is used', async () => {
    insertUser();
    token = await jwtService.generateAccessToken(project, 'user-1', 'member@example.com');

    const asked = await request('POST', '/api/auth/calisthenics_care/account/email', {
      newEmail: 'new@example.com',
    });
    expect(asked.status).toBe(200);

    const link = (vi.mocked(emailService.sendProjectTemplate).mock.calls[0][4]).action_url!;
    const confirmed = await request('GET', `/api/auth/calisthenics_care/account/email/confirm?token=${link.split('token=')[1]}`, undefined, false);

    expect(confirmed.status).toBe(200);
    const row = sqlite.prepare(`SELECT email FROM ${USER_TABLE}`).get() as any;
    expect(row.email).toBe('new@example.com');
  });

  it('deletes the account', async () => {
    insertUser({ password_hash: await hashPassword('StrongPass1') });
    token = await jwtService.generateAccessToken(project, 'user-1', 'member@example.com');

    const response = await request('DELETE', '/api/auth/calisthenics_care/account', { password: 'StrongPass1' });

    expect(response.status).toBe(200);
    const row = sqlite.prepare(`SELECT status, email, oauth_provider FROM ${USER_TABLE}`).get() as any;
    expect(row.status).toBe('deleted');
    expect(row.email).toBe('deleted-user-1@deleted.invalid');
    expect(row.oauth_provider).toBeNull();
  });
});
