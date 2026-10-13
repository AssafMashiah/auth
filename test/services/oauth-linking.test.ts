import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { OAuthService } from '../../src/services/oauth-service';
import { projectService } from '../../src/services/project-service';
import { userService } from '../../src/services/user-service';
import { jwtService } from '../../src/services/jwt-service';
import { authService } from '../../src/services/auth-service';
import type { Env } from '../../src/types';

const REDIRECT = 'https://health.sharpthought.app/auth/google/callback';
const project = { id: 'calisthenics_care', userTableName: 'users_calisthenics_care', redirectUrls: [REDIRECT] };
const user = (over: Record<string, unknown> = {}) => ({ id: 'u1', email: 'member@example.com', status: 'active', emailVerified: true,
  oauthProvider: null, ...over });

/** Google answers the token exchange, then userinfo with the given fields. */
function google(userInfo: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).includes('token')
    ? Response.json({ access_token: 'google-access' })
    : Response.json({ id: 'google-sub-1', email: 'member@example.com', name: 'Member', ...userInfo })));
}

describe('OAuth sign-in with an email that already has an account', () => {
  const service = new OAuthService();
  const env = { DB: {} } as unknown as Env;
  const callback = () => service.handleCallback(env, 'calisthenics_care', 'google', 'code', REDIRECT, 'verifier');

  beforeEach(() => {
    vi.spyOn(service as any, 'getProvider').mockResolvedValue({ clientId: 'id', clientSecret: 'secret',
      tokenUrl: 'https://oauth2.googleapis.com/token', userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo' });
    vi.spyOn(projectService, 'getProject').mockResolvedValue(project as any);
    vi.spyOn(userService, 'getUserByOAuth').mockResolvedValue(null);
    vi.spyOn(jwtService, 'generateAccessToken').mockResolvedValue('access');
    vi.spyOn(authService, 'issueRefreshToken').mockResolvedValue('refresh');
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('links a Google-verified email to the existing password account and keeps its password', async () => {
    google({ verified_email: true });
    vi.spyOn(userService, 'getUserByEmail').mockResolvedValue(user() as any);
    const update = vi.spyOn(userService, 'updateUser').mockResolvedValue(user({ oauthProvider: 'google' }) as any);
    const revoke = vi.spyOn(authService, 'revokeAllUserTokens').mockResolvedValue();
    const result = await callback();
    expect(result.user.id).toBe('u1');
    expect(update).toHaveBeenCalledWith(env, project.userTableName, 'u1',
      expect.objectContaining({ oauthProvider: 'google', oauthProviderUserId: 'google-sub-1', emailVerified: true }));
    expect(update.mock.calls[0][3]).not.toHaveProperty('passwordHash');
    expect(revoke).not.toHaveBeenCalled();
  });

  it('ends the password and sessions of an account whose email was never confirmed', async () => {
    google({ verified_email: true });
    vi.spyOn(userService, 'getUserByEmail').mockResolvedValue(user({ emailVerified: false }) as any);
    const update = vi.spyOn(userService, 'updateUser').mockResolvedValue(user({ oauthProvider: 'google' }) as any);
    const revoke = vi.spyOn(authService, 'revokeAllUserTokens').mockResolvedValue();
    await callback();
    expect(update.mock.calls[0][3]).toMatchObject({ passwordHash: '', emailVerified: true });
    expect(revoke).toHaveBeenCalledWith(env, 'calisthenics_care', 'u1');
  });

  it('refuses when Google has not verified the email, or the account signs in with another provider', async () => {
    google({ verified_email: false });
    vi.spyOn(userService, 'getUserByEmail').mockResolvedValue(user() as any);
    await expect(callback()).rejects.toThrow(/login with password first/);
    google({ verified_email: true });
    vi.spyOn(userService, 'getUserByEmail').mockResolvedValue(user({ oauthProvider: 'apple' }) as any);
    await expect(callback()).rejects.toThrow(/signs in another way/);
  });

  it('marks a new Google account as verified', async () => {
    google({ verified_email: true });
    vi.spyOn(userService, 'getUserByEmail').mockResolvedValue(null);
    vi.spyOn(userService, 'createUser').mockResolvedValue(user({ emailVerified: false, oauthProvider: 'google' }) as any);
    const update = vi.spyOn(userService, 'updateUser').mockResolvedValue(user({ oauthProvider: 'google' }) as any);
    await callback();
    expect(update).toHaveBeenCalledWith(env, project.userTableName, 'u1', { emailVerified: true });
  });
});
