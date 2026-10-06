import type { Env } from '../types';
import { projectService } from './project-service';
import { userService } from './user-service';
import { jwtService } from './jwt-service';
import { authService } from './auth-service';
import { AuthenticationError, BadRequestError, NotFoundError } from '../utils/errors';

/**
 * Native Sign in with Apple.
 *
 * The iPhone app receives an identity token (a JWT signed by Apple) and posts
 * it here. The token is verified against Apple's published keys, its audience
 * must be one of the project's bundle ids (`APPLE_AUDIENCES`), and the Apple
 * `sub` maps to one account. A first sign-in with an email that already has a
 * password account links to it, because Apple has verified the address.
 */

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';

export interface AppleClaims {
  sub: string;
  email: string | null;
  emailVerified: boolean;
}

interface Jwk { kid: string; kty: string; alg?: string; n: string; e: string }

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function decodeJson(part: string): any {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(part)));
  } catch {
    throw new AuthenticationError('Apple identity token is malformed');
  }
}

/** Bundle ids allowed as the token audience for a project. */
export function appleAudiences(env: Env, projectId: string): string[] {
  if (!env.APPLE_AUDIENCES) return [];
  try {
    const map = JSON.parse(env.APPLE_AUDIENCES) as Record<string, string[] | string>;
    const value = map[projectId];
    return Array.isArray(value) ? value : value ? [value] : [];
  } catch {
    return [];
  }
}

export async function verifyAppleIdentityToken(
  token: string,
  audiences: string[],
  options: { now?: number; fetchKeys?: () => Promise<{ keys: Jwk[] }> } = {},
): Promise<AppleClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AuthenticationError('Apple identity token is malformed');
  const header = decodeJson(parts[0]);
  const payload = decodeJson(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) throw new AuthenticationError('Apple identity token is malformed');

  const fetchKeys = options.fetchKeys ?? (async () => {
    const res = await fetch(APPLE_KEYS_URL);
    if (!res.ok) throw new BadRequestError('Apple keys are unavailable');
    return (await res.json()) as { keys: Jwk[] };
  });
  const jwk = (await fetchKeys()).keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new AuthenticationError('Apple identity token is not signed by Apple');

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    base64UrlDecode(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) throw new AuthenticationError('Apple identity token is not signed by Apple');

  const now = Math.floor((options.now ?? Date.now()) / 1000);
  if (payload.iss !== APPLE_ISSUER) throw new AuthenticationError('Apple identity token has the wrong issuer');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.some((a: string) => audiences.includes(a))) {
    throw new AuthenticationError('Apple identity token is for another app');
  }
  if (typeof payload.exp !== 'number' || payload.exp < now) throw new AuthenticationError('Apple identity token has expired');
  if (typeof payload.sub !== 'string' || !payload.sub) throw new AuthenticationError('Apple identity token has no subject');

  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
  return { sub: payload.sub, email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null, emailVerified };
}

export class AppleService {
  async signIn(
    env: Env,
    projectId: string,
    data: { identityToken: string; fullName?: { givenName?: string | null; familyName?: string | null } | null },
    options: { now?: number; fetchKeys?: () => Promise<{ keys: Jwk[] }> } = {},
  ): Promise<{ user: any; accessToken: string; refreshToken: string }> {
    const project = await projectService.getProject(env, projectId);
    if (!project) throw new NotFoundError('Project not found');
    if (!project.enabled) throw new AuthenticationError('Project is disabled');

    const audiences = appleAudiences(env, projectId);
    if (!audiences.length) throw new BadRequestError('Sign in with Apple is not configured for this project');
    const claims = await verifyAppleIdentityToken(data.identityToken, audiences, options);

    const table = project.userTableName;
    let user = await userService.getUserByOAuth(env, table, 'apple', claims.sub);
    if (!user) {
      if (!claims.email || !claims.emailVerified) {
        throw new AuthenticationError('Apple did not share a verified email address');
      }
      const existing = await userService.getUserByEmail(env, table, claims.email);
      if (existing) {
        if (existing.oauthProvider && existing.oauthProvider !== 'apple') {
          throw new BadRequestError('This email signs in another way. Use that method.');
        }
        user = await userService.updateUser(env, table, existing.id, {
          oauthProvider: 'apple',
          oauthProviderUserId: claims.sub,
          emailVerified: true,
        } as any);
      } else {
        const displayName = [data.fullName?.givenName, data.fullName?.familyName].filter(Boolean).join(' ').trim();
        const created = await userService.createUser(env, table, {
          email: claims.email,
          password: '',
          displayName: displayName || undefined,
          oauthProvider: 'apple',
          oauthProviderUserId: claims.sub,
        } as any);
        user = await userService.updateUser(env, table, created.id, { emailVerified: true } as any);
      }
    }
    if (user.status !== 'active') throw new AuthenticationError('Account is not active');

    await userService.updateLastLogin(env, table, user.id);
    const accessToken = await jwtService.generateAccessToken(project, user.id, user.email);
    const refreshToken = await authService.issueRefreshToken(env, projectId, user.id);
    return { user, accessToken, refreshToken };
  }
}

export const appleService = new AppleService();
