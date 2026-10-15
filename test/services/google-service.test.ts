import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { verifyGoogleIdToken, googleAudiences, GoogleService } from '../../src/services/google-service';
import { projectService } from '../../src/services/project-service';
import { userService } from '../../src/services/user-service';
import { jwtService } from '../../src/services/jwt-service';
import { authService } from '../../src/services/auth-service';
import type { Env } from '../../src/types';

const WEB = 'web-client.apps.googleusercontent.com';
const IOS = 'ios-client.apps.googleusercontent.com';
let keyPair: CryptoKeyPair;
let jwk: JsonWebKey & { kid: string };
const NOW = Date.parse('2026-10-15T12:00:00Z');

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = (obj: object) => b64url(new TextEncoder().encode(JSON.stringify(obj)));

async function sign(payload: Record<string, unknown>, key = keyPair.privateKey, kid = 'test-key') {
  const head = enc({ alg: 'RS256', kid });
  const body = enc(payload);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}
const claims = (over: Record<string, unknown> = {}) => ({
  iss: 'https://accounts.google.com',
  aud: WEB,
  sub: 'google-sub-1',
  email: 'Member@Example.com',
  email_verified: true,
  name: 'Assaf Mashiah',
  exp: NOW / 1000 + 600,
  ...over,
});
const options = () => ({ now: NOW, fetchKeys: async () => ({ keys: [jwk as any] }) });

beforeAll(async () => {
  keyPair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  jwk = { ...(await crypto.subtle.exportKey('jwk', keyPair.publicKey)), kid: 'test-key' } as any;
});

describe('verifyGoogleIdToken', () => {
  it('accepts a token Google signed for the web or the iPhone client, with either issuer form', async () => {
    expect(await verifyGoogleIdToken(await sign(claims()), [WEB, IOS], options())).toEqual({
      sub: 'google-sub-1', email: 'member@example.com', emailVerified: true, name: 'Assaf Mashiah',
    });
    const ios = await verifyGoogleIdToken(await sign(claims({ aud: IOS, iss: 'accounts.google.com' })), [WEB, IOS], options());
    expect(ios.sub).toBe('google-sub-1');
  });

  it('rejects another app, another issuer, an expired token and a forged signature', async () => {
    await expect(verifyGoogleIdToken(await sign(claims({ aud: 'other' })), [WEB], options())).rejects.toThrow(/another app/);
    await expect(verifyGoogleIdToken(await sign(claims({ iss: 'https://evil.example' })), [WEB], options())).rejects.toThrow(/issuer/);
    await expect(verifyGoogleIdToken(await sign(claims({ exp: NOW / 1000 - 1 })), [WEB], options())).rejects.toThrow(/expired/);
    const other = (await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
    await expect(verifyGoogleIdToken(await sign(claims(), other.privateKey), [WEB], options())).rejects.toThrow(/not signed by Google/);
    await expect(verifyGoogleIdToken('not-a-token', [WEB], options())).rejects.toThrow(/malformed/);
  });
});

describe('googleAudiences', () => {
  it('reads the client ids for one project', () => {
    const env = { GOOGLE_AUDIENCES: JSON.stringify({ marginalia: [WEB, IOS], other: 'x' }) } as Env;
    expect(googleAudiences(env, 'marginalia')).toEqual([WEB, IOS]);
    expect(googleAudiences(env, 'other')).toEqual(['x']);
    expect(googleAudiences(env, 'missing')).toEqual([]);
    expect(googleAudiences({} as Env, 'marginalia')).toEqual([]);
  });
});

describe('GoogleService.signIn', () => {
  const env = { GOOGLE_AUDIENCES: JSON.stringify({ marginalia: [WEB, IOS] }) } as Env;
  const project = { id: 'marginalia', enabled: true, userTableName: 'users_marginalia' };
  const active = (over = {}) => ({ id: 'u1', email: 'member@example.com', status: 'active', displayName: null, oauthProvider: null, ...over });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(projectService, 'getProject').mockResolvedValue(project as any);
    vi.spyOn(userService, 'updateLastLogin').mockResolvedValue();
    vi.spyOn(jwtService, 'generateAccessToken').mockResolvedValue('access');
    vi.spyOn(authService, 'issueRefreshToken').mockResolvedValue('refresh');
  });

  it('signs in the account already linked to this Google id', async () => {
    vi.spyOn(userService, 'getUserByOAuth').mockResolvedValue(active({ oauthProvider: 'google' }) as any);
    const result = await new GoogleService().signIn(env, 'marginalia', { idToken: await sign(claims()) }, options());
    expect(result).toMatchObject({ accessToken: 'access', refreshToken: 'refresh', user: { id: 'u1' } });
  });

  it('links a password account with the same verified email', async () => {
    vi.spyOn(userService, 'getUserByOAuth').mockResolvedValue(null);
    vi.spyOn(userService, 'getUserByEmail').mockResolvedValue(active() as any);
    const update = vi.spyOn(userService, 'updateUser').mockResolvedValue(active({ oauthProvider: 'google' }) as any);
    await new GoogleService().signIn(env, 'marginalia', { idToken: await sign(claims()) }, options());
    expect(update).toHaveBeenCalledWith(env, 'users_marginalia', 'u1', { oauthProvider: 'google', oauthProviderUserId: 'google-sub-1', emailVerified: true });
  });

  it('creates a verified account with the name Google shares', async () => {
    vi.spyOn(userService, 'getUserByOAuth').mockResolvedValue(null);
    vi.spyOn(userService, 'getUserByEmail').mockResolvedValue(null);
    const create = vi.spyOn(userService, 'createUser').mockResolvedValue(active({ id: 'new' }) as any);
    vi.spyOn(userService, 'updateUser').mockResolvedValue(active({ id: 'new' }) as any);
    const result = await new GoogleService().signIn(env, 'marginalia', { idToken: await sign(claims()) }, options());
    expect(create.mock.calls[0][2]).toMatchObject({ email: 'member@example.com', displayName: 'Assaf Mashiah', oauthProvider: 'google' });
    expect(result.user.id).toBe('new');
  });

  it('refuses an unverified email, another provider, an unconfigured project and a suspended account', async () => {
    vi.spyOn(userService, 'getUserByOAuth').mockResolvedValue(null);
    await expect(new GoogleService().signIn(env, 'marginalia', { idToken: await sign(claims({ email_verified: false })) }, options())).rejects.toThrow(/verified email/);
    vi.spyOn(userService, 'getUserByEmail').mockResolvedValue(active({ oauthProvider: 'apple' }) as any);
    await expect(new GoogleService().signIn(env, 'marginalia', { idToken: await sign(claims()) }, options())).rejects.toThrow(/another way/);
    await expect(new GoogleService().signIn({} as Env, 'marginalia', { idToken: await sign(claims()) }, options())).rejects.toThrow(/not configured/);
    vi.spyOn(userService, 'getUserByOAuth').mockResolvedValue(active({ oauthProvider: 'google', status: 'suspended' }) as any);
    await expect(new GoogleService().signIn(env, 'marginalia', { idToken: await sign(claims()) }, options())).rejects.toThrow(/not active/);
  });
});
