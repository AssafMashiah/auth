import { describe, it, expect, beforeEach, vi } from 'vitest';

const { send, defaultProviderGet, fallbackProviderGet } = vi.hoisted(() => ({
  send: vi.fn().mockResolvedValue(undefined),
  defaultProviderGet: vi.fn(),
  fallbackProviderGet: vi.fn(),
}));
vi.mock('../../src/services/email-provider-service', () => ({
  EmailProviderService: class { getDefaultProvider = defaultProviderGet; getFallbackProvider = fallbackProviderGet; },
}));
vi.mock('../../src/services/email-template-service', () => ({
  EmailTemplateService: class {
    getTemplate = vi.fn().mockResolvedValue({ id: 't', projectId: 'p', type: 'followup_member',
      subject: 'Your week: {{n}}', bodyHtml: '<p>Hi {{name}}</p>', bodyText: 'Hi {{name}}', createdAt: '', updatedAt: '' });
  },
}));
vi.mock('../../src/services/email/providers', () => ({ ProviderFactory: { create: vi.fn(() => ({ send })) } }));

import { EmailService } from '../../src/services/email-service';

const sender = { email: 'hello@sharpthought.app', name: 'Calisthenics Care' };

describe('EmailService.sendProjectTemplate', () => {
  beforeEach(() => { vi.clearAllMocks(); fallbackProviderGet.mockResolvedValue(null); });

  it('uses the project sender over the default provider row and escapes values in HTML only', async () => {
    defaultProviderGet.mockResolvedValue({ provider: 'cloudflare', fromEmail: 'noreply@other.app', fromName: 'Other', config: {} });
    await new EmailService().sendProjectTemplate({ DB: {} } as any, 'd@example.test', 'p', 'followup_member', { n: '3', name: '<b>D</b>' }, sender);
    expect(send).toHaveBeenCalledWith({ to: 'd@example.test', subject: 'Your week: 3', html: '<p>Hi &lt;b&gt;D&lt;/b&gt;</p>',
      text: 'Hi <b>D</b>', from: 'hello@sharpthought.app', fromName: 'Calisthenics Care' });
  });

  it('falls back to the send_email binding when no provider row exists', async () => {
    defaultProviderGet.mockResolvedValue(null);
    await new EmailService().sendProjectTemplate({ DB: {}, EMAIL: {} } as any, 'd@example.test', 'p', 'followup_other', { n: '1' }, sender);
    expect(send.mock.calls[0][0].from).toBe('hello@sharpthought.app');
  });
});
