import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserService } from '../../src/services/user-service';
import type { Env, User } from '../../src/types';

// =====================================================================
// Mocks for the service modules
// =====================================================================

vi.mock('../../src/services/audit-service', () => ({
  auditService: {
    logEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/services/email-service', () => ({
  emailService: {
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/services/password-reset-service', () => ({
  passwordResetService: {
    createResetToken: vi.fn().mockResolvedValue({
      token: 'mock-reset-token',
      tokenId: 'mock-token-id',
    }),
  },
}));

vi.mock('../../src/services/rate-limit-service', () => ({
  rateLimitService: {
    checkRateLimit: vi.fn().mockResolvedValue(undefined),
    recordAttempt: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/services/project-service', () => ({
  projectService: {
    getProject: vi.fn().mockResolvedValue({
      id: 'proj-1',
      name: 'Test Project',
      userTableName: 'proj_1_users',
      siteUrl: 'https://example.com',
      jwtSecret: 'secret',
      jwtAlgorithm: 'HS256',
      jwtExpirySeconds: 3600,
      refreshTokenExpirySeconds: 2592000,
      enabled: true,
      environment: 'development',
      description: null,
      redirectUrls: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdBy: null,
    }),
  },
}));

vi.mock('../../src/services/jwt-service', () => ({
  jwtService: {
    verifyAccessToken: vi.fn(),
  },
}));

import { auditService } from '../../src/services/audit-service';
import { emailService } from '../../src/services/email-service';
import { passwordResetService } from '../../src/services/password-reset-service';
import { rateLimitService } from '../../src/services/rate-limit-service';
import { projectService } from '../../src/services/project-service';

import {
  formatUserListRow,
  formatUserDetailRow,
  changeUserStatus,
  initiateAdminPasswordReset,
} from '../../src/services/admin-user-service';
import { assertUserCanRefresh } from '../../src/services/auth-service';

// =====================================================================
// Helpers
// =====================================================================

const createMockDB = () => ({
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  run: vi.fn().mockResolvedValue({ success: true }),
  all: vi.fn().mockResolvedValue({ results: [] }),
  first: vi.fn().mockResolvedValue(null),
});

const createMockEnv = (): Env => ({
  DB: createMockDB() as any,
  ASSETS: {} as any,
  ADMIN_SESSION_SECRET: 'test-secret',
  ENCRYPTION_KEY: 'test-encryption-key',
  ADMIN_DOMAIN: 'admin.example.com',
  SENDGRID_API_KEY: 'test-sendgrid-key',
  SENDGRID_FROM_EMAIL: 'test@example.com',
  PASSWORD_RESET_BASE_URL: 'https://example.com/reset',
  EMAIL_CONFIRMATION_BASE_URL: 'https://example.com/confirm',
});

const makeUserRow = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  email: 'alice@example.com',
  emailVerified: false,
  phone: null,
  phoneVerified: false,
  passwordHash: 'hash',
  oauthProvider: null,
  oauthProviderUserId: null,
  oauthRawUserData: null,
  displayName: 'Alice',
  avatarUrl: null,
  metadata: null,
  status: 'active',
  createdAt: '2026-07-06T18:00:00.000Z',
  updatedAt: '2026-07-06T18:00:00.000Z',
  lastLoginAt: '2026-07-06T18:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

// =====================================================================
// A1: listUsers with search + provider mapping + lastLoginAt
// =====================================================================

describe('UserService.listUsers (A1)', () => {
  let service: UserService;
  let env: Env;
  let mockDB: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    service = new UserService();
    env = createMockEnv();
    mockDB = env.DB as any;
  });

  it('pushes search filter down to SQL (LIKE on email OR display_name)', async () => {
    const captured: string[] = [];
    mockDB.prepare.mockImplementation((q: string) => {
      captured.push(q);
      return {
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      };
    });

    await service.listUsers(env, 'proj_1_users', { search: 'alice' });

    expect(captured[0]).toContain("email LIKE ?");
    expect(captured[0]).toContain("display_name LIKE ?");
    expect(captured[0]).toContain("LIMIT ?");
    expect(captured[0]).toContain("OFFSET ?");
    expect(captured[0]).toContain("ORDER BY created_at DESC");
  });

  it('does not include search clause when search omitted', async () => {
    const captured: string[] = [];
    mockDB.prepare.mockImplementation((q: string) => {
      captured.push(q);
      return {
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      };
    });

    await service.listUsers(env, 'proj_1_users', { limit: 10, offset: 0 });

    expect(captured[0]).not.toContain("LIKE ?");
  });

  it('aliases snake_case columns to camelCase on the SELECT clause', async () => {
    // Regression: formatUserListRow reads camelCase fields (passwordHash,
    // lastLoginAt, oauthProvider). D1 returns snake_case unless we alias
    // in SQL, so this test pins the SELECT projection to those aliases.
    const captured: string[] = [];
    mockDB.prepare.mockImplementation((q: string) => {
      captured.push(q);
      return {
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      };
    });

    await service.listUsers(env, 'proj_1_users', {});

    expect(captured[0]).toMatch(/password_hash\s+AS\s+passwordHash/i);
    expect(captured[0]).toMatch(/last_login_at\s+AS\s+lastLoginAt/i);
    expect(captured[0]).toMatch(/oauth_provider\s+AS\s+oauthProvider/i);
    expect(captured[0]).toMatch(/display_name\s+AS\s+displayName/i);
  });

  it('returns camelCase rows end-to-end (SQL aliases applied, formatter happy)', async () => {
    // Regression for the A1 E2E bug: listUsers must project snake_case
    // columns to the camelCase User shape so formatUserListRow sees
    // passwordHash / lastLoginAt / oauthProvider instead of undefined.
    // The SELECT-aliases test above pins the projection; here we verify
    // that whatever shape D1 hands back (rows keyed by the aliased
    // column names), formatUserListRow produces a correct A1 row.
    const aliasedRow = {
      id: 'user-1',
      email: 'alice@example.com',
      emailVerified: 1,
      phone: null,
      phoneVerified: 0,
      passwordHash: 'hash',
      oauthProvider: 'google',
      oauthProviderUserId: 'gid-1',
      oauthRawUserData: null,
      displayName: 'Alice',
      avatarUrl: null,
      metadata: null,
      status: 'active',
      createdAt: '2026-07-06T18:00:00.000Z',
      updatedAt: '2026-07-06T18:00:00.000Z',
      lastLoginAt: '2026-07-06T18:00:00.000Z',
    };

    mockDB.prepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [aliasedRow] }),
      }),
    });

    const users = await service.listUsers(env, 'proj_1_users', {});

    expect(users[0].passwordHash).toBe('hash');
    expect(users[0].oauthProvider).toBe('google');
    expect(users[0].lastLoginAt).toBe('2026-07-06T18:00:00.000Z');

    const row = formatUserListRow(users[0]);
    expect(row.providers).toEqual(['password', 'google']);
    expect(row.lastLoginAt).toBe('2026-07-06T18:00:00.000Z');
  });
});

describe('UserService.countUsers (A1)', () => {
  let service: UserService;
  let env: Env;
  let mockDB: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    service = new UserService();
    env = createMockEnv();
    mockDB = env.DB as any;
  });

  it('accepts a search filter and applies it as LIKE on email OR display_name', async () => {
    const captured: string[] = [];
    mockDB.prepare.mockImplementation((q: string) => {
      captured.push(q);
      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 0 }),
        }),
      };
    });

    await service.countUsers(env, 'proj_1_users', undefined, 'alice');

    expect(captured[0]).toContain("email LIKE ?");
    expect(captured[0]).toContain("display_name LIKE ?");
  });
});

describe('formatUserListRow (A1)', () => {
  it('returns lastLoginAt as ISO 8601 and providers array', () => {
    const user = makeUserRow({ lastLoginAt: '2026-07-06T18:00:00.000Z' });

    const row = formatUserListRow(user);

    expect(row.lastLoginAt).toBe('2026-07-06T18:00:00.000Z');
    expect(row.providers).toEqual(['password']);
  });

  it('returns providers=["password","google"] for a linked user', () => {
    const user = makeUserRow({ oauthProvider: 'google' });

    const row = formatUserListRow(user);

    expect(row.providers).toEqual(['password', 'google']);
  });

  it('returns providers=["google"] for OAuth-only user (no password)', () => {
    const user = makeUserRow({ passwordHash: null, oauthProvider: 'google' });

    const row = formatUserListRow(user);

    expect(row.providers).toEqual(['google']);
  });

  it('returns providers=["password","github"] for password+github', () => {
    const user = makeUserRow({ oauthProvider: 'github' });

    const row = formatUserListRow(user);

    expect(row.providers).toEqual(['password', 'github']);
  });

  it('returns providers=["password","microsoft"] for password+microsoft', () => {
    const user = makeUserRow({ oauthProvider: 'microsoft' });

    const row = formatUserListRow(user);

    expect(row.providers).toEqual(['password', 'microsoft']);
  });

  it('returns null lastLoginAt when user has never logged in', () => {
    const user = makeUserRow({ lastLoginAt: null });

    const row = formatUserListRow(user);

    expect(row.lastLoginAt).toBeNull();
  });

  it('returns providers=[] when neither password nor oauth set', () => {
    const user = makeUserRow({ passwordHash: null, oauthProvider: null });

    const row = formatUserListRow(user);

    expect(row.providers).toEqual([]);
  });

  it('drops null oauthProvider values without pushing empty strings', () => {
    const user = makeUserRow({ passwordHash: null, oauthProvider: null });

    const row = formatUserListRow(user);

    expect(row.providers).not.toContain(null);
    expect(row.providers).not.toContain('');
  });
});

// =====================================================================
// A2: detail row with linkedAt
// =====================================================================

describe('formatUserDetailRow (A2)', () => {
  it('returns expanded providers with linkedAt equal to createdAt', () => {
    const user = makeUserRow({ oauthProvider: 'google' });

    const row = formatUserDetailRow(user);

    expect(row.providers).toEqual([
      { provider: 'password', linkedAt: user.createdAt },
      { provider: 'google', linkedAt: user.createdAt },
    ]);
  });

  it('returns only password entry for password-only user', () => {
    const user = makeUserRow();

    const row = formatUserDetailRow(user);

    expect(row.providers).toEqual([
      { provider: 'password', linkedAt: user.createdAt },
    ]);
  });

  it('returns only oauth entry for OAuth-only user', () => {
    const user = makeUserRow({ passwordHash: null, oauthProvider: 'github' });

    const row = formatUserDetailRow(user);

    expect(row.providers).toEqual([
      { provider: 'github', linkedAt: user.createdAt },
    ]);
  });
});

// =====================================================================
// A3: status change + audit log
// =====================================================================

describe('changeUserStatus (A3)', () => {
  let env: Env;
  let mockDB: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    env = createMockEnv();
    mockDB = env.DB as any;
  });

  it('rejects status="deleted" with a 400-class error', async () => {
    await expect(
      changeUserStatus(env, 'proj-1', 'proj_1_users', 'user-1', {
        status: 'deleted',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws NotFoundError when the user does not exist', async () => {
    mockDB.prepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      }),
    });

    await expect(
      changeUserStatus(env, 'proj-1', 'proj_1_users', 'missing', {
        status: 'suspended',
        reason: 'spam',
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('updates the user row and writes audit log on success', async () => {
    const previous = makeUserRow({ status: 'active' });
    // First call -> getUserById to load previous state (returns previous)
    // Then UPDATE
    // Then second call -> getUserById returns updated row
    const updated = makeUserRow({ status: 'suspended' });

    let callIndex = 0;
    mockDB.prepare.mockImplementation((_q: string) => {
      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockImplementation(async () => {
            callIndex++;
            return callIndex === 1 ? previous : updated;
          }),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      };
    });

    const result = await changeUserStatus(env, 'proj-1', 'proj_1_users', 'user-1', {
      status: 'suspended',
      reason: 'policy violation',
    });

    expect(result.status).toBe('suspended');
    expect(auditService.logEvent).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        projectId: 'proj-1',
        eventType: 'user_status_changed',
        userId: 'user-1',
        eventData: expect.objectContaining({
          from: 'active',
          to: 'suspended',
          reason: 'policy violation',
        }),
      })
    );
  });

  it('returns the updated user row in A1 shape (with lastLoginAt + providers)', async () => {
    const previous = makeUserRow({ status: 'active' });
    const updated = makeUserRow({
      status: 'active',
      oauthProvider: 'google',
      lastLoginAt: '2026-07-06T19:00:00.000Z',
    });

    let callIndex = 0;
    mockDB.prepare.mockImplementation(() => ({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockImplementation(async () => {
          callIndex++;
          return callIndex === 1 ? previous : updated;
        }),
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    }));

    const result = await changeUserStatus(env, 'proj-1', 'proj_1_users', 'user-1', {
      status: 'active',
      reason: 'appeal granted',
    });

    expect(result.status).toBe('active');
    expect(result.providers).toEqual(['password', 'google']);
    expect(result.lastLoginAt).toBe('2026-07-06T19:00:00.000Z');
  });
});

// =====================================================================
// A3 gating: middleware status checks (covered in middleware test, but
// verify the rejection shape via direct service helper to keep this file
// focused)
// =====================================================================

describe('changeUserStatus (A3) - reason is optional', () => {
  it('does not require a reason to change status', async () => {
    const env = createMockEnv();
    const mockDB = env.DB as any;

    const previous = makeUserRow({ status: 'active' });
    const updated = makeUserRow({ status: 'suspended' });

    let callIndex = 0;
    mockDB.prepare.mockImplementation(() => ({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockImplementation(async () => {
          callIndex++;
          return callIndex === 1 ? previous : updated;
        }),
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    }));

    const result = await changeUserStatus(env, 'proj-1', 'proj_1_users', 'user-1', {
      status: 'suspended',
    });

    expect(result.status).toBe('suspended');
    expect(auditService.logEvent).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        eventData: expect.objectContaining({ to: 'suspended' }),
      })
    );
  });
});

// =====================================================================
// A3 gating: refresh helper used by authService.refreshToken
// =====================================================================

describe('assertUserCanRefresh (A3 refresh gate)', () => {
  it('throws AuthorizationError (403) when user.status is suspended', () => {
    const suspended = makeUserRow({ status: 'suspended' });
    expect(() => assertUserCanRefresh(suspended)).toThrow();
    try {
      assertUserCanRefresh(suspended);
    } catch (err: any) {
      expect(err.statusCode).toBe(403);
      expect(err.name).toBe('AuthorizationError');
    }
  });

  it('throws AuthenticationError (401) when user.status is deleted', () => {
    const deleted = makeUserRow({ status: 'deleted' });
    expect(() => assertUserCanRefresh(deleted)).toThrow();
    try {
      assertUserCanRefresh(deleted);
    } catch (err: any) {
      expect(err.statusCode).toBe(401);
      expect(err.name).toBe('AuthenticationError');
    }
  });

  it('does not throw when user.status is active', () => {
    const active = makeUserRow({ status: 'active' });
    expect(() => assertUserCanRefresh(active)).not.toThrow();
  });
});

// =====================================================================
// A4: admin-initiated password reset (bypasses rate limit)
// =====================================================================

describe('initiateAdminPasswordReset (A4)', () => {
  let env: Env;

  beforeEach(() => {
    env = createMockEnv();
  });

  it('does NOT call rateLimitService.checkRateLimit', async () => {
    const mockDB = env.DB as any;
    mockDB.prepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(makeUserRow()),
      }),
    });

    await initiateAdminPasswordReset(env, 'proj-1', 'proj_1_users', 'user-1', {
      ipAddress: '1.2.3.4',
      userAgent: 'TestUA',
      adminUserId: 'admin-1',
    });

    expect(rateLimitService.checkRateLimit).not.toHaveBeenCalled();
    expect(rateLimitService.recordAttempt).not.toHaveBeenCalled();
  });

  it('sends the password reset email via emailService', async () => {
    const mockDB = env.DB as any;
    mockDB.prepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(makeUserRow()),
      }),
    });

    await initiateAdminPasswordReset(env, 'proj-1', 'proj_1_users', 'user-1', {
      ipAddress: '1.2.3.4',
      userAgent: 'TestUA',
      adminUserId: 'admin-1',
    });

    expect(passwordResetService.createResetToken).toHaveBeenCalledWith(
      env,
      'proj-1',
      'user-1',
      'alice@example.com'
    );
    expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
      env,
      'alice@example.com',
      expect.stringContaining('/reset-password?token='),
      'Test Project',
      'proj-1'
    );
  });

  it('does NOT return the token or URL to the caller', async () => {
    const mockDB = env.DB as any;
    mockDB.prepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(makeUserRow()),
      }),
    });

    const result = await initiateAdminPasswordReset(
      env,
      'proj-1',
      'proj_1_users',
      'user-1',
      { ipAddress: '1.2.3.4', userAgent: 'TestUA', adminUserId: 'admin-1' }
    );

    expect(result).toEqual({ message: 'Reset email sent' });
    expect(result).not.toHaveProperty('token');
    expect(result).not.toHaveProperty('url');
  });

  it('writes admin_initiated_password_reset audit log with targetUserId', async () => {
    const mockDB = env.DB as any;
    mockDB.prepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(makeUserRow()),
      }),
    });

    await initiateAdminPasswordReset(env, 'proj-1', 'proj_1_users', 'user-1', {
      ipAddress: '1.2.3.4',
      userAgent: 'TestUA',
      adminUserId: 'admin-7',
    });

    expect(auditService.logEvent).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        projectId: 'proj-1',
        eventType: 'admin_initiated_password_reset',
        adminUserId: 'admin-7',
        userId: 'user-1',
        eventData: expect.objectContaining({ targetUserId: 'user-1' }),
      })
    );
  });

  it('throws NotFoundError when user does not exist', async () => {
    const mockDB = env.DB as any;
    mockDB.prepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      }),
    });

    await expect(
      initiateAdminPasswordReset(env, 'proj-1', 'proj_1_users', 'missing', {
        ipAddress: '1.2.3.4',
        userAgent: 'TestUA',
        adminUserId: 'admin-1',
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws an error when project has no siteUrl and no PASSWORD_RESET_BASE_URL', async () => {
    vi.mocked(projectService.getProject).mockResolvedValueOnce({
      id: 'proj-1',
      name: 'Test Project',
      userTableName: 'proj_1_users',
      siteUrl: null,
      jwtSecret: 'secret',
      jwtAlgorithm: 'HS256',
      jwtExpirySeconds: 3600,
      refreshTokenExpirySeconds: 2592000,
      enabled: true,
      environment: 'development',
      description: null,
      redirectUrls: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdBy: null,
    } as any);

    const mockDB = env.DB as any;
    delete (env as any).PASSWORD_RESET_BASE_URL;
    mockDB.prepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(makeUserRow()),
      }),
    });

    await expect(
      initiateAdminPasswordReset(env, 'proj-1', 'proj_1_users', 'user-1', {
        ipAddress: '1.2.3.4',
        userAgent: 'TestUA',
        adminUserId: 'admin-1',
      })
    ).rejects.toThrow();
  });
});