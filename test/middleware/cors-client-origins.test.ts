import { describe, expect, it } from 'vitest';
import app from '../../src/index';
import type { Env } from '../../src/types';
import { corsMiddleware } from '../../src/middleware/cors';

type HeadersMap = Map<string, string>;

function createContext(
  origin: string | undefined,
  env: Record<string, string | undefined>,
  method = 'GET',
  path = '/api/auth/marginalia/login',
) {
  const headers: HeadersMap = new Map();
  const reqHeaderMap = new Map<string, string>();
  if (origin !== undefined) reqHeaderMap.set('Origin', origin);
  // Mirror what real Hono provides: a lazy `c.res` with a Headers instance,
  // and `c.body` for short-circuit responses. Tests that just want to inspect
  // header policy can ignore both.
  const resHeaders = new Headers();
  return {
    env,
    req: {
      header: (name: string) => reqHeaderMap.get(name),
      method,
      path,
    },
    header: (name: string, value: string) => {
      headers.set(name, value);
      resHeaders.set(name, value);
    },
    text: () => undefined,
    body: (_data: unknown, status: number) =>
      new Response(null, { status, headers: resHeaders }),
    headers,
    res: { headers: resHeaders },
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
  it('grants credentialed CORS to a configured admin origin on /api/admin/*', async () => {
    const context = createContext(
      'https://admin.buildingis.art',
      { ADMIN_DOMAIN: 'https://admin.buildingis.art' },
      'GET',
      '/api/admin/projects',
    );

    await corsMiddleware(context as any, async () => {});

    expect(context.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.buildingis.art');
    expect(context.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(context.headers.get('Vary')).toContain('Origin');
  });
});

describe('corsMiddleware - client origin allowlist (new)', () => {
  const clientOrigins = [
    'https://service.sharpthought.app',
    'https://admin.sharpthought.app',
    'https://www.sharpthought.app',
  ];

  for (const origin of clientOrigins) {
    it(`grants credentialed CORS to client origin ${origin} on /api/auth/*`, async () => {
      const context = createContext(origin, {
        ADMIN_DOMAIN: 'https://admin.buildingis.art',
        CLIENT_ORIGINS: clientOrigins.join(','),
      });

      await corsMiddleware(context as any, async () => {});

      expect(context.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      expect(context.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(context.headers.get('Vary')).toContain('Origin');
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
    expect(context.headers.get('Vary')).toContain('Origin');
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

  it('does NOT grant client CORS on /api/admin/* (admin path is admin-only)', async () => {
    const context = createContext(
      'https://service.sharpthought.app',
      {
        ADMIN_DOMAIN: 'https://admin.buildingis.art',
        CLIENT_ORIGINS: clientOrigins.join(','),
      },
      'GET',
      '/api/admin/projects',
    );

    await corsMiddleware(context as any, async () => {});

    expect(context.headers.get('Access-Control-Allow-Origin')).toBeUndefined();
    expect(context.headers.get('Access-Control-Allow-Credentials')).toBeUndefined();
    // Vary still emitted so caches do not poison the denied response
    expect(context.headers.get('Vary')).toContain('Origin');
  });

  it('does NOT grant admin CORS on /api/auth/* (admin origin can only hit admin paths)', async () => {
    // ADMIN_DOMAIN entry used purely as an admin origin. When it hits an
    // /api/auth/* path it must not piggy-back on the admin allowlist - admin
    // origins don't authenticate end users.
    const context = createContext(
      'https://admin.buildingis.art',
      {
        ADMIN_DOMAIN: 'https://admin.buildingis.art',
        CLIENT_ORIGINS: clientOrigins.join(','),
      },
      'GET',
      '/api/auth/marginalia/login',
    );

    await corsMiddleware(context as any, async () => {});

    expect(context.headers.get('Access-Control-Allow-Origin')).toBeUndefined();
    expect(context.headers.get('Access-Control-Allow-Credentials')).toBeUndefined();
  });

  it('does NOT grant CORS on lookalike path /api/auth-other/* (not /api/auth/)', async () => {
    const context = createContext(
      'https://service.sharpthought.app',
      {
        ADMIN_DOMAIN: 'https://admin.buildingis.art',
        CLIENT_ORIGINS: clientOrigins.join(','),
      },
      'GET',
      '/api/auth-other/anything',
    );

    await corsMiddleware(context as any, async () => {});

    expect(context.headers.get('Access-Control-Allow-Origin')).toBeUndefined();
  });

  it('preserves existing Vary dimensions (does not overwrite Accept-Encoding)', async () => {
    const context = createContext(
      'https://service.sharpthought.app',
      {
        ADMIN_DOMAIN: 'https://admin.buildingis.art',
        CLIENT_ORIGINS: clientOrigins.join(','),
      },
      'GET',
      '/api/auth/marginalia/me',
    );
    // Simulate upstream middleware that already set Vary
    context.res.headers.set('Vary', 'Accept-Encoding');

    await corsMiddleware(context as any, async () => {});

    const vary = context.res.headers.get('Vary') ?? '';
    expect(vary).toContain('Accept-Encoding');
    expect(vary).toContain('Origin');
  });

  it('does not duplicate Origin in Vary when already present', async () => {
    const context = createContext(
      'https://service.sharpthought.app',
      {
        ADMIN_DOMAIN: 'https://admin.buildingis.art',
        CLIENT_ORIGINS: clientOrigins.join(','),
      },
      'GET',
      '/api/auth/marginalia/me',
    );
    context.res.headers.set('Vary', 'Origin, Accept-Encoding');

    await corsMiddleware(context as any, async () => {});

    const vary = context.res.headers.get('Vary') ?? '';
    // Single Origin entry, plus Accept-Encoding preserved
    expect(vary.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)).toEqual([
      'origin',
      'accept-encoding',
    ]);
  });
});

describe('corsMiddleware - admin origin stays admin-only (e2e)', () => {
  it('client origin gets NO ACAO on /api/admin/projects even with valid cookie shape', async () => {
    // The 401 status alone does not prove CORS isolation: adminAuthMiddleware
    // returns 401 for any caller without a valid admin session. We must
    // additionally assert that the response carries no Access-Control-Allow-Origin,
    // which proves the CORS middleware never granted the browser permission to
    // read the response.
    const env = createEnv();
    const response = await makeRequest(
      env,
      'GET',
      '/api/admin/projects',
      {
        Origin: 'https://service.sharpthought.app',
      },
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });

  it('admin origin gets ACAO on /api/admin/projects even with no admin session', async () => {
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

  it('admin origin gets NO ACAO on /api/auth/* (cannot piggy-back admin allowlist)', async () => {
    const env = createEnv();
    const response = await makeRequest(
      env,
      'GET',
      '/api/auth/marginalia/me',
      {
        Origin: 'https://admin.buildingis.art',
      },
    );

    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
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
    expect(response.headers.get('Vary')).toContain('Origin');
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
    expect(response.headers.get('Vary')).toContain('Origin');
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

  it('health endpoint from a client origin returns NO ACAO (system path is not /api/auth)', async () => {
    const env = createEnv();
    const response = await makeRequest(
      env,
      'GET',
      '/health',
      { Origin: 'https://service.sharpthought.app' },
    );

    expect(response.status).toBe(200);
    // /health is intentionally outside the client allowlist - only admin
    // monitoring would credentialed-call it, and it is a public liveness
    // check anyway.
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
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
});