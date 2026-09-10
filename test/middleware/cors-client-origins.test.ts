import { describe, expect, it } from 'vitest';
import app from '../../src/index';
import type { Env } from '../../src/types';
import { corsMiddleware } from '../../src/middleware/cors';

type HeadersMap = Map<string, string>;

function createContext(origin: string | undefined, env: Record<string, string | undefined>, method = 'GET', path = '/api/auth/marginalia/login') {
  const headers: HeadersMap = new Map();
  const reqHeaderMap = new Map<string, string>();
  if (origin !== undefined) reqHeaderMap.set('Origin', origin);
  return {
    env,
    req: {
      header: (name: string) => reqHeaderMap.get(name),
      method,
      path,
    },
    header: (name: string, value: string) => headers.set(name, value),
    // Stub: unit tests inspect headers set on the context before preflight
    // short-circuits the chain. We deliberately do NOT construct a real
    // Response here (Node's undici rejects status 204 with empty body, which
    // is irrelevant to header-policy assertions).
    text: () => undefined,
    headers,
  };
}

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as any,
    ASSETS: {} as any,
    ADMIN_DOMAIN: 'https://admin.buildingis.art',
    CLIENT_ORIGINS:
      'https://service.sharpthought.app,https://admin.sharpthought.app,https://www.sharpthought.app',
    ...overrides,
  } as Env;
}

function makeRequest(
  env: Env,
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: string,
) {
  const request = new Request(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
  return app.fetch(request, env);
}

describe('corsMiddleware - admin origin policy (unchanged)', () => {
  it('grants credentialed CORS to a configured admin origin', async () => {
    const context = createContext('https://admin.buildingis.art', {
      ADMIN_DOMAIN: 'https://admin.buildingis.art',
    });

    await corsMiddleware(context as any, async () => {});

    expect(context.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.buildingis.art');
    expect(context.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(context.headers.get('Vary')).toBe('Origin');
  });
});

describe('corsMiddleware - client origin allowlist (new)', () => {
  const clientOrigins = [
    'https://service.sharpthought.app',
    'https://admin.sharpthought.app',
    'https://www.sharpthought.app',
  ];

  for (const origin of clientOrigins) {
    it(`grants credentialed CORS to client origin ${origin}`, async () => {
      const context = createContext(origin, {
        ADMIN_DOMAIN: 'https://admin.buildingis.art',
        CLIENT_ORIGINS: clientOrigins.join(','),
      });

      await corsMiddleware(context as any, async () => {});

      expect(context.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      expect(context.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(context.headers.get('Vary')).toBe('Origin');
    });
  }

  it('denies an origin not present in either ADMIN_DOMAIN or CLIENT_ORIGINS', async () => {
    const context = createContext('https://attacker.invalid', {
      ADMIN_DOMAIN: 'https://admin.buildingis.art',
      CLIENT_ORIGINS: clientOrigins.join(','),
    });

    await corsMiddleware(context as any, async () => {});

    expect(context.headers.get('Access-Control-Allow-Origin')).toBeUndefined();
    expect(context.headers.get('Access-Control-Allow-Credentials')).toBeUndefined();
    // Vary: Origin is still emitted so caches do not poison responses
    expect(context.headers.get('Vary')).toBe('Origin');
  });

  it('does not echo arbitrary Origin values back into ACAO', async () => {
    const rogueOrigin = 'https://service.sharpthought.app.attacker.invalid';
    const context = createContext(rogueOrigin, {
      ADMIN_DOMAIN: 'https://admin.buildingis.art',
      CLIENT_ORIGINS: clientOrigins.join(','),
    });

    await corsMiddleware(context as any, async () => {});

    expect(context.headers.get('Access-Control-Allow-Origin')).toBeUndefined();
    expect(context.headers.get('Access-Control-Allow-Credentials')).toBeUndefined();
  });

  it('does not allow wildcard subdomain matching - sharpthought.app must be exact', async () => {
    const context = createContext('https://api.sharpthought.app', {
      ADMIN_DOMAIN: 'https://admin.buildingis.art',
      CLIENT_ORIGINS: clientOrigins.join(','),
    });

    await corsMiddleware(context as any, async () => {});

    expect(context.headers.get('Access-Control-Allow-Origin')).toBeUndefined();
    expect(context.headers.get('Access-Control-Allow-Credentials')).toBeUndefined();
  });

  it('preserves native/no-Origin behavior (no ACAO header when Origin absent)', async () => {
    const context = createContext(undefined, {
      ADMIN_DOMAIN: 'https://admin.buildingis.art',
      CLIENT_ORIGINS: clientOrigins.join(','),
    });

    await corsMiddleware(context as any, async () => {});

    expect(context.headers.get('Access-Control-Allow-Origin')).toBeUndefined();
    expect(context.headers.get('Access-Control-Allow-Credentials')).toBeUndefined();
    // No Origin header → no need to emit Vary: Origin
    expect(context.headers.get('Vary')).toBeUndefined();
  });

  it('handles whitespace and empty entries in CLIENT_ORIGINS', async () => {
    const context = createContext('https://service.sharpthought.app', {
      ADMIN_DOMAIN: 'https://admin.buildingis.art',
      CLIENT_ORIGINS: ' , https://service.sharpthought.app , , ',
    });

    await corsMiddleware(context as any, async () => {});

    expect(context.headers.get('Access-Control-Allow-Origin')).toBe('https://service.sharpthought.app');
    expect(context.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('still works when CLIENT_ORIGINS is unset (admin-only behavior preserved)', async () => {
    const context = createContext('https://service.sharpthought.app', {
      ADMIN_DOMAIN: 'https://admin.buildingis.art',
    });

    await corsMiddleware(context as any, async () => {});

    expect(context.headers.get('Access-Control-Allow-Origin')).toBeUndefined();
  });
});

describe('corsMiddleware - admin origin stays admin-only', () => {
  it('client origins are NOT granted admin access even with valid cookie shape (no session check bypass)', async () => {
    // The CORS grant only determines whether the browser will SEND the request.
    // Without a valid admin session, /api/admin/* still returns 401.
    const env = createEnv();
    const response = await makeRequest(
      env,
      'GET',
      '/api/admin/projects',
      {
        Origin: 'https://service.sharpthought.app',
      },
    );

    // CORS allowed the preflight, but adminAuthMiddleware enforces session
    expect(response.status).toBe(401);
  });

  it('admin route returns ACAO for an admin origin even when no admin session (CORS is not authentication)', async () => {
    const env = createEnv();
    const response = await makeRequest(
      env,
      'GET',
      '/api/admin/projects',
      {
        Origin: 'https://admin.buildingis.art',
      },
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.buildingis.art');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });
});

describe('CORS e2e - real Hono requests', () => {
  it('OPTIONS preflight from a configured client origin returns 204 with ACAO/ACAC/ACAM/ACAH', async () => {
    const env = createEnv();
    const response = await makeRequest(
      env,
      'OPTIONS',
      '/api/auth/marginalia/login',
      {
        Origin: 'https://service.sharpthought.app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://service.sharpthought.app');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    expect(response.headers.get('Vary')).toBe('Origin');
  });

  it('OPTIONS preflight from an unrelated origin returns 204 WITHOUT ACAO/ACAC', async () => {
    const env = createEnv();
    const response = await makeRequest(
      env,
      'OPTIONS',
      '/api/auth/marginalia/login',
      {
        Origin: 'https://attacker.invalid',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    // Vary: Origin still set so caches don't poison the response
    expect(response.headers.get('Vary')).toBe('Origin');
  });

  it('actual login request from a client origin: validation-error response carries ACAO', async () => {
    const env = createEnv();
    const response = await makeRequest(
      env,
      'POST',
      '/api/auth/marginalia/login',
      { Origin: 'https://service.sharpthought.app' },
      JSON.stringify({}),
    );

    // Validation fails → 400, but envelope preserved and ACAO present
    expect(response.status).toBe(400);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://service.sharpthought.app');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    const body = (await response.json()) as { success: boolean; error?: string };
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
  });

  it('health check from a client origin returns ACAO', async () => {
    const env = createEnv();
    const response = await makeRequest(
      env,
      'GET',
      '/health',
      { Origin: 'https://service.sharpthought.app' },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://service.sharpthought.app');
    expect(response.headers.get('Vary')).toBe('Origin');
  });

  it('preserves {success,data,error} envelope on allowed login from client origin', async () => {
    const env = createEnv();
    const response = await makeRequest(
      env,
      'POST',
      '/api/auth/marginalia/login',
      { Origin: 'https://service.sharpthought.app' },
      JSON.stringify({ email: 'not-an-email', password: 'short' }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toHaveProperty('success');
    expect(body).toHaveProperty('error');
  });

  it('denied origin POST does not leak ACAO but the JSON envelope is still returned', async () => {
    const env = createEnv();
    const response = await makeRequest(
      env,
      'POST',
      '/api/auth/marginalia/login',
      { Origin: 'https://attacker.invalid' },
      JSON.stringify({}),
    );

    // The request is still processed by the app (validation 400), but no CORS grant
    expect(response.status).toBe(400);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });
});