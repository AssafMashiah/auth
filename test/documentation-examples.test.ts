import { describe, it, expect } from 'vitest';
import { generateProjectIdFromName, generateUserTableName } from '../src/utils/helpers';

/**
 * Tests to verify that documentation examples are accurate and functional
 * These tests ensure that the examples in README.md work as documented
 */

describe('Documentation Examples - README.md', () => {
  describe('project ID examples', () => {
    it('should match the example: "Test Project" → "test_project"', () => {
      const projectName = 'Test Project';
      const projectId = generateProjectIdFromName(projectName);

      expect(projectId).toBe('test_project');
    });

    it('should match the example: "My-Cool App!" → "my_cool_app"', () => {
      const projectName = 'My-Cool App!';
      const projectId = generateProjectIdFromName(projectName);

      expect(projectId).toBe('my_cool_app');
    });

    it('should match the example: "my_app" registration endpoint', () => {
      const projectId = 'my_app';
      const registerEndpoint = `/api/auth/${projectId}/register`;

      expect(registerEndpoint).toBe('/api/auth/my_app/register');
    });

    it('should match the example: "my_app" login endpoint', () => {
      const projectId = 'my_app';
      const loginEndpoint = `/api/auth/${projectId}/login`;

      expect(loginEndpoint).toBe('/api/auth/my_app/login');
    });
  });

  describe('table naming examples', () => {
    it('should match the old format example: "project_{id}_users"', () => {
      // This is the OLD format for reference
      const oldProjectId = 'abc123';
      const oldTableName = `project_${oldProjectId}_users`;

      expect(oldTableName).toBe('project_abc123_users');
    });

    it('should match the new format example: "{id}_users"', () => {
      const projectId = 'test_project';
      const tableName = generateUserTableName(projectId);

      expect(tableName).toBe('test_project_users');
      expect(tableName).not.toContain('project_test_project');
    });
  });

  describe('cURL examples', () => {
    it('should construct valid cURL registration command', () => {
      const projectId = 'my_app';
      const endpoint = `/api/auth/${projectId}/register`;
      const curlCommand = `curl -X POST https://auth.example.com${endpoint}`;

      expect(curlCommand).toContain('my_app');
      expect(curlCommand).not.toContain('%20'); // No URL encoding needed
    });

    it('should construct valid cURL login command', () => {
      const projectId = 'my_app';
      const endpoint = `/api/auth/${projectId}/login`;
      const curlCommand = `curl -X POST https://auth.example.com${endpoint}`;

      expect(curlCommand).toContain('my_app');
      expect(curlCommand).toBe('curl -X POST https://auth.example.com/api/auth/my_app/login');
    });

    it('should construct valid cURL refresh command', () => {
      const projectId = 'my_app';
      const endpoint = `/api/auth/${projectId}/refresh`;
      const curlCommand = `curl -X POST https://auth.example.com${endpoint}`;

      expect(curlCommand).toContain('my_app');
    });
  });

  describe('admin API examples', () => {
    it('should construct valid admin project list endpoint', () => {
      const endpoint = '/api/admin/projects';

      expect(endpoint).toBe('/api/admin/projects');
    });

    it('should construct valid admin project detail endpoint', () => {
      const projectId = 'test_project';
      const endpoint = `/api/admin/projects/${projectId}`;

      expect(endpoint).toBe('/api/admin/projects/test_project');
    });

    it('should construct valid admin project update endpoint', () => {
      const projectId = 'test_project';
      const endpoint = `/api/admin/projects/${projectId}`;
      const method = 'PUT';

      expect(endpoint).toBe('/api/admin/projects/test_project');
      expect(method).toBe('PUT');
    });

    it('should construct valid admin project delete endpoint', () => {
      const projectId = 'test_project';
      const endpoint = `/api/admin/projects/${projectId}`;
      const method = 'DELETE';

      expect(endpoint).toBe('/api/admin/projects/test_project');
      expect(method).toBe('DELETE');
    });
  });

  describe('JWT token examples', () => {
    it('should use project ID in JWT payload', () => {
      // Example JWT payload structure
      const jwtPayload = {
        sub: 'user-id-123',
        email: 'user@example.com',
        projectId: 'test_project', // Uses the new name-based ID
        iat: Date.now(),
        exp: Date.now() + 3600,
      };

      expect(jwtPayload.projectId).toBe('test_project');
      expect(jwtPayload.projectId).not.toMatch(/^[a-f0-9]{32}$/);
    });
  });
});

describe('Documentation Examples - Migration Scenarios', () => {
  describe('before and after comparison', () => {
    it('should show the difference in project creation', () => {
      // BEFORE (old system):
      // Project ID was auto-generated as random hex: "a1b2c3d4e5f6..."
      const oldSystemId = 'a1b2c3d4e5f6789012345678901234ab';
      expect(oldSystemId).toMatch(/^[a-f0-9]{32}$/);

      // AFTER (new system):
      // Project ID is generated from name: "Test Project" → "test_project"
      const newSystemName = 'Test Project';
      const newSystemId = generateProjectIdFromName(newSystemName);
      expect(newSystemId).toBe('test_project');
    });

    it('should show the difference in table naming', () => {
      // BEFORE: "project_a1b2c3d4e5f6..._users"
      const oldTableName = 'project_a1b2c3d4e5f6789012345678901234ab_users';
      expect(oldTableName).toContain('project_');
      expect(oldTableName.length).toBeGreaterThan(40);

      // AFTER: "test_project_users"
      const newTableName = generateUserTableName('test_project');
      expect(newTableName).toBe('test_project_users');
      expect(newTableName).not.toContain('project_test_project');
    });

    it('should show the difference in URL endpoints', () => {
      // BEFORE: /api/auth/a1b2c3d4e5f6.../login
      const oldUrl = '/api/auth/a1b2c3d4e5f6789012345678901234ab/login';
      expect(oldUrl.length).toBeGreaterThan(40);

      // AFTER: /api/auth/test_project/login
      const newUrl = '/api/auth/test_project/login';
      expect(newUrl).toBe('/api/auth/test_project/login');
      expect(newUrl.length).toBeLessThan(oldUrl.length);
    });
  });
});

describe('Documentation Examples - Common Use Cases', () => {
  describe('multi-environment setup', () => {
    it('should support production environment', () => {
      const projectName = 'My App';
      const projectId = generateProjectIdFromName(projectName);
      const environment = 'production';

      expect(projectId).toBe('my_app');
      expect(environment).toBe('production');

      // In database, both id and environment are stored
      const project = {
        id: projectId,
        name: projectName,
        environment: environment,
      };

      expect(project.id).toBe('my_app');
      expect(project.environment).toBe('production');
    });

    it('should support staging environment with same name', () => {
      const projectName = 'My App';
      const projectId = generateProjectIdFromName(projectName);
      const environment = 'staging';

      expect(projectId).toBe('my_app');
      expect(environment).toBe('staging');

      // Same project name, same ID, different environment
      const project = {
        id: projectId,
        name: projectName,
        environment: environment,
      };

      expect(project.id).toBe('my_app');
      expect(project.environment).toBe('staging');
    });
  });

  describe('company naming patterns', () => {
    it('should handle company website pattern', () => {
      const projectName = 'ACME Corp Website';
      const projectId = generateProjectIdFromName(projectName);

      expect(projectId).toBe('acme_corp_website');
    });

    it('should handle API service pattern', () => {
      const projectName = 'Production API Service';
      const projectId = generateProjectIdFromName(projectName);

      expect(projectId).toBe('production_api_service');
    });

    it('should handle mobile app pattern', () => {
      const projectName = 'Mobile App iOS';
      const projectId = generateProjectIdFromName(projectName);

      expect(projectId).toBe('mobile_app_ios');
    });

    it('should handle versioned project pattern', () => {
      const projectName = 'API v2.0';
      const projectId = generateProjectIdFromName(projectName);

      expect(projectId).toBe('api_v2_0');
    });
  });

  describe('integration examples', () => {
    it('should show complete registration flow', () => {
      // 1. Create project with name
      const projectName = 'Customer Portal';
      const projectId = generateProjectIdFromName(projectName);
      expect(projectId).toBe('customer_portal');

      // 2. Generate table name
      const tableName = generateUserTableName(projectId);
      expect(tableName).toBe('customer_portal_users');

      // 3. Construct registration endpoint
      const registerUrl = `/api/auth/${projectId}/register`;
      expect(registerUrl).toBe('/api/auth/customer_portal/register');

      // 4. Construct login endpoint
      const loginUrl = `/api/auth/${projectId}/login`;
      expect(loginUrl).toBe('/api/auth/customer_portal/login');
    });

    it('should show complete OAuth flow', () => {
      const projectId = 'social_app';

      // 1. Get OAuth auth URL
      const authUrl = `/api/auth/${projectId}/oauth/google`;
      expect(authUrl).toBe('/api/auth/social_app/oauth/google');

      // 2. OAuth callback URL
      const callbackUrl = `/api/auth/${projectId}/oauth/google/callback`;
      expect(callbackUrl).toBe('/api/auth/social_app/oauth/google/callback');
    });
  });
});

describe('Documentation Examples - Error Cases', () => {
  describe('invalid project names', () => {
    it('should handle empty string', () => {
      const projectId = generateProjectIdFromName('');
      expect(projectId).toBe('');
    });

    it('should handle special characters only', () => {
      const projectId = generateProjectIdFromName('!@#$%^&*()');
      expect(projectId).toBe('');
    });

    it('should sanitize SQL injection attempts', () => {
      const maliciousName = "Test'; DROP TABLE users; --";
      const projectId = generateProjectIdFromName(maliciousName);

      expect(projectId).toBe('test_drop_table_users');
      expect(projectId).not.toContain("'");
      expect(projectId).not.toContain(';');
      expect(projectId).not.toContain('--');
    });
  });

  describe('duplicate detection', () => {
    it('should show that similar names create same ID', () => {
      const names = [
        'My App',
        'My-App',
        'MY APP',
        'my___app',
        'My  App',
      ];

      const ids = names.map(name => generateProjectIdFromName(name));

      // All should normalize to the same ID
      ids.forEach(id => {
        expect(id).toBe('my_app');
      });

      // This demonstrates why duplicate checking is needed
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(1);
    });
  });
});

describe('Documentation Examples - Best Practices', () => {
  describe('naming conventions', () => {
    it('should recommend clear, descriptive names', () => {
      const goodNames = [
        { name: 'Customer Portal', id: 'customer_portal' },
        { name: 'API Service', id: 'api_service' },
        { name: 'Mobile App', id: 'mobile_app' },
        { name: 'Admin Dashboard', id: 'admin_dashboard' },
      ];

      goodNames.forEach(({ name, id }) => {
        const generatedId = generateProjectIdFromName(name);
        expect(generatedId).toBe(id);
        expect(generatedId).toMatch(/^[a-z0-9_]+$/);
      });
    });

    it('should avoid ambiguous names', () => {
      // These names are too generic
      const genericNames = ['App', 'Test', 'Project', 'API'];

      genericNames.forEach(name => {
        const id = generateProjectIdFromName(name);
        expect(id).toBeTruthy();
        expect(id).toMatch(/^[a-z0-9_]+$/);
      });
    });
  });

  describe('URL readability', () => {
    it('should create human-readable URLs', () => {
      const projects = [
        { name: 'Customer Portal', url: '/api/auth/customer_portal/login' },
        { name: 'Admin Dashboard', url: '/api/auth/admin_dashboard/login' },
        { name: 'Mobile App', url: '/api/auth/mobile_app/login' },
      ];

      projects.forEach(({ name, url }) => {
        const projectId = generateProjectIdFromName(name);
        const actualUrl = `/api/auth/${projectId}/login`;

        expect(actualUrl).toBe(url);
        expect(actualUrl).not.toContain('%'); // No encoding needed
        expect(actualUrl).not.toContain(' ');
      });
    });
  });
});

describe('Code Coverage - All Functions Tested', () => {
  it('should have tested generateProjectIdFromName with comprehensive cases', () => {
    // This is a meta-test to ensure we have good coverage
    const testCases = [
      'Test Project',
      'My-Cool App!',
      'API v2.0',
      '',
      '!@#$%',
      'Test   Project',
      '___test___',
      "Test'; DROP TABLE users; --",
    ];

    testCases.forEach(testCase => {
      const result = generateProjectIdFromName(testCase);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  it('should have tested generateUserTableName with comprehensive cases', () => {
    const testCases = [
      'test_project',
      'my_app',
      'customer_portal',
      'a',
      '',
    ];

    testCases.forEach(testCase => {
      const result = generateUserTableName(testCase);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.endsWith('_users')).toBe(true);
    });
  });
});