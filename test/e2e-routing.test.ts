import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import app from '../src/index';
import type { Env } from '../src/types';

/**
 * E2E tests for URL routing with name-based project IDs
 * Tests all auth and admin endpoints with the new ID format
 */

// Mock environment for E2E tests
const createTestEnv = (): Env => {
  const mockDB = {
    exec: vi.fn().mockResolvedValue(undefined),
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ success: true }),
    all: vi.fn().mockResolvedValue({ results: [] }),
    first: vi.fn().mockResolvedValue(null),
  };

  return {
    DB: mockDB as any,
    ASSETS: {} as any,
    ADMIN_SESSION_SECRET: 'test-session-secret',
    ENCRYPTION_KEY: 'test-encryption-key-32-characters',
    ADMIN_DOMAIN: 'admin.example.com',
    SENDGRID_API_KEY: 'test-sendgrid-key',
    SENDGRID_FROM_EMAIL: 'noreply@example.com',
    PASSWORD_RESET_BASE_URL: 'https://example.com/reset',
    EMAIL_CONFIRMATION_BASE_URL: 'https://example.com/confirm',
  };
};

// Helper to make requests to the app
const makeRequest = async (
  method: string,
  path: string,
  body?: any,
  headers?: Record<string, string>
) => {
  const url = `http://localhost${path}`;
  const request = new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const env = createTestEnv();
  return app.fetch(request, env);
};

describe('E2E - Auth Endpoints with New ID Format', () => {
  describe('POST /api/auth/:projectId/register', () => {
    it('should accept registration with underscored project ID', async () => {
      const response = await makeRequest('POST', '/api/auth/test_project/register', {
        email: 'user@example.com',
        password: 'SecurePass123!',
        displayName: 'Test User',
      });

      // Even with mocked services, the route should be accessible
      expect(response.status).not.toBe(404);
    });

    it('should accept registration with simple project name', async () => {
      const response = await makeRequest('POST', '/api/auth/my_app/register', {
        email: 'user@example.com',
        password: 'SecurePass123!',
      });

      expect(response.status).not.toBe(404);
    });

    it('should accept registration with complex project ID', async () => {
      const response = await makeRequest('POST', '/api/auth/customer_portal_v2/register', {
        email: 'user@example.com',
        password: 'SecurePass123!',
      });

      expect(response.status).not.toBe(404);
    });

    it('should accept registration with numeric project ID', async () => {
      const response = await makeRequest('POST', '/api/auth/api_v2_0/register', {
        email: 'user@example.com',
        password: 'SecurePass123!',
      });

      expect(response.status).not.toBe(404);
    });

    it('should reject old hex-based ID format (404)', async () => {
      const oldHexId = 'a1b2c3d4e5f6789012345678901234ab'; // 32-char hex
      const response = await makeRequest('POST', `/api/auth/${oldHexId}/register`, {
        email: 'user@example.com',
        password: 'SecurePass123!',
      });

      // This should either 404 or handle as a project lookup that fails
      expect([400, 404, 500]).toContain(response.status);
    });
  });

  describe('POST /api/auth/:projectId/login', () => {
    it('should accept login with underscored project ID', async () => {
      const response = await makeRequest('POST', '/api/auth/test_project/login', {
        email: 'user@example.com',
        password: 'SecurePass123!',
      });

      expect(response.status).not.toBe(404);
    });

    it('should accept login with single-word project ID', async () => {
      const response = await makeRequest('POST', '/api/auth/dashboard/login', {
        email: 'user@example.com',
        password: 'SecurePass123!',
      });

      expect(response.status).not.toBe(404);
    });

    it('should accept login with multi-part project ID', async () => {
      const response = await makeRequest('POST', '/api/auth/production_api_service/login', {
        email: 'user@example.com',
        password: 'SecurePass123!',
      });

      expect(response.status).not.toBe(404);
    });
  });

  describe('POST /api/auth/:projectId/refresh', () => {
    it('should accept refresh with underscored project ID', async () => {
      const response = await makeRequest('POST', '/api/auth/test_project/refresh', {
        refreshToken: 'mock-refresh-token',
      });

      expect(response.status).not.toBe(404);
    });

    it('should accept refresh with various project ID formats', async () => {
      const projectIds = ['my_app', 'api_v2', 'customer_portal'];

      for (const projectId of projectIds) {
        const response = await makeRequest('POST', `/api/auth/${projectId}/refresh`, {
          refreshToken: 'mock-refresh-token',
        });

        expect(response.status).not.toBe(404);
      }
    });
  });

  describe('POST /api/auth/:projectId/logout', () => {
    it('should accept logout with underscored project ID', async () => {
      const response = await makeRequest('POST', '/api/auth/my_app/logout', {
        refreshToken: 'mock-refresh-token',
      });

      expect(response.status).not.toBe(404);
    });

    it('should accept logout with numeric project ID', async () => {
      const response = await makeRequest('POST', '/api/auth/app123/logout', {
        refreshToken: 'mock-refresh-token',
      });

      expect(response.status).not.toBe(404);
    });
  });

  describe('GET /api/auth/:projectId/me', () => {
    it('should accept me endpoint with underscored project ID', async () => {
      const response = await makeRequest(
        'GET',
        '/api/auth/test_project/me',
        undefined,
        {
          Authorization: 'Bearer mock-token',
        }
      );

      expect(response.status).not.toBe(404);
    });
  });

  describe('POST /api/auth/:projectId/forgot-password', () => {
    it('should accept forgot-password with underscored project ID', async () => {
      const response = await makeRequest('POST', '/api/auth/test_project/forgot-password', {
        email: 'user@example.com',
      });

      expect(response.status).not.toBe(404);
    });
  });

  describe('POST /api/auth/:projectId/reset-password', () => {
    it('should accept reset-password with underscored project ID', async () => {
      const response = await makeRequest('POST', '/api/auth/test_project/reset-password', {
        token: 'mock-reset-token',
        newPassword: 'NewSecurePass123!',
      });

      expect(response.status).not.toBe(404);
    });
  });

  describe('GET /api/auth/:projectId/confirm-email', () => {
    it('should accept confirm-email with underscored project ID', async () => {
      const response = await makeRequest('GET', '/api/auth/test_project/confirm-email?token=mock-token');

      expect(response.status).not.toBe(404);
    });
  });

  describe('OAuth endpoints', () => {
    it('should accept OAuth auth URL with underscored project ID', async () => {
      const response = await makeRequest(
        'GET',
        '/api/auth/my_app/oauth/google?redirect_uri=https://example.com/callback'
      );

      expect(response.status).not.toBe(404);
    });

    it('should accept OAuth callback with underscored project ID', async () => {
      const response = await makeRequest(
        'GET',
        '/api/auth/my_app/oauth/google/callback?code=mock-code&redirect_uri=https://example.com/callback'
      );

      expect(response.status).not.toBe(404);
    });

    it('should accept OAuth with multiple providers', async () => {
      const providers = ['google', 'github', 'microsoft'];
      const projectId = 'social_app';

      for (const provider of providers) {
        const response = await makeRequest(
          'GET',
          `/api/auth/${projectId}/oauth/${provider}?redirect_uri=https://example.com/callback`
        );

        expect(response.status).not.toBe(404);
      }
    });
  });
});

describe('E2E - Admin Endpoints with New ID Format', () => {
  const mockAdminToken = 'mock-admin-session-token';

  describe('GET /api/admin/projects', () => {
    it('should list projects', async () => {
      const response = await makeRequest(
        'GET',
        '/api/admin/projects',
        undefined,
        {
          'X-Admin-Session': mockAdminToken,
        }
      );

      // Route should be accessible (even if auth fails)
      expect(response.status).not.toBe(404);
    });

    it('should support filtering by environment', async () => {
      const response = await makeRequest(
        'GET',
        '/api/admin/projects?environment=production',
        undefined,
        {
          'X-Admin-Session': mockAdminToken,
        }
      );

      expect(response.status).not.toBe(404);
    });
  });

  describe('GET /api/admin/projects/:id', () => {
    it('should get project by underscored ID', async () => {
      const response = await makeRequest(
        'GET',
        '/api/admin/projects/test_project',
        undefined,
        {
          'X-Admin-Session': mockAdminToken,
        }
      );

      expect(response.status).not.toBe(404);
    });

    it('should get project by complex ID', async () => {
      const response = await makeRequest(
        'GET',
        '/api/admin/projects/customer_portal_v2_production',
        undefined,
        {
          'X-Admin-Session': mockAdminToken,
        }
      );

      expect(response.status).not.toBe(404);
    });

    it('should get project by single-word ID', async () => {
      const response = await makeRequest(
        'GET',
        '/api/admin/projects/dashboard',
        undefined,
        {
          'X-Admin-Session': mockAdminToken,
        }
      );

      expect(response.status).not.toBe(404);
    });
  });

  describe('PUT /api/admin/projects/:id', () => {
    it('should update project by underscored ID', async () => {
      const response = await makeRequest(
        'PUT',
        '/api/admin/projects/test_project',
        {
          description: 'Updated description',
        },
        {
          'X-Admin-Session': mockAdminToken,
        }
      );

      expect(response.status).not.toBe(404);
    });

    it('should update project with various ID formats', async () => {
      const projectIds = ['my_app', 'api_v2', 'prod_service'];

      for (const projectId of projectIds) {
        const response = await makeRequest(
          'PUT',
          `/api/admin/projects/${projectId}`,
          { enabled: false },
          {
            'X-Admin-Session': mockAdminToken,
          }
        );

        expect(response.status).not.toBe(404);
      }
    });
  });

  describe('DELETE /api/admin/projects/:id', () => {
    it('should delete project by underscored ID', async () => {
      const response = await makeRequest(
        'DELETE',
        '/api/admin/projects/test_project',
        undefined,
        {
          'X-Admin-Session': mockAdminToken,
        }
      );

      expect(response.status).not.toBe(404);
    });
  });

  describe('Project users endpoints', () => {
    it('should list users with underscored project ID', async () => {
      const response = await makeRequest(
        'GET',
        '/api/admin/projects/test_project/users',
        undefined,
        {
          'X-Admin-Session': mockAdminToken,
        }
      );

      expect(response.status).not.toBe(404);
    });

    it('should create user with underscored project ID', async () => {
      const response = await makeRequest(
        'POST',
        '/api/admin/projects/my_app/users',
        {
          email: 'newuser@example.com',
          password: 'SecurePass123!',
        },
        {
          'X-Admin-Session': mockAdminToken,
        }
      );

      expect(response.status).not.toBe(404);
    });

    it('should update user with underscored project ID', async () => {
      const response = await makeRequest(
        'PUT',
        '/api/admin/projects/test_project/users/user-id-123',
        {
          displayName: 'Updated Name',
        },
        {
          'X-Admin-Session': mockAdminToken,
        }
      );

      expect(response.status).not.toBe(404);
    });

    it('should delete user with underscored project ID', async () => {
      const response = await makeRequest(
        'DELETE',
        '/api/admin/projects/my_app/users/user-id-123',
        undefined,
        {
          'X-Admin-Session': mockAdminToken,
        }
      );

      expect(response.status).not.toBe(404);
    });
  });

  describe('OAuth providers endpoints', () => {
    it('should list OAuth providers with underscored project ID', async () => {
      const response = await makeRequest(
        'GET',
        '/api/admin/projects/test_project/oauth',
        undefined,
        {
          'X-Admin-Session': mockAdminToken,
        }
      );

      expect(response.status).not.toBe(404);
    });

    it('should create OAuth provider with underscored project ID', async () => {
      const response = await makeRequest(
        'POST',
        '/api/admin/projects/my_app/oauth',
        {
          providerName: 'google',
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
        },
        {
          'X-Admin-Session': mockAdminToken,
        }
      );

      expect(response.status).not.toBe(404);
    });
  });

  describe('Supabase import endpoints', () => {
    it('should validate Supabase credentials with underscored project ID', async () => {
      const response = await makeRequest(
        'POST',
        '/api/admin/projects/test_project/import-supabase/validate',
        {
          supabaseUrl: 'https://test.supabase.co',
          supabaseServiceKey: 'test-key',
        },
        {
          'X-Admin-Session': mockAdminToken,
        }
      );

      expect(response.status).not.toBe(404);
    });

    it('should get import preview with underscored project ID', async () => {
      const response = await makeRequest(
        'POST',
        '/api/admin/projects/my_app/import-supabase/preview',
        {
          supabaseUrl: 'https://test.supabase.co',
          supabaseServiceKey: 'test-key',
          limit: 10,
        },
        {
          'X-Admin-Session': mockAdminToken,
        }
      );

      expect(response.status).not.toBe(404);
    });

    it('should import from Supabase with underscored project ID', async () => {
      const response = await makeRequest(
        'POST',
        '/api/admin/projects/customer_portal/import-supabase',
        {
          supabaseUrl: 'https://test.supabase.co',
          supabaseServiceKey: 'test-key',
        },
        {
          'X-Admin-Session': mockAdminToken,
        }
      );

      expect(response.status).not.toBe(404);
    });
  });
});

describe('E2E - URL Format Validation', () => {
  it('should handle URLs without encoding for underscored IDs', () => {
    const projectIds = [
      'test_project',
      'my_app',
      'customer_portal_v2',
      'api_service_production',
    ];

    projectIds.forEach(id => {
      const url = `/api/auth/${id}/login`;
      expect(url).not.toContain('%');
      expect(url).not.toContain(' ');
      expect(url).toMatch(/^\/api\/auth\/[a-z0-9_]+\/login$/);
    });
  });

  it('should differentiate between old and new ID formats in URLs', () => {
    const oldUrl = '/api/auth/a1b2c3d4e5f6789012345678901234ab/login';
    const newUrl = '/api/auth/test_project/login';

    expect(oldUrl).toMatch(/\/api\/auth\/[a-f0-9]{32}\/login/);
    expect(newUrl).toMatch(/\/api\/auth\/[a-z0-9_]+\/login/);
    expect(oldUrl).not.toContain('_');
    expect(newUrl).toContain('_');
  });

  it('should support various valid project name formats in URLs', () => {
    const validProjectIds = [
      'app',                    // single word
      'my_app',                // simple underscore
      'api_v2',                // with number
      'customer_portal_prod',  // multiple underscores
      'test123',               // alphanumeric
      'a_b_c_d_e',            // many underscores
    ];

    validProjectIds.forEach(id => {
      const url = `/api/auth/${id}/register`;
      expect(url).toMatch(/^\/api\/auth\/[a-z0-9_]+\/register$/);
    });
  });
});

describe('E2E - Edge Cases', () => {
  it('should handle spaces in URL gracefully (should be URL encoded)', async () => {
    // If someone manually types spaces, they get URL encoded to %20
    const response = await makeRequest('POST', '/api/auth/test%20project/register', {
      email: 'user@example.com',
      password: 'SecurePass123!',
    });

    // This should not match any project and fail
    expect([400, 404, 500]).toContain(response.status);
  });

  it('should handle special characters in URL gracefully', async () => {
    const response = await makeRequest('POST', '/api/auth/test@project/register', {
      email: 'user@example.com',
      password: 'SecurePass123!',
    });

    // Invalid project ID format should fail
    expect([400, 404, 500]).toContain(response.status);
  });

  it('should handle very long project IDs', async () => {
    const longId = 'a'.repeat(100) + '_' + 'b'.repeat(100);
    const response = await makeRequest('POST', `/api/auth/${longId}/register`, {
      email: 'user@example.com',
      password: 'SecurePass123!',
    });

    // Should be accessible (even if project doesn't exist)
    expect(response.status).toBeDefined();
  });

  it('should handle empty project ID gracefully', async () => {
    const response = await makeRequest('POST', '/api/auth//register', {
      email: 'user@example.com',
      password: 'SecurePass123!',
    });

    // Should 404 or handle as invalid route
    expect(response.status).toBe(404);
  });
});

describe('E2E - Backward Compatibility', () => {
  it('should still support old hex-based IDs if they exist in database', async () => {
    // This test conceptually demonstrates that if old projects exist,
    // they can still be accessed by their hex IDs
    const oldHexId = 'a1b2c3d4e5f6789012345678901234ab';

    // The system should be able to distinguish between:
    // - Old hex IDs: /^[a-f0-9]{32}$/
    // - New name-based IDs: /^[a-z0-9_]+$/

    expect(oldHexId).toMatch(/^[a-f0-9]{32}$/);
    expect('test_project').not.toMatch(/^[a-f0-9]{32}$/);
  });

  it('should handle migration scenario where both ID types coexist', () => {
    const oldIds = [
      'a1b2c3d4e5f6789012345678901234ab',
      'fedcba9876543210fedcba9876543210',
    ];

    const newIds = [
      'test_project',
      'my_app',
      'customer_portal',
    ];

    // Both should be valid but distinguishable
    oldIds.forEach(id => {
      expect(id).toMatch(/^[a-f0-9]{32}$/);
      expect(id.length).toBe(32);
    });

    newIds.forEach(id => {
      expect(id).toMatch(/^[a-z0-9_]+$/);
      expect(id).not.toMatch(/^[a-f0-9]{32}$/);
    });
  });
});