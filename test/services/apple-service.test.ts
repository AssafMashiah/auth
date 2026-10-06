import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { verifyAppleIdentityToken, appleAudiences, AppleService } from '../../src/services/apple-service';
import { projectService } from '../../src/services/project-service';
import { userService } from '../../src/services/user-service';
import { jwtService } from '../../src/services/jwt-service';
import { authService } from '../../src/services/auth-service';
import type { Env } from '../../src/types';

const BUNDLE = 'app.sharpthought.journal';
let keyPair: CryptoKeyPair;
let jwk: JsonWebKey & { kid: string };
const NOW = Date.parse('2026-10-06T12:00:00Z');

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
  iss: 'https://appleid.apple.com',
  aud: BUNDLE,
  sub: 'apple-sub-1',
  email: 'Member@Example.com',
  email_verified: 'true',
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

describe('verifyAppleIdentityToken', () => {
  it('accepts a token Apple signed for this app', async () => {
    const result = await verifyAppleIdentityToken(await sign(claims()), [BUNDLE], options());
    expect(result).toEqual({ sub: 'apple-sub-1', email: 'member@example.com', emailVerified: true });
  });

  it('rejects another app, another issuer, an expired token and a forged signature', async () => {
    await expect(verifyAppleIdentityToken(await sign(claims({ aud: 'other.app' })), [BUNDLE], options())).rejects.toThrow(/another app/);
    await expect(verifyAppleIdentityToken(await sign(claims({ iss: 'https://evil.example' })), [BUNDLE], options())).rejects.toThrow(/issuer/);
    await expect(verifyAppleIdentityToken(await sign(claims({ exp: NOW / 1000 - 1 })), [BUNDLE], options())).rejects.toThrow(/expired/);
    const other = (await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
    await expect(verifyAppleIdentityToken(await sign(claims(), other.privateKey), [BUNDLE], options())).rejects.toThrow(/not signed by Apple/);
    await expect(verifyAppleIdentityToken('not-a-token', [BUNDLE], options())).rejects.toThrow(/malformed/);
  });
});

describe('appleAudiences', () => {
  it('reads the bundle ids for one project', () => {
    const env = { APPLE_AUDIENCES: JSON.stringify({ marginalia: [BUNDLE], other: 'x.y' }) } as Env;
    expect(appleAudiences(env, 'marginalia')).toEqual([BUNDLE]);
    expect(appleAudiences(env, 'other')).toEqual(['x.y']);
    expect(appleAudiences(env, 'missing')).toEqual([]);
    expect(appleAudiences({} as Env, 'marginalia')).toEqual([]);
  });
});

describe('AppleService.signIn', () => {
  const env = { APPLE_AUDIENCES: JSON.stringify({ marginalia: [BUNDLE] }) } as Env;
  const project = { id: 'marginalia', enabled: true, userTableName: 'users_marginalia' };
  const active = (over = {}) => ({ id: 'u1', email: 'member@example.com', status: 'active', displayName: null, oauthProvider: null, ...over });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(projectService, 'getProject').mockResolvedValue(project as any);
    vi.spyOn(userService, 'updateLastLogin').mockResolvedValue();
    vi.spyOn(jwtService, 'generateAccessToken').mockResolvedValue('access');
    vi.spyOn(authService, 'issueRefreshToken').mockResolvedValue('refresh');
  });

  it('signs in the account already linked to this Apple id', async () => {
    vi.spyOn(userService, 'getUserByOAuth').mockResolvedValue(active({ oauthProvider: 'apple' }) as any);
    const result = await new AppleService().signIn(env, 'marginalia', { identityToken: await sign(claims()) }, options());
    expect(result).toMatchObject({ accessToken: 'access', refreshToken: 'refresh', user: { id: 'u1' } });
  });

  it('links a password account with the same verified email', async () => {
    vi.spyOn(userService, 'getUserByOAuth').mockResolvedValue(null);
    vi.spyOn(userService, 'getUserByEmail').mockResolvedValue(active() as any);
    const update = vi.spyOn(userService, 'updateUser').mockResolvedValue(active({ oauthProvider: 'apple' }) as any);
    await new AppleService().signIn(env, 'marginalia', { identityToken: await sign(claims()) }, options());
    expect(update).toHaveBeenCalledWith(env, 'users_marginalia', 'u1', { oauthProvider: 'apple', oauthProviderUserId: 'apple-sub-1', emailVerified: true });
  });

  it('creates a verified account with the name Apple shares on first sign-in', async () => {
    vi.spyOn(userService, 'getUserByOAuth').mockResolvedValue(null);
    vi.spyOn(userService, 'getUserByEmail').mockResolvedValue(null);
    const create = vi.spyOn(userService, 'createUser').mockResolvedValue(active({ id: 'new' }) as any);
    vi.spyOn(userService, 'updateUser').mockResolvedValue(active({ id: 'new' }) as any);
    const result = await new AppleService().signIn(
      env, 'marginalia', { identityToken: await sign(claims()), fullName: { givenName: 'Assaf', familyName: null } }, options(),
    );
    expect(create.mock.calls[0][2]).toMatchObject({ email: 'member@example.com', displayName: 'Assaf', oauthProvider: 'apple' });
    expect(result.user.id).toBe('new');
  });

  it('refuses an email that signs in with another provider, and unconfigured projects', async () => {
    vi.spyOn(userService, 'getUserByOAuth').mockResolvedValue(null);
    vi.spyOn(userService, 'getUserByEmail').mockResolvedValue(active({ oauthProvider: 'google' }) as any);
    await expect(new AppleService().signIn(env, 'marginalia', { identityToken: await sign(claims()) }, options())).rejects.toThrow(/another way/);
    await expect(new AppleService().signIn({} as Env, 'marginalia', { identityToken: await sign(claims()) }, options())).rejects.toThrow(/not configured/);
  });

  it('refuses suspended accounts', async () => {
    vi.spyOn(userService, 'getUserByOAuth').mockResolvedValue(active({ status: 'suspended' }) as any);
    await expect(new AppleService().signIn(env, 'marginalia', { identityToken: await sign(claims()) }, options())).rejects.toThrow(/not active/);
  });
});
