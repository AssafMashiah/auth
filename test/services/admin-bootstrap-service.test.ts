import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  superAdmins: [] as Array<{ id: string; email: string; passwordHash: string; displayName: string; role: string }>,
  bootstrapToken: null as null | { tokenHash: string; usedAt: number | null },
}));

vi.mock('../../src/utils/crypto', () => ({
  generateSessionToken: vi.fn(() => 'setup-token'),
  hashToken: vi.fn(async (token: string) => `hash:${token}`),
  hashPassword: vi.fn(async (password: string) => `password:${password}`),
}));

function createEnv() {
  const db = {
    prepare: vi.fn((query: string) => ({
      bind: (...params: unknown[]) => ({
        first: vi.fn(async () => {
          if (query.includes('FROM admin_users')) {
            return state.superAdmins[0] ?? null;
          }
          if (query.includes('FROM admin_bootstrap_tokens')) {
            const [, tokenHash] = params as [string, string];
            return state.bootstrapToken?.tokenHash === tokenHash && state.bootstrapToken.usedAt === null
              ? state.bootstrapToken
              : null;
          }
          return null;
        }),
        run: vi.fn(async () => {
          if (query.trim().startsWith('INSERT INTO admin_bootstrap_tokens')) {
            const [, tokenHash] = params as [string, string];
            state.bootstrapToken = { tokenHash, usedAt: null };
            return { meta: { changes: 1 } };
          }
          if (query.trim().startsWith('UPDATE admin_bootstrap_tokens')) {
            const [usedAt, , tokenHash] = params as [number, string, string];
            if (!state.bootstrapToken || state.bootstrapToken.tokenHash !== tokenHash || state.bootstrapToken.usedAt !== null) {
              return { meta: { changes: 0 } };
            }
            state.bootstrapToken.usedAt = usedAt;
            return { meta: { changes: 1 } };
          }
          if (query.trim().startsWith('INSERT INTO admin_users')) {
            const [email, passwordHash, displayName] = params as [string, string, string];
            state.superAdmins.push({ id: 'admin-1', email, passwordHash, displayName, role: 'super_admin' });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }),
      }),
    })),
  };

  return { DB: db } as any;
}

import { adminBootstrapService } from '../../src/services/admin-bootstrap-service';

describe('AdminBootstrapService', () => {
  beforeEach(() => {
    state.superAdmins.length = 0;
    state.bootstrapToken = null;
    vi.clearAllMocks();
  });

  it('issues a one-time setup URL only when no super admin exists', async () => {
    const result = await adminBootstrapService.issueSetupUrl(
      createEnv(),
      'bootstrap-secret',
      'bootstrap-secret',
      'https://auth.example.com',
    );

    expect(result.setupUrl).toBe('https://auth.example.com/admin/setup?token=setup-token');
    expect(state.bootstrapToken).toEqual({ tokenHash: 'hash:setup-token', usedAt: null });

    state.superAdmins.push({ id: 'existing', email: 'existing@example.com', passwordHash: 'x', displayName: 'Existing', role: 'super_admin' });
    await expect(
      adminBootstrapService.issueSetupUrl(createEnv(), 'bootstrap-secret', 'bootstrap-secret', 'https://auth.example.com'),
    ).rejects.toThrow('already been completed');
  });

  it('creates the first self-chosen super admin and consumes its setup token', async () => {
    const env = createEnv();
    const { setupUrl } = await adminBootstrapService.issueSetupUrl(
      env,
      'bootstrap-secret',
      'bootstrap-secret',
      'https://auth.example.com',
    );
    const token = new URL(setupUrl).searchParams.get('token')!;

    const admin = await adminBootstrapService.completeSetup(env, 'bootstrap-secret', 'bootstrap-secret', {
      token,
      email: 'owner@example.com',
      password: 'Own-Password-123',
      displayName: 'Owner',
    });

    expect(admin).toMatchObject({ email: 'owner@example.com', role: 'super_admin' });
    expect(state.superAdmins).toHaveLength(1);
    expect(state.superAdmins[0].passwordHash).toBe('password:Own-Password-123');
    expect(state.bootstrapToken?.usedAt).toEqual(expect.any(Number));
  });

  it('rejects token reuse after first-user creation', async () => {
    const env = createEnv();
    await adminBootstrapService.issueSetupUrl(env, 'bootstrap-secret', 'bootstrap-secret', 'https://auth.example.com');

    await adminBootstrapService.completeSetup(env, 'bootstrap-secret', 'bootstrap-secret', {
      token: 'setup-token',
      email: 'owner@example.com',
      password: 'Own-Password-123',
      displayName: 'Owner',
    });

    await expect(
      adminBootstrapService.completeSetup(env, 'bootstrap-secret', 'bootstrap-secret', {
        token: 'setup-token',
        email: 'attacker@example.com',
        password: 'Different-Password-123',
        displayName: 'Attacker',
      }),
    ).rejects.toThrow('already been completed');
  });
});
