import type { Env } from '../types';
import { projectService } from './project-service';
import { userService } from './user-service';
import { jwtService } from './jwt-service';
import { authService } from './auth-service';
import { AuthenticationError, BadRequestError, NotFoundError } from '../utils/errors';

/**
 * Sign in with Google from a client that already holds Google's ID token.
 *
 * The web app gets the token from Google Identity Services in the page, and
 * the iPhone app from Google's OAuth flow in the system browser. Either posts
 * it here. The token is verified against Google's published keys, its
 * audience must be one of the project's OAuth client ids (`GOOGLE_AUDIENCES`),
 * and the Google `sub` maps to one account, the same column the redirect
 * OAuth flow writes. A first sign-in with an email that already has a
 * password account links to it, because Google has verified the address.
 *
 * This exists beside the redirect flow because that flow keeps its state in a
 * cookie on this service's domain, which a browser does not send from a
 * client on another site.
 */

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_KEYS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

export interface GoogleClaims {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
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
    throw new AuthenticationError('Google ID token is malformed');
  }
}

/** OAuth client ids allowed as the token audience for a project. */
export function googleAudiences(env: Env, projectId: string): string[] {
  if (!env.GOOGLE_AUDIENCES) return [];
  try {
    const map = JSON.parse(env.GOOGLE_AUDIENCES) as Record<string, string[] | string>;
    const value = map[projectId];
    return Array.isArray(value) ? value : value ? [value] : [];
  } catch {
    return [];
  }
}

export async function verifyGoogleIdToken(
  token: string,
  audiences: string[],
  options: { now?: number; fetchKeys?: () => Promise<{ keys: Jwk[] }> } = {},
): Promise<GoogleClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AuthenticationError('Google ID token is malformed');
  const header = decodeJson(parts[0]);
  const payload = decodeJson(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) throw new AuthenticationError('Google ID token is malformed');

  const fetchKeys = options.fetchKeys ?? (async () => {
    const res = await fetch(GOOGLE_KEYS_URL);
    if (!res.ok) throw new BadRequestError('Google keys are unavailable');
    return (await res.json()) as { keys: Jwk[] };
  });
  const jwk = (await fetchKeys()).keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new AuthenticationError('Google ID token is not signed by Google');

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
  if (!valid) throw new AuthenticationError('Google ID token is not signed by Google');

  const now = Math.floor((options.now ?? Date.now()) / 1000);
  if (!GOOGLE_ISSUERS.includes(payload.iss)) throw new AuthenticationError('Google ID token has the wrong issuer');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.some((a: string) => audiences.includes(a))) {
    throw new AuthenticationError('Google ID token is for another app');
  }
  if (typeof payload.exp !== 'number' || payload.exp < now) throw new AuthenticationError('Google ID token has expired');
  if (typeof payload.sub !== 'string' || !payload.sub) throw new AuthenticationError('Google ID token has no subject');

  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
  return {
    sub: payload.sub,
    email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
    emailVerified,
    name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim().slice(0, 200) : null,
  };
}

export class GoogleService {
  async signIn(
    env: Env,
    projectId: string,
    data: { idToken: string },
    options: { now?: number; fetchKeys?: () => Promise<{ keys: Jwk[] }> } = {},
  ): Promise<{ user: any; accessToken: string; refreshToken: string }> {
    const project = await projectService.getProject(env, projectId);
    if (!project) throw new NotFoundError('Project not found');
    if (!project.enabled) throw new AuthenticationError('Project is disabled');

    const audiences = googleAudiences(env, projectId);
    if (!audiences.length) throw new BadRequestError('Sign in with Google is not configured for this project');
    const claims = await verifyGoogleIdToken(data.idToken, audiences, options);

    const table = project.userTableName;
    let user = await userService.getUserByOAuth(env, table, 'google', claims.sub);
    if (!user) {
      if (!claims.email || !claims.emailVerified) {
        throw new AuthenticationError('Google did not share a verified email address');
      }
      const existing = await userService.getUserByEmail(env, table, claims.email);
      if (existing) {
        if (existing.oauthProvider && existing.oauthProvider !== 'google') {
          throw new BadRequestError('This email signs in another way. Use that method.');
        }
        user = await userService.updateUser(env, table, existing.id, {
          oauthProvider: 'google',
          oauthProviderUserId: claims.sub,
          emailVerified: true,
        } as any);
      } else {
        const created = await userService.createUser(env, table, {
          email: claims.email,
          password: '',
          displayName: claims.name ?? undefined,
          oauthProvider: 'google',
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

export const googleService = new GoogleService();
