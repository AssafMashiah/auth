import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Context, Next } from 'hono';
import type { Env, User, Project, JWTPayload } from '../../src/types';

vi.mock('../../src/services/jwt-service', () => ({
  jwtService: {
    extractTokenFromHeader: vi.fn((h: string | null) => {
      if (!h) return null;
      const m = h.match(/^Bearer\s+(.+)$/i);
      return m ? m[1] : h;
    }),
    verifyAccessToken: vi.fn(),
  },
}));

vi.mock('../../src/services/project-service', () => ({
  projectService: {
    getProject: vi.fn(),
  },
}));

vi.mock('../../src/services/user-service', () => ({
  userService: {
    getUserById: vi.fn(),
  },
}));

import { jwtService } from '../../src/services/jwt-service';
import { projectService } from '../../src/services/project-service';
import { userService } from '../../src/services/user-service';
import { authMiddleware } from '../../src/middleware/auth';

const baseProject: Project = {
  id: 'proj-1',
  name: 'Test',
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
};

const baseUser: User = {
  id: 'user-1',
  email: 'alice@example.com',
  emailVerified: true,
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
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastLoginAt: null,
};

const basePayload: JWTPayload = {
  sub: 'user-1',
  email: 'alice@example.com',
  projectId: 'proj-1',
  iat: 0,
  exp: 0,
};

const buildContext = (
  token: string | null
): Context<{ Bindings: Env; Variables: any }> => {
  const store = new Map<string, any>();
  const headers: Record<string, string> = {};
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;

  return {
    req: {
      header: (name: string) => headers[name.toLowerCase()] ?? headers[name],
      param: (name: string) => (name === 'projectId' ? 'proj-1' : undefined),
    },
    env: {} as Env,
    set: (k: string, v: any) => {
      store.set(k, v);
    },
    get: (k: string) => store.get(k),
  } as unknown as Context<{ Bindings: Env; Variables: any }>;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(projectService.getProject).mockResolvedValue(baseProject);
  vi.mocked(jwtService.verifyAccessToken).mockResolvedValue(basePayload);
});

describe('authMiddleware - status gating (A3)', () => {
  it('throws 403 AuthorizationError when user.status is suspended', async () => {
    vi.mocked(userService.getUserById).mockResolvedValue({
      ...baseUser,
      status: 'suspended',
    });

    const ctx = buildContext('token');
    const next = vi.fn() as unknown as Next;

    await expect(authMiddleware(ctx, next)).rejects.toMatchObject({
      statusCode: 403,
      name: 'AuthorizationError',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('throws 401 AuthenticationError when user is not found (deleted equivalent)', async () => {
    // getUserById filters out status='deleted'. The middleware treats a
    // missing user as 401 - that matches the "deleted user" gate.
    vi.mocked(userService.getUserById).mockResolvedValue(null);

    const ctx = buildContext('token');
    const next = vi.fn() as unknown as Next;

    await expect(authMiddleware(ctx, next)).rejects.toMatchObject({
      statusCode: 401,
      name: 'AuthenticationError',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('continues when user.status is active', async () => {
    vi.mocked(userService.getUserById).mockResolvedValue({
      ...baseUser,
      status: 'active',
    });

    const ctx = buildContext('token');
    const next = vi.fn() as unknown as Next;

    await expect(authMiddleware(ctx, next)).resolves.toBeUndefined();
    expect(next).toHaveBeenCalled();
    expect(ctx.get('user')).toMatchObject({ status: 'active' });
  });
});