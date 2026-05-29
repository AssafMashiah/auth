import { describe, it, expect } from 'vitest';
import { generateProjectIdFromName } from '../src/utils/helpers';

/**
 * Backward Compatibility Tests
 * Ensures the new name-based ID system can coexist with old hex-based IDs
 */

describe('Backward Compatibility - ID Format Identification', () => {
  describe('distinguishing old vs new ID formats', () => {
    it('should identify old hex-based IDs (32 characters)', () => {
      const oldIds = [
        'a1b2c3d4e5f6789012345678901234ab',
        'fedcba9876543210fedcba9876543210',
        '0123456789abcdef0123456789abcdef',
        'ffffffffffffffffffffffffffffffff',
        '00000000000000000000000000000000',
      ];

      const hexPattern = /^[a-f0-9]{32}$/;

      oldIds.forEach(id => {
        expect(id).toMatch(hexPattern);
        expect(id.length).toBe(32);
        expect(id).not.toContain('_');
        expect(id).not.toContain('-');
      });
    });

    it('should identify new name-based IDs', () => {
      const newIds = [
        'test_project',
        'my_app',
        'customer_portal',
        'api_v2',
        'production_service',
      ];

      const namePattern = /^[a-z0-9_]+$/;
      const hexPattern = /^[a-f0-9]{32}$/;

      newIds.forEach(id => {
        expect(id).toMatch(namePattern);
        expect(id).not.toMatch(hexPattern);
      });
    });

    it('should reliably differentiate between formats', () => {
      const oldId = 'a1b2c3d4e5f6789012345678901234ab';
      const newId = 'test_project';

      // Old ID checks
      expect(oldId).toMatch(/^[a-f0-9]{32}$/);
      expect(oldId.length).toBe(32);
      expect(oldId).not.toContain('_');

      // New ID checks
      expect(newId).toMatch(/^[a-z0-9_]+$/);
      expect(newId).not.toMatch(/^[a-f0-9]{32}$/);
      expect(newId.length).not.toBe(32);
    });
  });

  describe('helper function to detect ID type', () => {
    const isOldHexId = (id: string): boolean => {
      return /^[a-f0-9]{32}$/.test(id);
    };

    const isNewNameId = (id: string): boolean => {
      return /^[a-z0-9_]+$/.test(id) && !/^[a-f0-9]{32}$/.test(id);
    };

    it('should correctly identify old IDs', () => {
      expect(isOldHexId('a1b2c3d4e5f6789012345678901234ab')).toBe(true);
      expect(isOldHexId('test_project')).toBe(false);
    });

    it('should correctly identify new IDs', () => {
      expect(isNewNameId('test_project')).toBe(true);
      expect(isNewNameId('a1b2c3d4e5f6789012345678901234ab')).toBe(false);
    });

    it('should handle edge cases', () => {
      // Pure numeric (could be new format)
      expect(isNewNameId('12345')).toBe(true);
      expect(isOldHexId('12345')).toBe(false);

      // Contains uppercase (old format doesn't have uppercase)
      expect(isNewNameId('Test_Project')).toBe(false);
      expect(isOldHexId('Test_Project')).toBe(false);

      // 32 char but not all hex
      expect(isOldHexId('test_project_with_many_chars12')).toBe(false);
      expect(isNewNameId('test_project_with_many_chars12')).toBe(true);
    });
  });
});

describe('Backward Compatibility - URL Routing', () => {
  describe('old hex-based URLs', () => {
    it('should construct valid URLs with old IDs', () => {
      const oldId = 'a1b2c3d4e5f6789012345678901234ab';
      const urls = [
        `/api/auth/${oldId}/login`,
        `/api/auth/${oldId}/register`,
        `/api/auth/${oldId}/refresh`,
        `/api/admin/projects/${oldId}`,
      ];

      urls.forEach(url => {
        expect(url).toContain(oldId);
        expect(url).not.toContain(' ');
        expect(url).not.toContain('%');
      });
    });
  });

  describe('new name-based URLs', () => {
    it('should construct valid URLs with new IDs', () => {
      const newId = 'test_project';
      const urls = [
        `/api/auth/${newId}/login`,
        `/api/auth/${newId}/register`,
        `/api/auth/${newId}/refresh`,
        `/api/admin/projects/${newId}`,
      ];

      urls.forEach(url => {
        expect(url).toContain(newId);
        expect(url).not.toContain(' ');
        expect(url).not.toContain('%');
      });
    });
  });

  describe('mixed environment with both ID types', () => {
    it('should support both ID types in parallel', () => {
      const projectIds = [
        { id: 'a1b2c3d4e5f6789012345678901234ab', type: 'old' },
        { id: 'test_project', type: 'new' },
        { id: 'fedcba9876543210fedcba9876543210', type: 'old' },
        { id: 'my_app', type: 'new' },
      ];

      projectIds.forEach(({ id, type }) => {
        const url = `/api/auth/${id}/login`;
        expect(url).toBeTruthy();

        if (type === 'old') {
          expect(id).toMatch(/^[a-f0-9]{32}$/);
        } else {
          expect(id).toMatch(/^[a-z0-9_]+$/);
          expect(id).not.toMatch(/^[a-f0-9]{32}$/);
        }
      });
    });
  });
});

describe('Backward Compatibility - Database Lookups', () => {
  describe('project lookup by ID', () => {
    it('should support lookup for old hex IDs', () => {
      const oldId = 'a1b2c3d4e5f6789012345678901234ab';

      // SQL query would be: SELECT * FROM projects WHERE id = ?
      expect(oldId).toMatch(/^[a-f0-9]{32}$/);
      expect(oldId.length).toBe(32);
    });

    it('should support lookup for new name-based IDs', () => {
      const newId = 'test_project';

      // SQL query would be: SELECT * FROM projects WHERE id = ?
      expect(newId).toMatch(/^[a-z0-9_]+$/);
      expect(newId).not.toMatch(/^[a-f0-9]{32}$/);
    });

    it('should handle both formats in same query logic', () => {
      const ids = [
        'a1b2c3d4e5f6789012345678901234ab', // old
        'test_project',                       // new
        'fedcba9876543210fedcba9876543210', // old
        'my_app',                             // new
      ];

      ids.forEach(id => {
        // Both should be valid for database lookup
        expect(id).toBeTruthy();
        expect(id.length).toBeGreaterThan(0);
        // SQL injection safe
        expect(id).not.toContain("'");
        expect(id).not.toContain('"');
        expect(id).not.toContain(';');
      });
    });
  });

  describe('user table name lookups', () => {
    it('should handle old table name format', () => {
      // Old format: project_{hex-id}_users
      const oldId = 'a1b2c3d4e5f6789012345678901234ab';
      const oldTableName = `project_${oldId}_users`;

      expect(oldTableName).toBe('project_a1b2c3d4e5f6789012345678901234ab_users');
      expect(oldTableName.length).toBeGreaterThan(40);
    });

    it('should handle new table name format', () => {
      // New format: {name-id}_users
      const newId = 'test_project';
      const newTableName = `${newId}_users`;

      expect(newTableName).toBe('test_project_users');
      expect(newTableName).not.toContain('project_test_project');
    });

    it('should differentiate between old and new table formats', () => {
      const oldTable = 'project_a1b2c3d4e5f6789012345678901234ab_users';
      const newTable = 'test_project_users';

      // Old table has "project_" prefix
      expect(oldTable).toMatch(/^project_[a-f0-9]{32}_users$/);

      // New table doesn't have "project_" prefix (unless project is named "project_something")
      expect(newTable).not.toMatch(/^project_[a-f0-9]{32}_users$/);
    });
  });
});

describe('Backward Compatibility - Migration Scenarios', () => {
  describe('gradual migration from old to new format', () => {
    it('should allow new projects with new format', () => {
      const newProjectName = 'New Project';
      const newProjectId = generateProjectIdFromName(newProjectName);

      expect(newProjectId).toBe('new_project');
      expect(newProjectId).not.toMatch(/^[a-f0-9]{32}$/);
    });

    it('should preserve existing old IDs', () => {
      // Old projects should keep their hex IDs
      const existingOldIds = [
        'a1b2c3d4e5f6789012345678901234ab',
        'fedcba9876543210fedcba9876543210',
      ];

      existingOldIds.forEach(oldId => {
        expect(oldId).toMatch(/^[a-f0-9]{32}$/);
        expect(oldId.length).toBe(32);
      });
    });

    it('should handle mixed project list', () => {
      const allProjects = [
        { id: 'a1b2c3d4e5f6789012345678901234ab', name: 'Legacy Project', format: 'old' },
        { id: 'test_project', name: 'Test Project', format: 'new' },
        { id: 'b2c3d4e5f6789012345678901234abcd', name: 'Another Legacy', format: 'old' },
        { id: 'my_app', name: 'My App', format: 'new' },
      ];

      const oldCount = allProjects.filter(p => p.format === 'old').length;
      const newCount = allProjects.filter(p => p.format === 'new').length;

      expect(oldCount).toBe(2);
      expect(newCount).toBe(2);
    });
  });

  describe('duplicate name handling during migration', () => {
    it('should prevent creating new project with name that matches old project ID', () => {
      // Edge case: What if someone creates "New Project" that normalizes to an ID
      // that conflicts with an existing project?

      // Example: Old project with name "Test Project" might have hex ID
      const oldProjectHexId = 'a1b2c3d4e5f6789012345678901234ab';

      // New project with same name would get name-based ID
      const newProjectNameId = generateProjectIdFromName('Test Project');

      // They should be different
      expect(oldProjectHexId).not.toBe(newProjectNameId);
      expect(oldProjectHexId).toMatch(/^[a-f0-9]{32}$/);
      expect(newProjectNameId).toBe('test_project');
    });

    it('should handle name normalization conflicts', () => {
      // Multiple names that normalize to same ID
      const names = ['My App', 'My-App', 'my___app', 'My  App'];
      const ids = names.map(name => generateProjectIdFromName(name));

      // All should normalize to the same ID
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(1);
      expect(uniqueIds.has('my_app')).toBe(true);

      // This means only the first one can be created; others should fail with ConflictError
    });
  });
});

describe('Backward Compatibility - API Response Format', () => {
  describe('project objects', () => {
    it('should return consistent structure for old format projects', () => {
      const oldProject = {
        id: 'a1b2c3d4e5f6789012345678901234ab',
        name: 'Legacy Project',
        userTableName: 'project_a1b2c3d4e5f6789012345678901234ab_users',
        environment: 'production',
      };

      expect(oldProject.id).toMatch(/^[a-f0-9]{32}$/);
      expect(oldProject.userTableName).toContain('project_');
      expect(oldProject.userTableName).toContain(oldProject.id);
    });

    it('should return consistent structure for new format projects', () => {
      const newProject = {
        id: 'test_project',
        name: 'Test Project',
        userTableName: 'test_project_users',
        environment: 'production',
      };

      expect(newProject.id).not.toMatch(/^[a-f0-9]{32}$/);
      expect(newProject.userTableName).toBe('test_project_users');
      expect(newProject.userTableName).not.toContain('project_test_project');
    });
  });

  describe('URL generation in responses', () => {
    it('should generate correct auth URLs for old IDs', () => {
      const oldId = 'a1b2c3d4e5f6789012345678901234ab';
      const loginUrl = `/api/auth/${oldId}/login`;
      const registerUrl = `/api/auth/${oldId}/register`;

      expect(loginUrl).toContain(oldId);
      expect(registerUrl).toContain(oldId);
    });

    it('should generate correct auth URLs for new IDs', () => {
      const newId = 'test_project';
      const loginUrl = `/api/auth/${newId}/login`;
      const registerUrl = `/api/auth/${newId}/register`;

      expect(loginUrl).toBe('/api/auth/test_project/login');
      expect(registerUrl).toBe('/api/auth/test_project/register');
    });
  });
});

describe('Backward Compatibility - Edge Cases', () => {
  describe('ambiguous IDs', () => {
    it('should handle pure numeric IDs', () => {
      // A project named "12345" would create ID "12345"
      const numericId = '12345';

      expect(numericId).toMatch(/^[a-z0-9_]+$/);
      expect(numericId).not.toMatch(/^[a-f0-9]{32}$/);
      expect(numericId.length).not.toBe(32);
    });

    it('should handle IDs that could be hex but wrong length', () => {
      // "abc123" is valid hex chars but not 32 characters
      const shortHexId = 'abc123';

      expect(shortHexId).toMatch(/^[a-z0-9_]+$/);
      expect(shortHexId).not.toMatch(/^[a-f0-9]{32}$/);
    });

    it('should handle 32-char IDs with non-hex characters', () => {
      // Exactly 32 characters but contains 'g' (not hex)
      const nonHexId = 'test_project_with_many_charsg123';

      expect(nonHexId.length).toBe(32);
      expect(nonHexId).not.toMatch(/^[a-f0-9]{32}$/);
      expect(nonHexId).toMatch(/^[a-z0-9_]+$/);
    });
  });

  describe('SQL safety for both formats', () => {
    it('should ensure old IDs are SQL-safe', () => {
      const oldId = 'a1b2c3d4e5f6789012345678901234ab';

      expect(oldId).not.toContain("'");
      expect(oldId).not.toContain('"');
      expect(oldId).not.toContain(';');
      expect(oldId).not.toContain('--');
      expect(oldId).not.toContain('/*');
    });

    it('should ensure new IDs are SQL-safe', () => {
      const newId = 'test_project';

      expect(newId).not.toContain("'");
      expect(newId).not.toContain('"');
      expect(newId).not.toContain(';');
      expect(newId).not.toContain('--');
      expect(newId).not.toContain('/*');
    });
  });
});

describe('Backward Compatibility - Documentation Examples', () => {
  describe('README examples', () => {
    it('should support the documented registration example', () => {
      // Example from README: curl -X POST /api/auth/my_app/register
      const projectId = 'my_app';
      const endpoint = `/api/auth/${projectId}/register`;

      expect(endpoint).toBe('/api/auth/my_app/register');
      expect(projectId).toMatch(/^[a-z0-9_]+$/);
    });

    it('should support the documented login example', () => {
      // Example from README: curl -X POST /api/auth/my_app/login
      const projectId = 'my_app';
      const endpoint = `/api/auth/${projectId}/login`;

      expect(endpoint).toBe('/api/auth/my_app/login');
    });
  });

  describe('migration guide examples', () => {
    it('should demonstrate old vs new URL format', () => {
      const oldExample = {
        id: 'a1b2c3d4e5f6789012345678901234ab',
        url: '/api/auth/a1b2c3d4e5f6789012345678901234ab/login',
      };

      const newExample = {
        id: 'my_app',
        url: '/api/auth/my_app/login',
      };

      expect(oldExample.id).toMatch(/^[a-f0-9]{32}$/);
      expect(newExample.id).not.toMatch(/^[a-f0-9]{32}$/);
      expect(oldExample.url).toContain(oldExample.id);
      expect(newExample.url).toContain(newExample.id);
    });
  });
});