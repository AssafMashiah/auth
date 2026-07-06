import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { adminAuthService } from '../../src/services/admin-auth-service';
import { projectService } from '../../src/services/project-service';
import { oauthService } from '../../src/services/oauth-service';
import { rateLimitService } from '../../src/services/rate-limit-service';

/**
 * Regression tests for the D1 RETURNING bug.
 *
 * Cloudflare D1 does not reliably support Drizzle ORM's .returning() clause
 * (drizzle 0.45.x). The INSERT itself commits, but the .returning() query
 * fails, causing the surrounding handler to return HTTP 500 even though the
 * row was successfully written.
 *
 * These tests verify the source-level contract: no .returning() call chain
 * remains in src/services/. Comments mentioning ".returning()" (e.g. the
 * explanatory notes we just added) are stripped before the check.
 */

// Strip line and block comments from a TypeScript source string so the
// regression check looks only at executable code.
function stripComments(src: string): string {
  // Block comments
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '');
  // Line comments
  out = out.replace(/^\s*\/\/.*$/gm, '');
  // Trailing line comments (after some code on the same line)
  out = out.replace(/\/\/.*$/gm, '');
  return out;
}

function readServiceFile(name: string): string {
  return fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'services', name),
    'utf8',
  );
}

function hasReturningCall(src: string): boolean {
  return /\.returning\(\)/.test(stripComments(src));
}

describe('D1 RETURNING bug regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin-auth-service.ts does not use .returning() in code', () => {
    expect(hasReturningCall(readServiceFile('admin-auth-service.ts'))).toBe(false);
  });

  it('project-service.ts does not use .returning() in code', () => {
    expect(hasReturningCall(readServiceFile('project-service.ts'))).toBe(false);
  });

  it('oauth-service.ts does not use .returning() in code', () => {
    expect(hasReturningCall(readServiceFile('oauth-service.ts'))).toBe(false);
  });

  it('rate-limit-service.ts does not use .returning() in code', () => {
    expect(hasReturningCall(readServiceFile('rate-limit-service.ts'))).toBe(false);
  });

  it('no .returning() calls remain in any src/services/*.ts file (comments stripped)', () => {
    const dir = path.join(__dirname, '..', '..', 'src', 'services');
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const offenders: string[] = [];
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.ts')) continue;
      if (hasReturningCall(readServiceFile(e.name))) offenders.push(e.name);
    }
    expect(offenders).toEqual([]);
  });

  it('adminAuthService, projectService, oauthService, rateLimitService all importable', () => {
    expect(adminAuthService).toBeDefined();
    expect(projectService).toBeDefined();
    expect(oauthService).toBeDefined();
    expect(rateLimitService).toBeDefined();
  });
});
