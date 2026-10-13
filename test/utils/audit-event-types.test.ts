import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Every audit event type the code writes must be allowed by the audit_logs CHECK constraint, or the insert fails. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('audit event types', () => {
  it('only uses event types the audit_logs table accepts', () => {
    const setup = readFileSync('src/utils/setup.ts', 'utf8');
    const check = /event_type TEXT NOT NULL CHECK \(event_type IN \(([\s\S]*?)\)\)/.exec(setup);
    expect(check, 'audit_logs CHECK constraint in src/utils/setup.ts').toBeTruthy();
    const allowed = new Set([...check![1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]));
    const used = new Set(sources('src').flatMap(file =>
      [...readFileSync(file, 'utf8').matchAll(/eventType:\s*'([a-z_]+)'/g)].map(m => m[1])));
    expect(used.size).toBeGreaterThan(5);
    expect([...used].filter(type => !allowed.has(type))).toEqual([]);
  });
});
