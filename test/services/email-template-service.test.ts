import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailTemplateService } from '../../src/services/email-template-service';
import type { EmailTemplateType } from '../../src/types';

const createMockDb = () => ({
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  run: vi.fn().mockResolvedValue({ success: true }),
  all: vi.fn().mockResolvedValue({ results: [] }),
  first: vi.fn().mockResolvedValue(null),
});

const mockTemplateRow = {
  id: 'template-123',
  project_id: 'test_project',
  type: 'welcome' as EmailTemplateType,
  subject: 'Welcome!',
  body_html: '<p>Welcome to our app!</p>',
  body_text: 'Welcome to our app!',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('EmailTemplateService', () => {
  let service: EmailTemplateService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new EmailTemplateService(mockDb as any);
    vi.clearAllMocks();
  });

  describe('getSystemTemplates', () => {
    it('should return system templates (project_id is null)', async () => {
      mockDb.prepare.mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [mockTemplateRow] }),
      });

      const result = await service.getSystemTemplates();

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM email_templates WHERE project_id IS NULL'
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('template-123');
    });

    it('should return empty array when no templates', async () => {
      mockDb.prepare.mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [] }),
      });

      const result = await service.getSystemTemplates();

      expect(result).toEqual([]);
    });
  });

  describe('getProjectTemplates', () => {
    it('should return templates for specific project', async () => {
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [mockTemplateRow] }),
        }),
      });

      const result = await service.getProjectTemplates('test_project');

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM email_templates WHERE project_id = ?'
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('getTemplate', () => {
    it('should return project template when exists', async () => {
      mockDb.prepare
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockTemplateRow),
          }),
        })
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
        });

      const result = await service.getTemplate('test_project', 'welcome');

      expect(result).not.toBeNull();
      expect(result?.projectId).toBe('test_project');
    });

    it('should fallback to system template when project template not found', async () => {
      const systemTemplate = { ...mockTemplateRow, project_id: null };
      mockDb.prepare
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
        })
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(systemTemplate),
          }),
        });

      const result = await service.getTemplate('test_project', 'welcome');

      expect(result).not.toBeNull();
      expect(result?.projectId).toBeNull();
    });

    it('should return null when template not found', async () => {
      mockDb.prepare
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
        })
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
        });

      const result = await service.getTemplate('test_project', 'welcome');

      expect(result).toBeNull();
    });
  });

  describe('createOrUpdateTemplate', () => {
    it('should update existing template', async () => {
      mockDb.prepare
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ id: 'template-123' }),
          }),
        })
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({ success: true }),
          }),
        })
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockTemplateRow),
          }),
        });

      const result = await service.createOrUpdateTemplate(
        'test_project',
        'welcome',
        { subject: 'Updated Subject', bodyHtml: '<p>Updated</p>' }
      );

      expect(result).toBeDefined();
    });

    it('should create new template when not exists', async () => {
      mockDb.prepare
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
        })
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({ success: true }),
          }),
        })
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockTemplateRow),
          }),
        });

      const result = await service.createOrUpdateTemplate(
        'test_project',
        'welcome',
        { subject: 'New Subject', bodyHtml: '<p>New</p>' }
      );

      expect(result).toBeDefined();
    });

    it('should handle null project_id for system templates', async () => {
      mockDb.prepare
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
        })
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({ success: true }),
          }),
        })
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ ...mockTemplateRow, project_id: null }),
          }),
        });

      const result = await service.createOrUpdateTemplate(
        null,
        'welcome',
        { subject: 'System Subject', bodyHtml: '<p>System</p>' }
      );

      expect(result).toBeDefined();
    });
  });

  describe('deleteProjectTemplate', () => {
    it('should delete only project templates (not system)', async () => {
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      });

      await service.deleteProjectTemplate('template-123');

      expect(mockDb.prepare).toHaveBeenCalledWith(
        'DELETE FROM email_templates WHERE id = ? AND project_id IS NOT NULL'
      );
    });
  });
});