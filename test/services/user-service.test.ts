import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserService } from '../../src/services/user-service';
import type { Env } from '../../src/types';

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

describe('UserService', () => {
  let service: UserService;
  let env: Env;
  let mockDB: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    service = new UserService();
    env = createMockEnv();
    mockDB = env.DB as any;
    vi.clearAllMocks();
  });

  describe('getUserByEmail', () => {
    it('should return user when found', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        display_name: 'Test User',
        status: 'active',
      };
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(mockUser),
        }),
      });

      const result = await service.getUserByEmail(env, 'test_project_users', 'test@example.com');

      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
      });

      const result = await service.getUserByEmail(env, 'test_project_users', 'notfound@example.com');

      expect(result).toBeNull();
    });

    it('should use sanitized table name', async () => {
      const preparedStatements: string[] = [];
      mockDB.prepare.mockImplementation((query: string) => {
        preparedStatements.push(query);
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
        };
      });

      await service.getUserByEmail(env, 'test; DROP TABLE users--', 'test@example.com');

      const prepareCall = preparedStatements[0];
      expect(prepareCall).toBe('SELECT * FROM testDROPTABLEusers WHERE email = ? AND status != \'deleted\' LIMIT 1');
    });
  });

  describe('getUserById', () => {
    it('should return user when found', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        status: 'active',
      };
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(mockUser),
        }),
      });

      const result = await service.getUserById(env, 'test_project_users', 'user-123');

      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
      });

      const result = await service.getUserById(env, 'test_project_users', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getUserByOAuth', () => {
    it('should return user when found', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        oauth_provider: 'google',
        oauth_provider_user_id: 'google-123',
        status: 'active',
      };
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(mockUser),
        }),
      });

      const result = await service.getUserByOAuth(env, 'test_project_users', 'google', 'google-123');

      expect(result).toEqual(mockUser);
    });

    it('should return null when not found', async () => {
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
      });

      const result = await service.getUserByOAuth(env, 'test_project_users', 'google', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('createUser', () => {
    it('should create new user', async () => {
      mockDB.prepare.mockImplementation((query: string) => {
        if (query.includes('SELECT * FROM') && query.includes('WHERE email = ?')) {
          return {
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(null),
            }),
          };
        }
        if (query.includes('SELECT * FROM') && query.includes('status = \'deleted\'')) {
          return {
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(null),
            }),
          };
        }
        if (query.includes('INSERT INTO')) {
          return {
            bind: vi.fn().mockReturnValue({
              run: vi.fn().mockResolvedValue({ success: true }),
            }),
          };
        }
        if (query.includes('SELECT * FROM') && query.includes('WHERE id = ?')) {
          return {
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({
                id: 'new-user-id',
                email: 'test@example.com',
                status: 'active',
              }),
            }),
          };
        }
        return mockDB;
      });

      const result = await service.createUser(env, 'test_project_users', {
        email: 'test@example.com',
        password: 'TestPassword123',
        displayName: 'Test User',
      });

      expect(result).toBeTruthy();
    });

    it('should throw ConflictError when email exists', async () => {
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: 'existing-user',
            email: 'test@example.com',
          }),
        }),
      });

      await expect(
        service.createUser(env, 'test_project_users', {
          email: 'test@example.com',
          password: 'TestPassword123',
        })
      ).rejects.toThrow('User with this email already exists');
    });

    it('should reactivate deleted user', async () => {
      const deletedUser = {
        id: 'deleted-user-id',
        email: 'test@example.com',
        status: 'deleted',
      };

      mockDB.prepare.mockImplementation((query: string) => {
        if (query.includes('SELECT * FROM') && query.includes('WHERE email = ?') && query.includes('status != \'deleted\'')) {
          return {
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(null),
            }),
          };
        }
        if (query.includes('status = \'deleted\'')) {
          return {
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(deletedUser),
            }),
          };
        }
        if (query.includes('UPDATE')) {
          return {
            bind: vi.fn().mockReturnValue({
              run: vi.fn().mockResolvedValue({ success: true }),
            }),
          };
        }
        if (query.includes('WHERE id = ?')) {
          return {
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({
                ...deletedUser,
                status: 'active',
              }),
            }),
          };
        }
        return mockDB;
      });

      const result = await service.createUser(env, 'test_project_users', {
        email: 'test@example.com',
        password: 'NewPassword123',
      });

      expect(result.status).toBe('active');
    });
  });

  describe('updateUser', () => {
    it('should update user fields', async () => {
      mockDB.prepare.mockImplementation((query: string) => {
        if (query.includes('SELECT id FROM') && query.includes('WHERE email = ?')) {
          return {
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(null),
            }),
          };
        }
        if (query.includes('UPDATE')) {
          return {
            bind: vi.fn().mockReturnValue({
              run: vi.fn().mockResolvedValue({ success: true }),
            }),
          };
        }
        if (query.includes('SELECT * FROM') && query.includes('WHERE id = ?')) {
          return {
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({
                id: 'user-123',
                email: 'new@example.com',
                display_name: 'Updated Name',
              }),
            }),
          };
        }
        return mockDB;
      });

      const result = await service.updateUser(env, 'test_project_users', 'user-123', {
        displayName: 'Updated Name',
        email: 'new@example.com',
      });

      expect(result.display_name).toBe('Updated Name');
    });

    it('should throw error when no fields to update', async () => {
      await expect(
        service.updateUser(env, 'test_project_users', 'user-123', {})
      ).rejects.toThrow('No fields to update');
    });

    it('should throw ConflictError when email taken', async () => {
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ id: 'other-user' }),
        }),
      });

      await expect(
        service.updateUser(env, 'test_project_users', 'user-123', {
          email: 'taken@example.com',
        })
      ).rejects.toThrow('Email is already taken by another user');
    });
  });

  describe('updateLastLogin', () => {
    it('should update last login timestamp', async () => {
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      });

      await service.updateLastLogin(env, 'test_project_users', 'user-123');

      expect(mockDB.prepare).toHaveBeenCalled();
    });
  });

  describe('deleteUser', () => {
    it('should soft delete user', async () => {
      mockDB.prepare.mockImplementation((query: string) => {
        if (query.includes('SELECT * FROM') && query.includes('WHERE email = ?')) {
          return {
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(null),
            }),
          };
        }
        if (query.includes('SELECT * FROM') && query.includes('status = \'deleted\'')) {
          return {
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(null),
            }),
          };
        }
        if (query.includes('UPDATE')) {
          return {
            bind: vi.fn().mockReturnValue({
              run: vi.fn().mockResolvedValue({ success: true }),
            }),
          };
        }
        if (query.includes('SELECT * FROM') && query.includes('WHERE id = ?')) {
          return {
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({
                id: 'user-123',
                status: 'deleted',
              }),
            }),
          };
        }
        return mockDB;
      });

      await service.deleteUser(env, 'test_project_users', 'user-123');

      expect(mockDB.prepare).toHaveBeenCalled();
    });
  });

  describe('listUsers', () => {
    it('should list users with default pagination', async () => {
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      });

      const result = await service.listUsers(env, 'test_project_users');

      expect(Array.isArray(result)).toBe(true);
    });

    it('should accept filter options', async () => {
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      });

      await service.listUsers(env, 'test_project_users', {
        status: 'active',
        limit: 10,
        offset: 5,
      });

      expect(mockDB.prepare).toHaveBeenCalled();
    });
  });

  describe('countUsers', () => {
    it('should count users', async () => {
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 10 }),
        }),
      });

      const result = await service.countUsers(env, 'test_project_users');

      expect(result).toBe(10);
    });

    it('should count users with status filter', async () => {
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 5 }),
        }),
      });

      const result = await service.countUsers(env, 'test_project_users', 'active');

      expect(result).toBe(5);
    });
  });
});