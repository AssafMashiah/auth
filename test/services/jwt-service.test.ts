import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jwtService, JWTService } from '../../src/services/jwt-service';
import type { Project } from '../../src/types';

const createMockProject = (overrides = {}): Project => ({
  id: 'test_project',
  name: 'Test Project',
  userTableName: 'test_project_users',
  jwtSecret: 'test-jwt-secret-key-256-bits-long!!!',
  jwtAlgorithm: 'HS256',
  jwtExpirySeconds: 3600,
  refreshTokenExpirySeconds: 604800,
  enabled: true,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  ...overrides,
});

describe('JWTService', () => {
  let service: JWTService;

  beforeEach(() => {
    service = new JWTService();
  });

  describe('generateAccessToken', () => {
    it('should generate a valid JWT token', async () => {
      const project = createMockProject();
      
      const token = await service.generateAccessToken(project, 'user123', 'test@example.com');
      
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should include user ID in token payload', async () => {
      const project = createMockProject();
      
      const token = await service.generateAccessToken(project, 'user123', 'test@example.com');
      const decoded = service.decodeToken(token);
      
      expect(decoded?.sub).toBe('user123');
    });

    it('should include email in token payload', async () => {
      const project = createMockProject();
      
      const token = await service.generateAccessToken(project, 'user123', 'test@example.com');
      const decoded = service.decodeToken(token);
      
      expect(decoded?.email).toBe('test@example.com');
    });

    it('should include project ID in token payload', async () => {
      const project = createMockProject();
      
      const token = await service.generateAccessToken(project, 'user123', 'test@example.com');
      const decoded = service.decodeToken(token);
      
      expect(decoded?.projectId).toBe('test_project');
    });

    it('should use configured algorithm', async () => {
      const project = createMockProject({ jwtAlgorithm: 'HS384' });
      
      const token = await service.generateAccessToken(project, 'user123', 'test@example.com');
      const decoded = service.decodeToken(token);
      
      expect(decoded).toBeTruthy();
    });

    it('should set expiration based on project config', async () => {
      const project = createMockProject({ jwtExpirySeconds: 7200 });
      
      const token = await service.generateAccessToken(project, 'user123', 'test@example.com');
      const decoded = service.decodeToken(token);
      
      expect(decoded?.exp).toBeTruthy();
      expect(decoded!.exp! - decoded!.iat!).toBe(7200);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify a valid token', async () => {
      const project = createMockProject();
      
      const token = await service.generateAccessToken(project, 'user123', 'test@example.com');
      const result = await service.verifyAccessToken(token, project.jwtSecret, project.jwtAlgorithm);
      
      expect(result.sub).toBe('user123');
      expect(result.email).toBe('test@example.com');
      expect(result.projectId).toBe('test_project');
    });

    it('should throw error for invalid token', async () => {
      const project = createMockProject();
      
      await expect(
        service.verifyAccessToken('invalid.token.here', project.jwtSecret, project.jwtAlgorithm)
      ).rejects.toThrow('Invalid or expired token');
    });

    it('should throw error for wrong secret', async () => {
      const project = createMockProject();
      
      const token = await service.generateAccessToken(project, 'user123', 'test@example.com');
      
      await expect(
        service.verifyAccessToken(token, 'wrong-secret', project.jwtAlgorithm)
      ).rejects.toThrow('Invalid or expired token');
    });

    it('should throw error for expired token', async () => {
      const project = createMockProject({ jwtExpirySeconds: -3600 }); // Expired
      
      const token = await service.generateAccessToken(project, 'user123', 'test@example.com');
      
      await expect(
        service.verifyAccessToken(token, project.jwtSecret, project.jwtAlgorithm)
      ).rejects.toThrow('Invalid or expired token');
    });

    it('should use default algorithm if not specified', async () => {
      const project = createMockProject();
      
      const token = await service.generateAccessToken(project, 'user123', 'test@example.com');
      const result = await service.verifyAccessToken(token, project.jwtSecret);
      
      expect(result.sub).toBe('user123');
    });
  });

  describe('decodeToken', () => {
    it('should decode a valid token without verification', async () => {
      const project = createMockProject();
      
      const token = await service.generateAccessToken(project, 'user123', 'test@example.com');
      const decoded = service.decodeToken(token);
      
      expect(decoded?.sub).toBe('user123');
      expect(decoded?.email).toBe('test@example.com');
    });

    it('should return null for invalid token', () => {
      const decoded = service.decodeToken('invalid.token');
      
      expect(decoded).toBeNull();
    });

    it('should return null for empty string', () => {
      const decoded = service.decodeToken('');
      
      expect(decoded).toBeNull();
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for valid token', async () => {
      const project = createMockProject();
      
      const token = await service.generateAccessToken(project, 'user123', 'test@example.com');
      const expired = service.isTokenExpired(token);
      
      expect(expired).toBe(false);
    });

    it('should return true for expired token', async () => {
      const project = createMockProject({ jwtExpirySeconds: -3600 });
      
      const token = await service.generateAccessToken(project, 'user123', 'test@example.com');
      const expired = service.isTokenExpired(token);
      
      expect(expired).toBe(true);
    });

    it('should return true for invalid token', () => {
      const expired = service.isTokenExpired('invalid');
      
      expect(expired).toBe(true);
    });
  });

  describe('getTokenExpiration', () => {
    it('should return expiration timestamp', async () => {
      const project = createMockProject();
      
      const token = await service.generateAccessToken(project, 'user123', 'test@example.com');
      const expiration = service.getTokenExpiration(token);
      
      expect(expiration).toBeTruthy();
      expect(typeof expiration).toBe('number');
    });

    it('should return null for invalid token', () => {
      const expiration = service.getTokenExpiration('invalid');
      
      expect(expiration).toBeNull();
    });
  });

  describe('extractTokenFromHeader', () => {
    it('should extract token from Bearer header', () => {
      const token = service.extractTokenFromHeader('Bearer abc123');
      
      expect(token).toBe('abc123');
    });

    it('should return null for non-Bearer header', () => {
      const token = service.extractTokenFromHeader('Basic abc123');
      
      expect(token).toBeNull();
    });

    it('should return null for null input', () => {
      const token = service.extractTokenFromHeader(null);
      
      expect(token).toBeNull();
    });

    it('should return null for malformed header', () => {
      const token = service.extractTokenFromHeader('Bearer');
      
      expect(token).toBeNull();
    });

    it('should return null for empty string', () => {
      const token = service.extractTokenFromHeader('');
      
      expect(token).toBeNull();
    });
  });
});

describe('jwtService singleton', () => {
  it('should be an instance of JWTService', () => {
    expect(jwtService).toBeInstanceOf(JWTService);
  });
});