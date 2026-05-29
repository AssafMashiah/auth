import { Context, Next } from 'hono';
import type { Env, Variables } from '../types';
import { adminAuthService } from '../services/admin-auth-service';
import { AuthenticationError, AuthorizationError } from '../utils/errors';

/**
 * Admin Authentication Middleware
 * Verifies admin session and attaches admin user to context
 */
export async function adminAuthMiddleware(c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) {
  // Get session token from cookie or header
  const sessionToken = c.req.header('X-Admin-Session') ||
                       getCookie(c.req.raw, 'admin_session');

  if (!sessionToken) {
    throw new AuthenticationError('No admin session');
  }

  // Verify session
  const admin = await adminAuthService.verifyAdminSession(c.env, sessionToken);

  // Attach admin to context
  c.set('admin', admin);

  await next();
}

/**
 * Check admin role middleware
 */
export function requireRole(...roles: string[]) {
  return async (c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) => {
    const admin = c.get('admin');

    if (!admin) {
      throw new AuthenticationError('Admin authentication required');
    }

    if (!roles.includes(admin.role)) {
      throw new AuthorizationError('Insufficient permissions');
    }

    await next();
  };
}

/**
 * Helper to get cookie value
 */
function getCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return undefined;

  const cookies = cookieHeader.split(';').map(c => c.trim());
  for (const cookie of cookies) {
    const [key, value] = cookie.split('=');
    if (key === name) {
      return value;
    }
  }
  return undefined;
}