import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SystemSettingsService } from '../../src/services/system-settings-service';

const createMockDb = () => ({
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  run: vi.fn().mockResolvedValue({ success: true }),
  all: vi.fn().mockResolvedValue({ results: [] }),
  first: vi.fn().mockResolvedValue(null),
});

describe('SystemSettingsService', () => {
  let service: SystemSettingsService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new SystemSettingsService(mockDb as any);
    vi.clearAllMocks();
  });

  describe('getSettings', () => {
    it('should return default settings when no database rows', async () => {
      mockDb.prepare.mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [] }),
      });

      const result = await service.getSettings();

      expect(result).toEqual({
        theme: 'system',
        keep_logs: true,
      });
    });

    it('should parse JSON values from database', async () => {
      mockDb.prepare.mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [
            { key: 'theme', value: '"dark"' },
            { key: 'keep_logs', value: 'false' },
            { key: 'max_users', value: '100' },
          ],
        }),
      });

      const result = await service.getSettings();

      expect(result).toEqual({
        theme: 'dark',
        keep_logs: false,
        max_users: 100,
      });
    });

    it('should handle non-JSON values gracefully', async () => {
      mockDb.prepare.mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [
            { key: 'theme', value: 'not-json' },
            { key: 'keep_logs', value: 'true' },
          ],
        }),
      });

      const result = await service.getSettings();

      expect(result).toEqual({
        theme: 'not-json',
        keep_logs: true,
      });
    });

    it('should merge custom settings with defaults', async () => {
      mockDb.prepare.mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [
            { key: 'custom_setting', value: '"custom_value"' },
          ],
        }),
      });

      const result = await service.getSettings();

      expect(result.custom_setting).toBe('custom_value');
      expect(result.theme).toBe('system');
      expect(result.keep_logs).toBe(true);
    });
  });

  describe('updateSetting', () => {
    it('should stringify and update setting', async () => {
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      });

      await service.updateSetting('theme', 'dark');

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP'
      );
    });

    it('should handle boolean values', async () => {
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      });

      await service.updateSetting('keep_logs', false);

      expect(mockDb.prepare).toHaveBeenCalled();
    });

    it('should handle number values', async () => {
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      });

      await service.updateSetting('max_users', 500);

      expect(mockDb.prepare).toHaveBeenCalled();
    });

    it('should handle object values', async () => {
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      });

      const config = { key1: 'value1', key2: 123 };
      await service.updateSetting('config', config);

      expect(mockDb.prepare).toHaveBeenCalled();
    });
  });
});