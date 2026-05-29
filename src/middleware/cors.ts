import { Context, Next } from 'hono';
import type { Env } from '../types';

/**
 * CORS middleware
 */
export async function corsMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const origin = c.req.header('Origin');
  const adminDomain = c.env.ADMIN_DOMAIN || '*';

  // Set CORS headers
  c.header('Access-Control-Allow-Origin', origin || adminDomain);
  c.header('Access-Control-Allow-Credentials', 'true');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Session');

  // Handle preflight
  if (c.req.method === 'OPTIONS') {
    return c.text('', 204 as any);
  }

  await next();
}