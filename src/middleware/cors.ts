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
 *
 * Allowlist scope is bound to the request path - CLIENT_ORIGINS applies
 * ONLY within /api/auth/ and ADMIN_DOMAIN applies ONLY within /api/admin/.
 * There is no cross-grant: a client origin cannot call admin APIs even if
 * it would otherwise be allowed. Admin routes remain additionally gated by
 * adminAuthMiddleware (session cookie + CSRF); CORS only authorizes the
 * browser to send the request, not to access the response.
 *
 * No wildcard or reflected-origin behavior is supported. Origins are matched
 * exactly (scheme + host + port). Vary: Origin is merged into any existing
 * Vary header so caches do not poison responses across origins.
 */
function parseOrigins(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Append a dimension to the existing Vary response header without
 * overwriting values already set by upstream middleware. If `Origin` is
 * already present (case-insensitive), the header is left unchanged.
 */
function appendVaryDimension(c: Context, dimension: string): void {
  const existing = c.res.headers.get('Vary');
  const parts = existing ? existing.split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (parts.some((p) => p.toLowerCase() === dimension.toLowerCase())) {
    return;
  }
  parts.push(dimension);
  c.header('Vary', parts.join(', '));
}

export async function corsMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const origin = c.req.header('Origin');
  const adminOrigins = parseOrigins(c.env.ADMIN_DOMAIN);
  const clientOrigins = parseOrigins(c.env.CLIENT_ORIGINS);
  const path = c.req.path;

  // Emit Vary: Origin whenever an Origin header is present, so caches don't
  // serve a cached ACAO response to a different origin than the one allowed.
  // Merge with any pre-existing Vary dimensions so upstream middleware
  // (e.g. Accept-Encoding negotiation) is preserved.
  if (origin) {
    appendVaryDimension(c, 'Origin');
  }

  // Path-scoped allowlist match. A caller is allowed only if it is on the
  // list appropriate to the route class it is hitting. There is no
  // cross-grant between admin and client allowlists.
  const isAdminPath = path.startsWith('/api/admin/');
  const isAuthPath = path.startsWith('/api/auth/');
  const allowed =
    !!origin &&
    ((isAdminPath && adminOrigins.includes(origin)) ||
      (isAuthPath && clientOrigins.includes(origin)));

  if (allowed) {
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