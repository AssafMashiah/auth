import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { corsMiddleware } from '../../src/middleware/cors';
import type { Env } from '../../src/types';

/**
 * Configuration-coupling regression tests for the Sharp Thought client
 * origin allowlist.
 *
 * Context (2026-09-10): the production user origin
 *   https://web.sharpthought.app
 * was OMITTED from the committed CLIENT_ORIGINS, so CORS preflight from
 * the real browser failed. Dalinar worked around it with a CLI --var
 * override in production; this test pins the four required origins into
 * the committed config files so future deploys do not silently drop the
 * actual user origin again.
 *
 * These tests intentionally read the on-disk wrangler.toml and
 * wrangler.dev.toml from the repo root, so editing those files is the
 * only way to make them pass — a code-only fix would not.
 */

const REPO_ROOT = resolve(__dirname, '..', '..');
const PROD_CONFIG = resolve(REPO_ROOT, 'wrangler.toml');
const DEV_CONFIG = resolve(REPO_ROOT, 'wrangler.dev.toml');

const REQUIRED_ORIGINS = [
  'https://service.sharpthought.app',
  'https://web.sharpthought.app',
  'https://admin.sharpthought.app',
  'https://www.sharpthought.app',
] as const;

const WEB_ORIGIN = 'https://web.sharpthought.app';

/**
 * Pull the value of the `CLIENT_ORIGINS = "..."` line out of a wrangler
 * config file. Accepts either the bare `[vars]` block or an
 * `[env.production]` / `[env.dev]` block (the wrangler format used in
 * this repo puts it at top level under `[vars]`).
 *
 * Returns the raw string value (the contents between the outermost
 * double quotes), or null if the key is not present.
 */
function readClientOriginsValue(configPath: string): string | null {
  const contents = readFileSync(configPath, 'utf8');
  // Match CLIENT_ORIGINS = "..." (TOML basic string). We do not handle
  // multi-line literal strings here because this repo uses single-line
  // basic strings.
  const match = contents.match(/^\s*CLIENT_ORIGINS\s*=\s*"([^"]*)"\s*$/m);
  return match ? match[1] : null;
}

function readClientOriginsList(configPath: string): string[] {
  const raw = readClientOriginsValue(configPath);
  if (raw === null) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

describe('wrangler config - CLIENT_ORIGINS pins all four Sharp Thought origins', () => {
  for (const [label, path] of [
    ['production (wrangler.toml)', PROD_CONFIG],
    ['dev (wrangler.dev.toml)', DEV_CONFIG],
  ] as const) {
    it(`${label} declares CLIENT_ORIGINS with every required origin`, () => {
      const origins = readClientOriginsList(path);
      for (const required of REQUIRED_ORIGINS) {
        expect(origins, `${path} is missing ${required} in CLIENT_ORIGINS`).toContain(
          required,
        );
      }
    });

    it(`${label} includes the actual user origin https://web.sharpthought.app`, () => {
      const origins = readClientOriginsList(path);
      expect(origins).toContain(WEB_ORIGIN);
    });

    it(`${label} CLIENT_ORIGINS contains no wildcards`, () => {
      const origins = readClientOriginsList(path);
      for (const origin of origins) {
        expect(origin).not.toContain('*');
      }
    });

    it(`${label} CLIENT_ORIGINS contains no http:// origins`, () => {
      const origins = readClientOriginsList(path);
      for (const origin of origins) {
        expect(origin.startsWith('http://')).toBe(false);
      }
    });
  }
});

describe('runtime - committed config grants web.sharpthought.app credentialed auth CORS', () => {
  it('wrangler.toml CLIENT_ORIGINS, when loaded into the middleware, grants ACAO to web.sharpthought.app on /api/auth/*', async () => {
    const origins = readClientOriginsList(PROD_CONFIG);
    const env = {
      ADMIN_DOMAIN: 'https://admin.buildingis.art',
      CLIENT_ORIGINS: origins.join(','),
    } as Env;

    const headers = new Map<string, string>();
    const resHeaders = new Headers();
    const reqHeaders = new Map<string, string>([['Origin', WEB_ORIGIN]]);
    const context = {
      env,
      req: {
        header: (name: string) => reqHeaders.get(name),
        method: 'GET',
        path: '/api/auth/marginalia/login',
      },
      header: (name: string, value: string) => {
        headers.set(name, value);
        resHeaders.set(name, value);
      },
      body: (_data: unknown, status: number) => new Response(null, { status, headers: resHeaders }),
      res: { headers: resHeaders },
    };

    await corsMiddleware(context as any, async () => {});

    expect(headers.get('Access-Control-Allow-Origin')).toBe(WEB_ORIGIN);
    expect(headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('committed prod config does NOT grant admin CORS to web.sharpthought.app on /api/admin/*', async () => {
    const origins = readClientOriginsList(PROD_CONFIG);
    const env = {
      ADMIN_DOMAIN: 'https://admin.buildingis.art',
      CLIENT_ORIGINS: origins.join(','),
    } as Env;

    const headers = new Map<string, string>();
    const resHeaders = new Headers();
    const reqHeaders = new Map<string, string>([['Origin', WEB_ORIGIN]]);
    const context = {
      env,
      req: {
        header: (name: string) => reqHeaders.get(name),
        method: 'GET',
        path: '/api/admin/projects',
      },
      header: (name: string, value: string) => {
        headers.set(name, value);
        resHeaders.set(name, value);
      },
      body: (_data: unknown, status: number) => new Response(null, { status, headers: resHeaders }),
      res: { headers: resHeaders },
    };

    await corsMiddleware(context as any, async () => {});

    expect(headers.get('Access-Control-Allow-Origin')).toBeUndefined();
    expect(headers.get('Access-Control-Allow-Credentials')).toBeUndefined();
  });
});
