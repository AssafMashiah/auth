import { describe, expect, it, vi } from 'vitest';
import { corsMiddleware } from '../../src/middleware/cors';
import { requireRole } from '../../src/middleware/admin-auth';
import { sanitizeEmailTemplateHtml } from '../../src/utils/html-sanitizer';

type HeadersMap = Map<string, string>;

function createContext(origin: string | undefined, env: Record<string, string | undefined>) {
  const headers: HeadersMap = new Map();
  return {
    env,
    req: {
      header: (name: string) => name === 'Origin' ? origin : undefined,
      method: 'OPTIONS',
      path: '/api/admin/users',
    },
    header: (name: string, value: string) => headers.set(name, value),
    body: vi.fn().mockReturnValue(new Response(null, { status: 204 })),
    headers,
  };
}

describe('security hardening middleware', () => {
  it('does not grant credentialed CORS access to an untrusted origin', async () => {
    const context = createContext('https://attacker.invalid', { ADMIN_DOMAIN: 'https://admin.example.com' });

    await corsMiddleware(context as any, vi.fn());

    expect(context.headers.get('Access-Control-Allow-Origin')).toBeUndefined();
    expect(context.headers.get('Access-Control-Allow-Credentials')).toBeUndefined();
  });

  it('grants credentialed CORS access only to the configured admin origin', async () => {
    const context = createContext('https://admin.example.com', { ADMIN_DOMAIN: 'https://admin.example.com' });

    await corsMiddleware(context as any, vi.fn());

    expect(context.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.example.com');
    expect(context.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('rejects viewers from super-admin actions', async () => {
    const context = { get: vi.fn().mockReturnValue({ role: 'viewer' }) };

    await expect(requireRole('super_admin')(context as any, vi.fn())).rejects.toThrow('Insufficient permissions');
  });

  it('allows super_admin through a super-admin action', async () => {
    const next = vi.fn();
    const context = { get: vi.fn().mockReturnValue({ role: 'super_admin' }) };

    await requireRole('super_admin')(context as any, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('removes executable and navigation-capable markup from email templates', () => {
    const sanitized = sanitizeEmailTemplateHtml(
      '<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">click</a><iframe src="https://attacker.invalid"></iframe><form action="/steal"></form><p>safe</p>'
    );

    expect(sanitized).not.toMatch(/script|onerror|javascript:|iframe|form/i);
    expect(sanitized).toContain('<p>safe</p>');
  });
});
