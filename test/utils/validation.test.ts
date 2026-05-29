import { describe, it, expect } from 'vitest';
import {
  createProjectSchema,
  updateProjectSchema,
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  createOAuthProviderSchema,
  createRateLimitRuleSchema,
  validate,
  isValidEmail,
  sanitizeProjectName,
} from '../../src/utils/validation';

describe('Validation Utils', () => {
  describe('createProjectSchema', () => {
    it('should validate valid project data', () => {
      const data = {
        name: 'My Project',
        description: 'A test project',
        environment: 'production' as const,
      };

      const result = validate(createProjectSchema, data);
      expect(result.name).toBe('My Project');
      expect(result.environment).toBe('production');
    });

    it('should use default values', () => {
      const data = { name: 'My Project' };

      const result = validate(createProjectSchema, data);
      expect(result.environment).toBe('production');
      expect(result.jwtExpirySeconds).toBe(3600);
    });

    it('should reject short names', () => {
      const data = { name: 'ab' };

      expect(() => validate(createProjectSchema, data)).toThrow();
    });

    it('should reject long names', () => {
      const data = { name: 'a'.repeat(51) };

      expect(() => validate(createProjectSchema, data)).toThrow();
    });

    it('should reject invalid name characters', () => {
      const data = { name: 'My@Project' };

      expect(() => validate(createProjectSchema, data)).toThrow();
    });

    it('should accept valid environments', () => {
      const environments = ['production', 'staging', 'development'] as const;

      environments.forEach(env => {
        const data = { name: 'Test Project', environment: env };
        const result = validate(createProjectSchema, data);
        expect(result.environment).toBe(env);
      });
    });

    it('should validate siteUrl as valid URL', () => {
      const data = { name: 'Test', siteUrl: 'https://example.com' };
      const result = validate(createProjectSchema, data);
      expect(result.siteUrl).toBe('https://example.com');
    });

    it('should reject invalid siteUrl', () => {
      const data = { name: 'Test', siteUrl: 'not-a-url' };

      expect(() => validate(createProjectSchema, data)).toThrow();
    });
  });

  describe('updateProjectSchema', () => {
    it('should validate partial updates', () => {
      const data = { name: 'Updated Name' };

      const result = validate(updateProjectSchema, data);
      expect(result.name).toBe('Updated Name');
    });

    it('should allow updating enabled status', () => {
      const data = { enabled: false };

      const result = validate(updateProjectSchema, data);
      expect(result.enabled).toBe(false);
    });

    it('should allow updating JWT expiry', () => {
      const data = { jwtExpirySeconds: 7200 };

      const result = validate(updateProjectSchema, data);
      expect(result.jwtExpirySeconds).toBe(7200);
    });

    it('should reject invalid JWT expiry', () => {
      const data = { jwtExpirySeconds: 30 };

      expect(() => validate(updateProjectSchema, data)).toThrow();
    });
  });

  describe('registerSchema', () => {
    it('should validate valid registration data', () => {
      const data = {
        email: 'test@example.com',
        password: 'Password123',
        displayName: 'Test User',
      };

      const result = validate(registerSchema, data);
      expect(result.email).toBe('test@example.com');
    });

    it('should reject invalid email', () => {
      const data = {
        email: 'not-an-email',
        password: 'Password123',
      };

      expect(() => validate(registerSchema, data)).toThrow();
    });

    it('should reject short password', () => {
      const data = {
        email: 'test@example.com',
        password: 'pass',
      };

      expect(() => validate(registerSchema, data)).toThrow();
    });

    it('should reject password without lowercase', () => {
      const data = {
        email: 'test@example.com',
        password: 'PASSWORD123',
      };

      expect(() => validate(registerSchema, data)).toThrow();
    });

    it('should reject password without uppercase', () => {
      const data = {
        email: 'test@example.com',
        password: 'password123',
      };

      expect(() => validate(registerSchema, data)).toThrow();
    });

    it('should reject password without number', () => {
      const data = {
        email: 'test@example.com',
        password: 'Passwordabc',
      };

      expect(() => validate(registerSchema, data)).toThrow();
    });

    it('should allow optional displayName', () => {
      const data = {
        email: 'test@example.com',
        password: 'Password123',
      };

      const result = validate(registerSchema, data);
      expect(result.displayName).toBeUndefined();
    });
  });

  describe('loginSchema', () => {
    it('should validate valid login data', () => {
      const data = {
        email: 'test@example.com',
        password: 'password123',
      };

      const result = validate(loginSchema, data);
      expect(result.email).toBe('test@example.com');
    });

    it('should reject missing email', () => {
      const data = { password: 'password123' };

      expect(() => validate(loginSchema, data)).toThrow();
    });

    it('should reject missing password', () => {
      const data = { email: 'test@example.com' };

      expect(() => validate(loginSchema, data)).toThrow();
    });
  });

  describe('refreshTokenSchema', () => {
    it('should validate valid refresh token', () => {
      const data = { refreshToken: 'token123' };

      const result = validate(refreshTokenSchema, data);
      expect(result.refreshToken).toBe('token123');
    });

    it('should reject empty token', () => {
      const data = { refreshToken: '' };

      expect(() => validate(refreshTokenSchema, data)).toThrow();
    });
  });

  describe('forgotPasswordSchema', () => {
    it('should validate valid email', () => {
      const data = { email: 'test@example.com' };

      const result = validate(forgotPasswordSchema, data);
      expect(result.email).toBe('test@example.com');
    });
  });

  describe('resetPasswordSchema', () => {
    it('should validate valid reset data', () => {
      const data = {
        token: 'reset-token',
        newPassword: 'NewPassword123',
      };

      const result = validate(resetPasswordSchema, data);
      expect(result.token).toBe('reset-token');
    });

    it('should validate password requirements', () => {
      const data = {
        token: 'reset-token',
        newPassword: 'pass',
      };

      expect(() => validate(resetPasswordSchema, data)).toThrow();
    });
  });

  describe('createOAuthProviderSchema', () => {
    it('should validate valid OAuth provider data', () => {
      const data = {
        providerName: 'google' as const,
        clientId: 'client-id',
        clientSecret: 'client-secret',
      };

      const result = validate(createOAuthProviderSchema, data);
      expect(result.providerName).toBe('google');
    });

    it('should accept optional URLs', () => {
      const data = {
        providerName: 'google' as const,
        clientId: 'client-id',
        clientSecret: 'client-secret',
        authorizationUrl: 'https://auth.example.com',
      };

      const result = validate(createOAuthProviderSchema, data);
      expect(result.authorizationUrl).toBe('https://auth.example.com');
    });

    it('should accept scopes array', () => {
      const data = {
        providerName: 'google' as const,
        clientId: 'client-id',
        clientSecret: 'client-secret',
        scopes: ['email', 'profile'],
      };

      const result = validate(createOAuthProviderSchema, data);
      expect(result.scopes).toEqual(['email', 'profile']);
    });

    it('should reject invalid provider name', () => {
      const data = {
        providerName: 'invalid',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      };

      expect(() => validate(createOAuthProviderSchema, data)).toThrow();
    });
  });

  describe('createRateLimitRuleSchema', () => {
    it('should validate valid rate limit rule', () => {
      const data = {
        ruleType: 'per_ip' as const,
        windowSeconds: 60,
        maxAttempts: 5,
      };

      const result = validate(createRateLimitRuleSchema, data);
      expect(result.ruleType).toBe('per_ip');
      expect(result.windowSeconds).toBe(60);
    });

    it('should use default values', () => {
      const data = {
        ruleType: 'per_ip' as const,
        windowSeconds: 60,
        maxAttempts: 5,
      };

      const result = validate(createRateLimitRuleSchema, data);
      expect(result.action).toBe('block');
      expect(result.blockDurationSeconds).toBe(300);
      expect(result.enabled).toBe(true);
    });

    it('should reject invalid window', () => {
      const data = {
        ruleType: 'per_ip' as const,
        windowSeconds: 0,
        maxAttempts: 5,
      };

      expect(() => validate(createRateLimitRuleSchema, data)).toThrow();
    });
  });

  describe('isValidEmail', () => {
    it('should return true for valid emails', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name+tag@example.co.uk')).toBe(true);
    });

    it('should return false for invalid emails', () => {
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('test@')).toBe(false);
    });
  });

  describe('sanitizeProjectName', () => {
    it('should convert to lowercase', () => {
      expect(sanitizeProjectName('TEST')).toBe('test');
    });

    it('should replace non-alphanumeric with underscores', () => {
      expect(sanitizeProjectName('My Project!')).toBe('my_project_');
    });

    it('should preserve underscores', () => {
      expect(sanitizeProjectName('my_project')).toBe('my_project');
    });

    it('should handle empty string', () => {
      expect(sanitizeProjectName('')).toBe('');
    });
  });
});