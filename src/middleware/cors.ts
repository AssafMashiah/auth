import { Context, Next } from 'hono';
import type { Env } from '../types';

/**
 * CORS middleware
 */
export async function corsMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const origin = c.req.header('Origin');
  const allowedOrigins = (c.env.ADMIN_DOMAIN || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (origin && allowedOrigins.includes(origin)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Vary', 'Origin');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
  }

  // Handle preflight
  if (c.req.method === 'OPTIONS') {
    return c.text('', 204 as any);
  }

  await next();
}