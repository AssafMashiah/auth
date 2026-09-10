import { Context, Next } from 'hono';
import type { Env } from '../types';

/**
 * CORS middleware
 *
 * Two distinct, explicit allowlists (configured via env vars):
 *   - ADMIN_DOMAIN (comma-separated): origins permitted to call /api/admin/*
 *     and the admin UI. Credentials are required.
 *   - CLIENT_ORIGINS (comma-separated): tenant app origins permitted to call
 *     /api/auth/* (login, register, refresh, oauth, etc.) with credentials.
 *     These origins must NOT be granted blanket access to admin APIs - admin
 *     routes are still gated by adminAuthMiddleware (session cookie + CSRF).
 *
 * No wildcard or reflected-origin behavior is supported. Origins are matched
 * exactly (scheme + host + port). Vary: Origin is emitted whenever an Origin
 * header is present so caches do not poison responses for denied callers.
 */
function parseOrigins(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function corsMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const origin = c.req.header('Origin');
  const adminOrigins = parseOrigins(c.env.ADMIN_DOMAIN);
  const clientOrigins = parseOrigins(c.env.CLIENT_ORIGINS);

  // Emit Vary: Origin whenever an Origin header is present, so caches don't
  // serve a cached ACAO response to a different origin than the one allowed.
  if (origin) {
    c.header('Vary', 'Origin');
  }

  if (origin && (adminOrigins.includes(origin) || clientOrigins.includes(origin))) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
  }

  // Handle preflight. Per RFC 7230, a 204 response MUST NOT include a body,
  // so use c.body(null, 204) instead of c.text('', 204) - the latter is
  // rejected by Node's Response constructor (and is semantically wrong even
  // where it does work, since it sets Content-Type: text/plain on an empty
  // body).
  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204 as any);
  }

  await next();
}