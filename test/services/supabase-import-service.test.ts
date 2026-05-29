import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SupabaseImportService, ImportOptions } from '../../src/services/supabase-import-service';
import type { Env } from '../../src/types';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      admin: {
        listUsers: vi.fn(),
      },
    },
  })),
}));

vi.mock('../../src/services/user-service', () => ({
  userService: {
    getUserByEmail: vi.fn(),
  },
}));

vi.mock('../../src/services/audit-service', () => ({
  auditService: {
    logEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

const createMockEnv = (): Env => {
  const mockDB = {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ success: true }),
    all: vi.fn().mockResolvedValue({ results: [] }),
    first: vi.fn().mockResolvedValue(null),
  };
  return { DB: mockDB as any } as Env;
};

const mockSupabaseUser = {
  id: 'supabase-user-123',
  email: 'test@example.com',
  encrypted_password: '$2a$10$test',
  email_confirmed_at: '2024-01-01T00:00:00Z',
  phone: null,
  phone_confirmed_at: null,
  raw_user_meta_data: { full_name: 'Test User' },
  raw_app_meta_data: { role: 'user' },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-02T00:00:00Z',
  last_sign_in_at: '2024-01-03T00:00:00Z',
  identities: [],
};

describe('SupabaseImportService', () => {
  let service: SupabaseImportService;
  let mockEnv: Env;

  beforeEach(() => {
    service = new SupabaseImportService();
    mockEnv = createMockEnv();
    vi.clearAllMocks();
  });

  describe('validateSupabaseCredentials', () => {
    it('should return valid when Supabase connection succeeds', async () => {
      const mockSupabase = {
        auth: {
          admin: {
            listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
          },
        },
      };

      const { createClient } = await import('@supabase/supabase-js');
      (createClient as any).mockReturnValueOnce(mockSupabase);

      const result = await service.validateSupabaseCredentials(
        'https://test.supabase.co',
        'valid-key'
      );

      expect(result.valid).toBe(true);
    });

    it('should return invalid when Supabase connection fails', async () => {
      const mockSupabase = {
        auth: {
          admin: {
            listUsers: vi.fn().mockResolvedValue({ data: null, error: { message: 'Invalid API key' } }),
          },
        },
      };

      const { createClient } = await import('@supabase/supabase-js');
      (createClient as any).mockReturnValueOnce(mockSupabase);

      const result = await service.validateSupabaseCredentials(
        'https://test.supabase.co',
        'invalid-key'
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });
  });

  describe('mapSupabaseUserToLocal', () => {
    it('should map basic user properties', () => {
      const options: ImportOptions = {};
      const result = service.mapSupabaseUserToLocal(mockSupabaseUser as any, options);

      expect(result.email).toBe('test@example.com');
      expect(result.emailVerified).toBe(true);
      expect(result.phone).toBeNull();
      expect(result.phoneVerified).toBe(false);
      expect(result.passwordHash).toBeNull();
    });

    it('should extract display name from metadata', () => {
      const options: ImportOptions = {};
      const result = service.mapSupabaseUserToLocal(mockSupabaseUser as any, options);

      expect(result.displayName).toBe('Test User');
    });

    it('should preserve ID when requested', () => {
      const options: ImportOptions = { preserveIds: true };
      const result = service.mapSupabaseUserToLocal(mockSupabaseUser as any, options);

      expect(result.id).toBe('supabase-user-123');
    });

    it('should not preserve ID by default', () => {
      const options: ImportOptions = {};
      const result = service.mapSupabaseUserToLocal(mockSupabaseUser as any, options);

      expect(result.id).toBeUndefined();
    });

    it('should import metadata when requested', () => {
      const options: ImportOptions = { importMetadata: true };
      const result = service.mapSupabaseUserToLocal(mockSupabaseUser as any, options);

      expect(result.metadata).toContain('user_metadata');
    });

    it('should preserve OAuth identities when requested', () => {
      const userWithOAuth = {
        ...mockSupabaseUser,
        identities: [
          {
            provider: 'google',
            id: 'google-123',
            user_id: 'supabase-user-123',
            identity_data: { email: 'test@example.com' },
          },
        ],
      };

      const options: ImportOptions = { preserveOAuth: true };
      const result = service.mapSupabaseUserToLocal(userWithOAuth as any, options);

      expect(result.oauthProvider).toBe('google');
      expect(result.oauthProviderUserId).toBe('google-123');
    });

    it('should handle null email gracefully', () => {
      const userWithNullEmail = { ...mockSupabaseUser, email: null };
      const options: ImportOptions = {};
      const result = service.mapSupabaseUserToLocal(userWithNullEmail as any, options);

      expect(result.email).toBeNull();
    });
  });

  describe('getImportPreview', () => {
    it('should return sample users and count', async () => {
      const mockListUsers = vi.fn()
        .mockResolvedValueOnce({ data: { users: [] }, error: null }) // validate call
        .mockResolvedValueOnce({ data: { users: [mockSupabaseUser, mockSupabaseUser] }, error: null })
        .mockResolvedValueOnce({ data: { users: [] }, error: null }); // preview calls

      const mockSupabase = {
        auth: {
          admin: {
            listUsers: mockListUsers,
          },
        },
      };

      const { createClient } = await import('@supabase/supabase-js');
      (createClient as any)
        .mockReturnValueOnce(mockSupabase) // for validateSupabaseCredentials
        .mockReturnValueOnce(mockSupabase); // for getImportPreview

      const result = await service.getImportPreview(
        'https://test.supabase.co',
        'valid-key',
        5
      );

      expect(result.totalCount).toBe(2);
      expect(result.sampleUsers).toBeDefined();
    });
  });
});