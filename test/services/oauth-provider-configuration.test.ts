import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OAuthService } from '../../src/services/oauth-service';
import { projectService } from '../../src/services/project-service';
import { decrypt } from '../../src/utils/crypto';
import type { CreateOAuthProviderData, Env } from '../../src/types';

// Execute real Drizzle-generated SQL against an isolated SQLite database, using
// the subset of D1's statement interface exercised by this service. No remote DB.
function d1(sqlite: DatabaseSync) {
  return {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      let params: SQLInputValue[] = [];
      return {
        bind(...values: SQLInputValue[]) { params = values; return this; },
        async run() { return { success: true, meta: statement.run(...params) }; },
        async all() { return { results: statement.all(...params) }; },
        async raw() {
          statement.setReturnArrays(true);
          return statement.all(...params);
        },
      };
    },
  };
}
const REDIRECT = 'https://health.sharpthought.app/auth/google/callback';
const credentials: CreateOAuthProviderData = {
  projectId: 'calisthenics_care', providerName: 'google',
  clientId: 'fixture-client', clientSecret: 'fixture-secret',
};
const custom = {
  authorizationUrl: 'https://identity.example.com/authorize',
  tokenUrl: 'https://identity.example.com/token',
  userInfoUrl: 'https://identity.example.com/me',
  scopes: ['openid', 'custom:read'], additionalConfig: { prompt: 'consent', nested: { value: true } },
};

describe('OAuth provider configuration persistence', () => {
  let sqlite: DatabaseSync;
  let env: Env;
  const service = new OAuthService();
  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec(readFileSync('migrations/0000_initial.sql', 'utf8'));
    sqlite.exec("INSERT INTO projects (id, name, jwt_secret, user_table_name) VALUES ('calisthenics_care', 'Care', 'fixture-jwt', 'users_care'), ('other', 'Other', 'fixture-jwt', 'users_other')");
    env = { DB: d1(sqlite), ENCRYPTION_KEY: 'fixture-encryption-key' } as unknown as Env;
    vi.spyOn(projectService, 'getProject').mockResolvedValue({ id: credentials.projectId } as any);
  });
  afterEach(() => { vi.restoreAllMocks(); sqlite.close(); });

  it('replaces an encrypted secret with the exact admin payload while preserving configuration and identity', async () => {
    const original = await service.configureProvider(env, { ...credentials, ...custom });
    const updated = await service.configureProvider(env, { ...credentials, clientSecret: 'replacement-fixture', enabled: true });
    expect(updated).toMatchObject({ ...original, clientSecret: expect.any(String), updatedAt: expect.any(String) });
    expect(updated.clientSecret).not.toBe(original.clientSecret);
    expect(updated.clientSecret).not.toBe('replacement-fixture');
    expect(await decrypt(updated.clientSecret, env.ENCRYPTION_KEY!)).toBe('replacement-fixture');
    const url = new URL(await service.getAuthUrl(env, credentials.projectId, 'google', REDIRECT, 'fixture-state'));
    expect(url.origin + url.pathname).toBe(custom.authorizationUrl);
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(url.searchParams.get('scope')).toBe('openid custom:read');
  });

  it('preserves disabled status when omitted, and accepts an explicit status change', async () => {
    await service.configureProvider(env, { ...credentials, enabled: false });
    expect((await service.configureProvider(env, credentials)).enabled).toBe(false);
    expect((await service.configureProvider(env, { ...credentials, enabled: true })).enabled).toBe(true);
  });

  it.each(['google', 'github', 'microsoft', 'custom'] as const)('preserves custom configuration for %s', async providerName => {
    const original = await service.configureProvider(env, { ...credentials, providerName, ...custom });
    const updated = await service.configureProvider(env, { ...credentials, providerName, clientSecret: 'new-fixture' });
    expect(updated).toMatchObject({ id: original.id, ...custom, scopes: JSON.stringify(custom.scopes), additionalConfig: JSON.stringify(custom.additionalConfig) });
  });

  it.each([
    ['google', 'https://accounts.google.com/o/oauth2/v2/auth', 'https://oauth2.googleapis.com/token', 'https://www.googleapis.com/oauth2/v2/userinfo'],
    ['github', 'https://github.com/login/oauth/authorize', 'https://github.com/login/oauth/access_token', 'https://api.github.com/user'],
    ['microsoft', 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', 'https://login.microsoftonline.com/common/oauth2/v2.0/token', 'https://graph.microsoft.com/v1.0/me'],
  ] as const)('recovers missing %s endpoints on credential replacement', async (providerName, authorizationUrl, tokenUrl, userInfoUrl) => {
    const data = { ...credentials, providerName };
    await service.configureProvider(env, data);
    sqlite.exec("UPDATE project_oauth_providers SET authorization_url = NULL, token_url = '', user_info_url = '   '");
    const recovered = await service.configureProvider(env, data);
    expect(recovered).toMatchObject({ authorizationUrl, tokenUrl, userInfoUrl });
    if (providerName === 'google') {
      expect(await service.getAuthUrl(env, data.projectId, providerName, REDIRECT, 'state')).toMatch(/^https:\/\/accounts.google.com\//);
    }
  });

  it('recovers only the missing endpoint and leaves existing overrides untouched', async () => {
    await service.configureProvider(env, { ...credentials, ...custom });
    sqlite.exec('UPDATE project_oauth_providers SET token_url = NULL');
    expect(await service.configureProvider(env, credentials)).toMatchObject({
      authorizationUrl: custom.authorizationUrl, tokenUrl: 'https://oauth2.googleapis.com/token', userInfoUrl: custom.userInfoUrl,
    });
  });

  it('persists explicit replacements and empty collections, including across later omitted updates', async () => {
    await service.configureProvider(env, { ...credentials, ...custom });
    const replacement = { authorizationUrl: 'https://new.example.com/auth', scopes: [], additionalConfig: {} };
    expect(await service.configureProvider(env, { ...credentials, ...replacement })).toMatchObject({
      authorizationUrl: replacement.authorizationUrl, scopes: '[]', additionalConfig: '{}', tokenUrl: custom.tokenUrl,
    });
    expect(await service.configureProvider(env, credentials)).toMatchObject({ scopes: '[]', additionalConfig: '{}' });
  });

  it('preserves existing null scopes/configuration rather than inventing replacements', async () => {
    await service.configureProvider(env, credentials);
    sqlite.exec('UPDATE project_oauth_providers SET scopes = NULL, additional_config = NULL');
    expect(await service.configureProvider(env, credentials)).toMatchObject({ scopes: null, additionalConfig: null });
  });

  it('uses defaults on insert but honors explicit empty collections', async () => {
    expect(await service.configureProvider(env, credentials)).toMatchObject({ enabled: true, scopes: '["email","profile","openid"]', additionalConfig: null });
    expect(await service.configureProvider(env, { ...credentials, projectId: 'other', scopes: [], additionalConfig: {} })).toMatchObject({ scopes: '[]', additionalConfig: '{}' });
  });

  it.each([
    { authorizationUrl: '' }, { tokenUrl: '' }, { userInfoUrl: '' },
    { authorizationUrl: null }, { tokenUrl: null }, { userInfoUrl: null },
    { scopes: null }, { additionalConfig: null },
  ])('rejects invalid explicit empties without changing the row: %j', async invalid => {
    const original = await service.configureProvider(env, { ...credentials, ...custom });
    await expect(service.configureProvider(env, { ...credentials, ...invalid } as CreateOAuthProviderData)).rejects.toThrow('Invalid OAuth provider configuration');
    const stored = sqlite.prepare('SELECT client_secret, authorization_url FROM project_oauth_providers').get();
    expect(stored).toEqual({ client_secret: original.clientSecret, authorization_url: original.authorizationUrl });
  });

  it.each([null, custom.authorizationUrl])('repairs missing Care Google endpoints with auth URL %s, preserves other data, and is idempotent', async authorizationUrl => {
    await service.configureProvider(env, { ...credentials, ...custom, enabled: false });
    await service.configureProvider(env, { ...credentials, projectId: 'other' });
    await service.configureProvider(env, { ...credentials, providerName: 'github' });
    sqlite.exec("UPDATE project_oauth_providers SET token_url = NULL, user_info_url = ''");
    sqlite.prepare("UPDATE project_oauth_providers SET authorization_url = ? WHERE project_id = 'calisthenics_care' AND provider_name = 'google'").run(authorizationUrl);
    sqlite.exec("CREATE TABLE users_care (id TEXT, oauth_provider TEXT, oauth_provider_user_id TEXT); INSERT INTO users_care VALUES ('fixture-user', 'google', 'fixture-sub')");
    const rows = () => sqlite.prepare('SELECT * FROM project_oauth_providers ORDER BY id').all();
    const before = rows();
    const links = sqlite.prepare('SELECT * FROM users_care').all();
    const repair = readFileSync('scripts/repairs/calisthenics-care-google-endpoints.sql', 'utf8');
    sqlite.exec(repair);
    const after = rows();
    expect(after).toEqual(before.map(row => row.project_id === 'calisthenics_care' && row.provider_name === 'google'
      ? { ...row, authorization_url: authorizationUrl ?? 'https://accounts.google.com/o/oauth2/v2/auth', token_url: 'https://oauth2.googleapis.com/token', user_info_url: 'https://www.googleapis.com/oauth2/v2/userinfo', updated_at: expect.any(String) } : row));
    expect(sqlite.prepare('SELECT * FROM users_care').all()).toEqual(links);
    sqlite.exec(repair);
    expect(sqlite.prepare('SELECT changes() AS count').get()).toEqual({ count: 0 });
    expect(rows()).toEqual(after);
  });
});
