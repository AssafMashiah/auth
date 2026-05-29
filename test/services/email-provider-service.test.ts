
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailProviderService } from '../../src/services/email-provider-service';
import { EmailProvider } from '../../src/types';

// Mock D1 Database
const createMockDB = () => {
  return {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ success: true }),
    all: vi.fn().mockResolvedValue({ results: [] }),
    first: vi.fn().mockResolvedValue(null),
  } as any;
};

describe('EmailProviderService', () => {
  let service: EmailProviderService;
  let mockDB: any;

  beforeEach(() => {
    mockDB = createMockDB();
    service = new EmailProviderService(mockDB);
  });

  describe('createProvider', () => {
    it('should correctly store SMTP configuration', async () => {
      const smtpConfig = {
        host: 'smtp.example.com',
        port: 587,
        username: 'user',
        password: 'password',
        secure: true
      };

      const providerData: Omit<EmailProvider, 'id' | 'createdAt' | 'updatedAt'> = {
        name: 'SMTP Provider',
        provider: 'smtp',
        type: 'smtp',
        isDefault: false,
        isFallback: false,
        config: smtpConfig,
        fromEmail: 'noreply@example.com',
        fromName: 'Example',
        enabled: true
      };

      // Mock the getProvider call that happens after creation
      mockDB.first.mockResolvedValueOnce({
        id: 'mock-id',
        name: providerData.name,
        provider: providerData.provider,
        type: providerData.type,
        is_default: 0,
        is_fallback: 0,
        config: JSON.stringify(providerData.config),
        from_email: providerData.fromEmail,
        from_name: providerData.fromName,
        enabled: 1,
        created_at: '2024-01-01',
        updated_at: '2024-01-01'
      });

      await service.createProvider(providerData);

      // Verify INSERT query
      const prepareCalls = mockDB.prepare.mock.calls;
      const insertCall = prepareCalls.find((call: any[]) => 
        call[0].includes('INSERT INTO email_providers')
      );
      expect(insertCall).toBeDefined();

      // Verify bind parameters
      // bind params: id, name, provider, type, is_default, is_fallback, config, from_email, from_name, enabled
      const bindCalls = mockDB.bind.mock.calls;
      const lastBindCall = bindCalls[bindCalls.length - 2]; // The insert bind (before getProvider bind)
      
      // Index 6 is config (0-based)
      const storedConfig = lastBindCall[6];
      expect(JSON.parse(storedConfig)).toEqual(smtpConfig);
    });
  });
});
