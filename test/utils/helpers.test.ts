import { describe, it, expect } from 'vitest';
import {
  generateProjectIdFromName,
  generateUserTableName,
  sanitizeTableName,
  addSeconds,
  getTimestamp,
  isExpired,
  safeJsonParse,
  safeJsonStringify,
  createPaginationInfo,
  maskSensitiveData,
  formatBytes,
  randomHex,
} from '../../src/utils/helpers';

describe('generateProjectIdFromName', () => {
  describe('basic conversion', () => {
    it('should convert "Test Project" to "test_project"', () => {
      expect(generateProjectIdFromName('Test Project')).toBe('test_project');
    });

    it('should convert "My App" to "my_app"', () => {
      expect(generateProjectIdFromName('My App')).toBe('my_app');
    });

    it('should convert single word to lowercase', () => {
      expect(generateProjectIdFromName('Dashboard')).toBe('dashboard');
    });
  });

  describe('special characters', () => {
    it('should convert "My-Cool App!" to "my_cool_app"', () => {
      expect(generateProjectIdFromName('My-Cool App!')).toBe('my_cool_app');
    });

    it('should handle dashes and replace with underscores', () => {
      expect(generateProjectIdFromName('test-app-name')).toBe('test_app_name');
    });

    it('should remove special characters like @#$%', () => {
      expect(generateProjectIdFromName('test@app#name$')).toBe('test_app_name');
    });

    it('should handle parentheses and brackets', () => {
      expect(generateProjectIdFromName('My App (Beta) [v2]')).toBe('my_app_beta_v2');
    });

    it('should handle punctuation marks', () => {
      expect(generateProjectIdFromName('Hello, World!')).toBe('hello_world');
    });

    it('should handle ampersands', () => {
      expect(generateProjectIdFromName('John & Jane App')).toBe('john_jane_app');
    });
  });

  describe('multiple spaces and underscores', () => {
    it('should consolidate multiple spaces: "My   App" to "my_app"', () => {
      expect(generateProjectIdFromName('My   App')).toBe('my_app');
    });

    it('should consolidate consecutive underscores', () => {
      expect(generateProjectIdFromName('test___app___name')).toBe('test_app_name');
    });

    it('should handle mixed spaces and underscores', () => {
      expect(generateProjectIdFromName('test _ _ app')).toBe('test_app');
    });

    it('should handle tabs and newlines as spaces', () => {
      expect(generateProjectIdFromName('test\tapp\nname')).toBe('test_app_name');
    });
  });

  describe('leading and trailing characters', () => {
    it('should remove leading underscores', () => {
      expect(generateProjectIdFromName('_test_app')).toBe('test_app');
    });

    it('should remove trailing underscores', () => {
      expect(generateProjectIdFromName('test_app_')).toBe('test_app');
    });

    it('should remove both leading and trailing underscores', () => {
      expect(generateProjectIdFromName('___test_app___')).toBe('test_app');
    });

    it('should trim leading and trailing spaces', () => {
      expect(generateProjectIdFromName('  test app  ')).toBe('test_app');
    });

    it('should handle leading special characters', () => {
      expect(generateProjectIdFromName('!@#test app')).toBe('test_app');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      expect(generateProjectIdFromName('')).toBe('');
    });

    it('should handle string with only spaces', () => {
      expect(generateProjectIdFromName('   ')).toBe('');
    });

    it('should handle string with only special characters', () => {
      expect(generateProjectIdFromName('!@#$%^&*()')).toBe('');
    });

    it('should handle very long names', () => {
      const longName = 'a'.repeat(100) + ' ' + 'b'.repeat(100);
      const result = generateProjectIdFromName(longName);
      expect(result).toBe('a'.repeat(100) + '_' + 'b'.repeat(100));
      expect(result.length).toBe(201); // 100 + 1 underscore + 100
    });

    it('should handle single character', () => {
      expect(generateProjectIdFromName('a')).toBe('a');
    });

    it('should handle numbers', () => {
      expect(generateProjectIdFromName('Project 123')).toBe('project_123');
    });

    it('should handle numbers only', () => {
      expect(generateProjectIdFromName('12345')).toBe('12345');
    });
  });

  describe('unicode and international characters', () => {
    it('should handle unicode characters (emoji)', () => {
      const result = generateProjectIdFromName('My App 🚀');
      expect(result).toBe('my_app');
    });

    it('should handle accented characters', () => {
      const result = generateProjectIdFromName('Café App');
      expect(result).toBe('caf_app');
    });

    it('should handle Chinese characters', () => {
      const result = generateProjectIdFromName('我的应用 My App');
      expect(result).toBe('my_app');
    });

    it('should handle mixed unicode', () => {
      const result = generateProjectIdFromName('Test 日本語 App');
      expect(result).toBe('test_app');
    });
  });

  describe('SQL safety', () => {
    it('should produce alphanumeric + underscore only output', () => {
      const inputs = [
        'Test-App!',
        'My@App#123',
        'App$%^&*()',
        'Test"App\'Name',
        'App;DROP TABLE users;--',
        '../../../etc/passwd',
        '<script>alert("xss")</script>',
      ];

      inputs.forEach(input => {
        const result = generateProjectIdFromName(input);
        expect(result).toMatch(/^[a-z0-9_]*$/);
      });
    });

    it('should prevent SQL injection patterns', () => {
      const malicious = "test'; DROP TABLE users; --";
      const result = generateProjectIdFromName(malicious);
      expect(result).toBe('test_drop_table_users');
      expect(result).toMatch(/^[a-z0-9_]*$/);
    });

    it('should prevent path traversal patterns', () => {
      const result = generateProjectIdFromName('../../../secret');
      expect(result).toBe('secret');
    });
  });

  describe('common project name patterns', () => {
    it('should handle company website format', () => {
      expect(generateProjectIdFromName('ACME Corp Website')).toBe('acme_corp_website');
    });

    it('should handle version in name', () => {
      expect(generateProjectIdFromName('My App v2.0')).toBe('my_app_v2_0');
    });

    it('should handle environment suffix', () => {
      expect(generateProjectIdFromName('Production API')).toBe('production_api');
    });

    it('should handle platform suffix', () => {
      expect(generateProjectIdFromName('Mobile App iOS')).toBe('mobile_app_ios');
    });
  });
});

describe('generateUserTableName', () => {
  describe('basic functionality', () => {
    it('should generate table name with _users suffix', () => {
      expect(generateUserTableName('test_project')).toBe('test_project_users');
    });

    it('should not add "project_" prefix', () => {
      const tableName = generateUserTableName('my_app');
      expect(tableName).toBe('my_app_users');
      expect(tableName).not.toContain('project_');
    });

    it('should handle single word project ID', () => {
      expect(generateUserTableName('dashboard')).toBe('dashboard_users');
    });

    it('should handle project ID with numbers', () => {
      expect(generateUserTableName('app_v2')).toBe('app_v2_users');
    });
  });

  describe('various project ID formats', () => {
    it('should handle underscore-separated IDs', () => {
      expect(generateUserTableName('my_cool_app')).toBe('my_cool_app_users');
    });

    it('should handle IDs with multiple underscores', () => {
      expect(generateUserTableName('test_app_production')).toBe('test_app_production_users');
    });

    it('should handle short IDs', () => {
      expect(generateUserTableName('a')).toBe('a_users');
    });

    it('should handle long IDs', () => {
      const longId = 'a'.repeat(50);
      expect(generateUserTableName(longId)).toBe(longId + '_users');
    });
  });

  describe('sanitization through sanitizeTableName', () => {
    it('should sanitize project ID before creating table name', () => {
      // Even though project IDs should already be sanitized,
      // the function should handle edge cases
      expect(generateUserTableName('test-app')).toBe('testapp_users');
    });

    it('should remove special characters from project ID', () => {
      expect(generateUserTableName('test!@#app')).toBe('testapp_users');
    });

    it('should handle project ID with spaces', () => {
      expect(generateUserTableName('test app')).toBe('testapp_users');
    });

    it('should produce SQL-safe table names', () => {
      const result = generateUserTableName('test_project');
      expect(result).toMatch(/^[a-zA-Z0-9_]+$/);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      expect(generateUserTableName('')).toBe('_users');
    });

    it('should handle project ID that is only underscores', () => {
      expect(generateUserTableName('___')).toBe('____users');
    });

    it('should handle numeric project IDs', () => {
      expect(generateUserTableName('12345')).toBe('12345_users');
    });
  });
});

describe('sanitizeTableName', () => {
  describe('basic sanitization', () => {
    it('should allow alphanumeric characters', () => {
      expect(sanitizeTableName('abc123')).toBe('abc123');
    });

    it('should allow underscores', () => {
      expect(sanitizeTableName('test_table_name')).toBe('test_table_name');
    });

    it('should allow mixed case', () => {
      expect(sanitizeTableName('TestTable')).toBe('TestTable');
    });
  });

  describe('special character removal', () => {
    it('should remove spaces', () => {
      expect(sanitizeTableName('test table')).toBe('testtable');
    });

    it('should remove dashes', () => {
      expect(sanitizeTableName('test-table')).toBe('testtable');
    });

    it('should remove dots', () => {
      expect(sanitizeTableName('test.table')).toBe('testtable');
    });

    it('should remove all special characters', () => {
      expect(sanitizeTableName('test!@#$%^&*()table')).toBe('testtable');
    });

    it('should remove quotes', () => {
      expect(sanitizeTableName("test'table\"name")).toBe('testtablename');
    });
  });

  describe('SQL injection prevention', () => {
    it('should prevent SQL injection with semicolon', () => {
      expect(sanitizeTableName('test; DROP TABLE users;')).toBe('testDROPTABLEusers');
    });

    it('should prevent SQL injection with comments', () => {
      expect(sanitizeTableName('test-- comment')).toBe('testcomment');
    });

    it('should prevent SQL injection with union', () => {
      expect(sanitizeTableName('test UNION SELECT')).toBe('testUNIONSELECT');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      expect(sanitizeTableName('')).toBe('');
    });

    it('should handle string with only special characters', () => {
      expect(sanitizeTableName('!@#$%^&*()')).toBe('');
    });

    it('should handle unicode characters', () => {
      expect(sanitizeTableName('test🚀table')).toBe('testtable');
    });

    it('should handle very long names', () => {
      const longName = 'a'.repeat(100) + '!@#' + 'b'.repeat(100);
      const result = sanitizeTableName(longName);
      expect(result).toBe('a'.repeat(100) + 'b'.repeat(100));
    });
  });
});

// Test other utility functions for completeness
describe('addSeconds', () => {
  it('should add seconds to a date', () => {
    const date = new Date('2024-01-01T00:00:00Z');
    const result = addSeconds(date, 60);
    expect(result.toISOString()).toBe('2024-01-01T00:01:00.000Z');
  });

  it('should handle negative seconds', () => {
    const date = new Date('2024-01-01T00:01:00Z');
    const result = addSeconds(date, -60);
    expect(result.toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });
});

describe('getTimestamp', () => {
  it('should return ISO timestamp', () => {
    const timestamp = getTimestamp();
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('should accept custom date', () => {
    const date = new Date('2024-01-01T00:00:00Z');
    expect(getTimestamp(date)).toBe('2024-01-01T00:00:00.000Z');
  });
});

describe('isExpired', () => {
  it('should return true for past dates', () => {
    const pastDate = new Date(Date.now() - 1000).toISOString();
    expect(isExpired(pastDate)).toBe(true);
  });

  it('should return false for future dates', () => {
    const futureDate = new Date(Date.now() + 1000).toISOString();
    expect(isExpired(futureDate)).toBe(false);
  });
});

describe('safeJsonParse', () => {
  it('should parse valid JSON', () => {
    expect(safeJsonParse('{"key":"value"}', {})).toEqual({ key: 'value' });
  });

  it('should return default value for invalid JSON', () => {
    expect(safeJsonParse('invalid', { default: true })).toEqual({ default: true });
  });

  it('should return default value for null', () => {
    expect(safeJsonParse(null, { default: true })).toEqual({ default: true });
  });
});

describe('safeJsonStringify', () => {
  it('should stringify valid objects', () => {
    expect(safeJsonStringify({ key: 'value' })).toBe('{"key":"value"}');
  });

  it('should return null for circular references', () => {
    const circular: any = { a: 1 };
    circular.self = circular;
    expect(safeJsonStringify(circular)).toBeNull();
  });
});

describe('createPaginationInfo', () => {
  it('should create correct pagination info', () => {
    const info = createPaginationInfo(100, 1, 10);
    expect(info).toEqual({
      total: 100,
      page: 1,
      perPage: 10,
      totalPages: 10,
      hasNext: true,
      hasPrev: false,
    });
  });

  it('should handle last page', () => {
    const info = createPaginationInfo(100, 10, 10);
    expect(info.hasNext).toBe(false);
    expect(info.hasPrev).toBe(true);
  });
});

describe('maskSensitiveData', () => {
  it('should mask long strings', () => {
    expect(maskSensitiveData('1234567890')).toBe('1234...7890');
  });

  it('should mask short strings', () => {
    expect(maskSensitiveData('12345')).toBe('***');
  });
});

describe('formatBytes', () => {
  it('should format bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
  });
});

describe('randomHex', () => {
  it('should generate hex string of correct length', () => {
    const hex = randomHex(16);
    expect(hex.length).toBe(16);
    expect(hex).toMatch(/^[0-9a-f]+$/);
  });

  it('should generate different values', () => {
    const hex1 = randomHex(16);
    const hex2 = randomHex(16);
    expect(hex1).not.toBe(hex2);
  });
});