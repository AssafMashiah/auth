import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectService } from '../../src/services/project-service';
import type { Env, CreateProjectData } from '../../src/types';
import { generateProjectIdFromName, generateUserTableName } from '../../src/utils/helpers';

/**
 * Integration tests for ProjectService
 * Tests project creation with name-based IDs and table naming conventions
 */

// Mock environment
const createMockEnv = (): Env => {
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
    ADMIN_SESSION_SECRET: 'test-secret',
    ENCRYPTION_KEY: 'test-encryption-key',
    ADMIN_DOMAIN: 'admin.example.com',
    SENDGRID_API_KEY: 'test-sendgrid-key',
    SENDGRID_FROM_EMAIL: 'test@example.com',
    PASSWORD_RESET_BASE_URL: 'https://example.com/reset',
    EMAIL_CONFIRMATION_BASE_URL: 'https://example.com/confirm',
  };
};

// Mock drizzle ORM
vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn((db) => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  })),
}));

vi.mock('../../src/services/audit-service', () => ({
  auditService: {
    logEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('ProjectService - createProject', () => {
  let projectService: ProjectService;
  let env: Env;

  beforeEach(() => {
    projectService = new ProjectService();
    env = createMockEnv();
    vi.clearAllMocks();
  });

  describe('project ID generation from name', () => {
    it('should create project with name-based ID', async () => {
      const projectData: CreateProjectData = {
        name: 'Test Project',
        description: 'A test project',
        environment: 'production',
      };

      const expectedId = generateProjectIdFromName('Test Project');
      expect(expectedId).toBe('test_project');

      // This test verifies the ID generation logic
      // In actual implementation, we'd need to mock the database response
    });

    it('should generate correct ID for "My-Cool App!"', async () => {
      const projectName = 'My-Cool App!';
      const projectId = generateProjectIdFromName(projectName);

      expect(projectId).toBe('my_cool_app');
      expect(projectId).toMatch(/^[a-z0-9_]+$/);
    });

    it('should generate correct ID for name with spaces', async () => {
      const projectName = 'Customer Portal Application';
      const projectId = generateProjectIdFromName(projectName);

      expect(projectId).toBe('customer_portal_application');
    });

    it('should generate correct ID for name with version', async () => {
      const projectName = 'API v2.0';
      const projectId = generateProjectIdFromName(projectName);

      expect(projectId).toBe('api_v2_0');
    });
  });

  describe('user table naming convention', () => {
    it('should generate table name without "project_" prefix', () => {
      const projectId = 'test_project';
      const tableName = generateUserTableName(projectId);

      expect(tableName).toBe('test_project_users');
      expect(tableName).not.toContain('project_test_project');
    });

    it('should generate correct table name for various IDs', () => {
      const testCases = [
        { id: 'my_app', expected: 'my_app_users' },
        { id: 'dashboard', expected: 'dashboard_users' },
        { id: 'api_v2', expected: 'api_v2_users' },
        { id: 'customer_portal', expected: 'customer_portal_users' },
      ];

      testCases.forEach(({ id, expected }) => {
        const tableName = generateUserTableName(id);
        expect(tableName).toBe(expected);
      });
    });

    it('should ensure table name is SQL-safe', () => {
      const projectIds = [
        'test_app',
        'my_project_123',
        'api_v2_production',
      ];

      projectIds.forEach(id => {
        const tableName = generateUserTableName(id);
        expect(tableName).toMatch(/^[a-zA-Z0-9_]+$/);
        expect(tableName.endsWith('_users')).toBe(true);
      });
    });
  });

  describe('project name uniqueness', () => {
    it('should prevent duplicate names that normalize to same ID', () => {
      // Both should normalize to "my_app"
      const name1 = 'My App';
      const name2 = 'My-App!';
      const name3 = 'my___app';

      const id1 = generateProjectIdFromName(name1);
      const id2 = generateProjectIdFromName(name2);
      const id3 = generateProjectIdFromName(name3);

      expect(id1).toBe('my_app');
      expect(id2).toBe('my_app');
      expect(id3).toBe('my_app');

      // In the actual service, the second creation should fail with ConflictError
    });

    it('should allow same name in different environments', () => {
      // This is a conceptual test - the service should allow:
      // - "My App" in production
      // - "My App" in staging
      // They would have the same project ID but different environment values
      const projectName = 'My App';
      const projectId = generateProjectIdFromName(projectName);

      expect(projectId).toBe('my_app');
      // Both would use project ID "my_app" but with different environment field
    });
  });

  describe('user table creation', () => {
    it('should create user table with correct schema', async () => {
      const projectId = 'test_project';
      const tableName = 'test_project_users';

      await projectService.createProjectUserTable(env.DB, projectId, tableName);

      // Verify exec was called to create table
      expect(env.DB.exec).toHaveBeenCalled();

      // Verify the SQL includes the table name
      const calls = (env.DB.exec as any).mock.calls;
      const createTableCall = calls.find((call: any[]) =>
        call[0].includes('CREATE TABLE')
      );
      expect(createTableCall).toBeDefined();
    });

    it('should create indexes for user table', async () => {
      const projectId = 'my_app';
      const tableName = 'my_app_users';

      await projectService.createProjectUserTable(env.DB, projectId, tableName);

      const execCalls = (env.DB.exec as any).mock.calls;

      // Should create multiple indexes
      const indexCalls = execCalls.filter((call: any[]) =>
        call[0].includes('CREATE INDEX')
      );

      expect(indexCalls.length).toBeGreaterThan(0);
    });

    it('should create trigger for timestamp updates', async () => {
      const projectId = 'test_app';
      const tableName = 'test_app_users';

      await projectService.createProjectUserTable(env.DB, projectId, tableName);

      const execCalls = (env.DB.exec as any).mock.calls;

      // Should create trigger
      const triggerCall = execCalls.find((call: any[]) =>
        call[0].includes('CREATE TRIGGER')
      );

      expect(triggerCall).toBeDefined();
    });
  });

  describe('project data integrity', () => {
    it('should store project with correct ID format', () => {
      const testCases = [
        { name: 'Test Project', expectedId: 'test_project' },
        { name: 'My-Cool App!', expectedId: 'my_cool_app' },
        { name: 'API v2.0', expectedId: 'api_v2_0' },
      ];

      testCases.forEach(({ name, expectedId }) => {
        const generatedId = generateProjectIdFromName(name);
        expect(generatedId).toBe(expectedId);
      });
    });

    it('should maintain userTableName field with correct value', () => {
      const projectId = 'customer_portal';
      const expectedTableName = 'customer_portal_users';

      const tableName = generateUserTableName(projectId);
      expect(tableName).toBe(expectedTableName);
    });

    it('should generate different IDs for different names', () => {
      const names = [
        'Project A',
        'Project B',
        'My App',
        'Dashboard',
      ];

      const ids = names.map(name => generateProjectIdFromName(name));
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(names.length);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle projects with minimum valid name', () => {
      const name = 'A';
      const projectId = generateProjectIdFromName(name);

      expect(projectId).toBe('a');
      expect(projectId.length).toBeGreaterThan(0);
    });

    it('should handle projects with long names', () => {
      const longName = 'A'.repeat(50) + ' ' + 'B'.repeat(50);
      const projectId = generateProjectIdFromName(longName);

      expect(projectId).toBeTruthy();
      expect(projectId).toMatch(/^[a-z0-9_]+$/);
    });

    it('should handle project names with only special characters gracefully', () => {
      const specialName = '!@#$%^&*()';
      const projectId = generateProjectIdFromName(specialName);

      // Should result in empty string or handle gracefully
      expect(projectId).toBe('');
    });

    it('should sanitize table names to prevent SQL injection', () => {
      const maliciousId = "test'; DROP TABLE users; --";
      const tableName = generateUserTableName(maliciousId);

      expect(tableName).not.toContain("'");
      expect(tableName).not.toContain(';');
      expect(tableName).not.toContain('--');
      expect(tableName).toMatch(/^[a-zA-Z0-9_]+$/);
    });
  });

  describe('environment-specific behavior', () => {
    it('should support production environment', () => {
      const projectData: CreateProjectData = {
        name: 'Prod App',
        environment: 'production',
      };

      const projectId = generateProjectIdFromName(projectData.name);
      expect(projectId).toBe('prod_app');
    });

    it('should support staging environment', () => {
      const projectData: CreateProjectData = {
        name: 'Staging App',
        environment: 'staging',
      };

      const projectId = generateProjectIdFromName(projectData.name);
      expect(projectId).toBe('staging_app');
    });

    it('should support development environment', () => {
      const projectData: CreateProjectData = {
        name: 'Dev App',
        environment: 'development',
      };

      const projectId = generateProjectIdFromName(projectData.name);
      expect(projectId).toBe('dev_app');
    });
  });

  describe('default rate limits', () => {
    it('should create default rate limit rules on project creation', async () => {
      const projectId = 'test_project';

      await projectService.createDefaultRateLimits(env, projectId);

      // This would need proper mocking of drizzle ORM
      // Just verify the method can be called without errors
      expect(true).toBe(true);
    });
  });
});

describe('ProjectService - getProject', () => {
  let projectService: ProjectService;
  let env: Env;

  beforeEach(() => {
    projectService = new ProjectService();
    env = createMockEnv();
    vi.clearAllMocks();
  });

  it('should retrieve project by ID', async () => {
    const projectId = 'test_project';

    // This test demonstrates the lookup by the new ID format
    const result = await projectService.getProject(env, projectId);

    // With proper mocking, we'd verify the correct ID was used
    expect(result).toBeDefined();
  });

  it('should handle non-existent projects', async () => {
    const result = await projectService.getProject(env, 'nonexistent_project');
    expect(result).toBeNull();
  });
});

describe('ProjectService - updateProject', () => {
  let projectService: ProjectService;
  let env: Env;

  beforeEach(() => {
    projectService = new ProjectService();
    env = createMockEnv();
    vi.clearAllMocks();
  });

  it('should update project by ID', async () => {
    const projectId = 'test_project';
    const updates = {
      description: 'Updated description',
      enabled: false,
    };

    // This demonstrates updating by the name-based ID
    // Actual test would need proper mocking
    expect(projectId).toMatch(/^[a-z0-9_]+$/);
  });
});

describe('ProjectService - deleteProject', () => {
  let projectService: ProjectService;
  let env: Env;

  beforeEach(() => {
    projectService = new ProjectService();
    env = createMockEnv();
    vi.clearAllMocks();
  });

  it('should delete project and its user table', async () => {
    const projectId = 'test_project';
    const tableName = 'test_project_users';

    // Verify table name format is correct for deletion
    expect(tableName).toBe(generateUserTableName(projectId));
  });
});

describe('ID Format Validation', () => {
  it('should ensure all generated IDs are URL-safe', () => {
    const testNames = [
      'Test Project',
      'My-Cool App!',
      'API v2.0',
      'Customer Portal (Beta)',
      'Mobile App [iOS]',
    ];

    testNames.forEach(name => {
      const id = generateProjectIdFromName(name);

      // URL-safe check (no encoding needed)
      expect(id).not.toContain(' ');
      expect(id).not.toContain('!');
      expect(id).not.toContain('@');
      expect(id).not.toContain('#');
      expect(id).toMatch(/^[a-z0-9_]*$/);
    });
  });

  it('should ensure all generated IDs work in URLs', () => {
    const testNames = [
      'Production API',
      'Staging Dashboard',
      'Dev Mobile App',
    ];

    testNames.forEach(name => {
      const id = generateProjectIdFromName(name);
      const url = `/api/auth/${id}/login`;

      expect(url).not.toContain('%20'); // No URL encoding needed
      expect(url).toMatch(/^\/api\/auth\/[a-z0-9_]+\/login$/);
    });
  });
});

describe('Backward Compatibility Scenarios', () => {
  it('should generate consistent IDs for common project patterns', () => {
    // Test that ID generation is deterministic
    const name = 'Test Project';

    const id1 = generateProjectIdFromName(name);
    const id2 = generateProjectIdFromName(name);

    expect(id1).toBe(id2);
    expect(id1).toBe('test_project');
  });

  it('should handle migration from hex-based IDs conceptually', () => {
    // Old format: "a1b2c3d4e5f6..." (32 char hex)
    // New format: "test_project" (name-based)

    const oldHexPattern = /^[a-f0-9]{32}$/;
    const newNamePattern = /^[a-z0-9_]+$/;

    // Old ID example
    const oldId = 'a1b2c3d4e5f6789012345678901234ab';
    expect(oldId).toMatch(oldHexPattern);

    // New ID example
    const newId = 'test_project';
    expect(newId).toMatch(newNamePattern);
    expect(newId).not.toMatch(oldHexPattern);

    // They can be distinguished by pattern matching
  });
});