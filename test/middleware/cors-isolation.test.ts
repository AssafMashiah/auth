import { Hono } from 'hono';
import { describe, it, expect } from 'vitest';
import { corsMiddleware } from '../../src/middleware/cors';
import type { Env } from '../../src/types';

describe('CORS allowlist isolation', () => {
  const origin = 'https://service.sharpthought.app';
  const env = {
    CLIENT_ORIGINS: origin,
    ADMIN_DOMAIN: 'https://admin.buildingis.art',
  } as Env;

  // Group 1 — Client allowlist must NOT grant CORS to /api/admin/* (looked-up test)
  for (const method of ['OPTIONS', 'GET'] as const) {
    it(`does not grant client CORS on /api/admin/* when caller is a client origin (${method})`, async () => {
      const app = new Hono<{ Bindings: Env }>();
      app.use('*', corsMiddleware);
      app.get('/api/admin/projects', (c) => c.json({ success: false }, 401));

      const res = await app.request(
        '/api/admin/projects',
        {
          method,
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'GET',
          },
        },
        env
      );

      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    });
  }

  // Group 2 — Client allowlist must NOT grant CORS to lookalike paths /api/auth-other/*
  for (const method of ['OPTIONS', 'GET'] as const) {
    it(`does not grant client CORS on lookalike path /api/auth-other/* (${method})`, async () => {
      const app = new Hono<{ Bindings: Env }>();
      app.use('*', corsMiddleware);
      app.get('/api/auth-other/anything', (c) => c.json({ success: false }, 401));

      const res = await app.request(
        '/api/auth-other/anything',
        {
          method,
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'GET',
          },
        },
        env
      );

      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    });
  }

  // Group 3 — Vary must be merged, not overwritten
  it('preserves existing Vary dimensions when CORS adds Origin', async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use('*', async (c, next) => {
      c.header('Vary', 'Accept-Encoding');
      await next();
    });
    app.use('*', corsMiddleware);
    app.get('/api/auth/marginalia/me', (c) => c.json({ success: false }, 401));

    const res = await app.request(
      '/api/auth/marginalia/me',
      { headers: { Origin: origin } },
      env
    );

    const vary = res.headers.get('Vary') ?? '';
    expect(vary).toContain('Accept-Encoding');
    expect(vary).toContain('Origin');
  });
});