import { describe, it, expect, beforeEach, vi } from 'vitest';

const { getProject, getUserById, sendProjectTemplate } = vi.hoisted(() => ({
  getProject: vi.fn(),
  getUserById: vi.fn(),
  sendProjectTemplate: vi.fn(),
}));
vi.mock('../../src/services/project-service', () => ({ projectService: { getProject } }));
vi.mock('../../src/services/user-service', () => ({ userService: { getUserById } }));
vi.mock('../../src/services/email-service', () => ({ emailService: { sendProjectTemplate } }));

import { sendProjectMail } from '../../src/services/project-mail-service';

const SENDERS = JSON.stringify({ calisthenics_care: { email: 'hello@sharpthought.app', name: 'Calisthenics Care' } });
const env = (senders: string | undefined = SENDERS) => ({ DB: {} as any, ASSETS: {} as any, PROJECT_SENDERS: senders });
const input = { projectId: 'calisthenics_care', userId: 'u1', type: 'followup_member' as const, data: { goal: 'Stronger Back' } };

describe('sendProjectMail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProject.mockResolvedValue({ id: 'calisthenics_care', name: 'Calisthenics Care', enabled: true, userTableName: 'users_cc' });
    getUserById.mockResolvedValue({ id: 'u1', email: 'dana@example.test', emailVerified: 1, status: 'active', displayName: 'Dana Levi' });
    sendProjectTemplate.mockResolvedValue(undefined);
  });

  it('sends to the address in the project user table, from the project sender, with the first name', async () => {
    expect(await sendProjectMail(env(), input)).toEqual({ ok: true });
    expect(getUserById).toHaveBeenCalledWith(expect.anything(), 'users_cc', 'u1');
    expect(sendProjectTemplate).toHaveBeenCalledWith(expect.anything(), 'dana@example.test', 'calisthenics_care', 'followup_member',
      { goal: 'Stronger Back', name: 'Dana', app_name: 'Calisthenics Care' }, { email: 'hello@sharpthought.app', name: 'Calisthenics Care' });
  });

  it('refuses the sign-in email types', async () => {
    expect(await sendProjectMail(env(), { ...input, type: 'password_reset' as any })).toEqual({ ok: false, error: 'TYPE_NOT_ALLOWED' });
    expect(sendProjectTemplate).not.toHaveBeenCalled();
  });

  it('refuses a project without its own sender, so no other project sender is used', async () => {
    expect(await sendProjectMail(env('{}'), input)).toEqual({ ok: false, error: 'SENDER_NOT_CONFIGURED' });
    expect(await sendProjectMail(env(SENDERS), { ...input, projectId: 'marginalia' })).toEqual({ ok: false, error: 'SENDER_NOT_CONFIGURED' });
    expect(sendProjectTemplate).not.toHaveBeenCalled();
  });

  it('sends nothing to unverified, suspended or missing users', async () => {
    getUserById.mockResolvedValueOnce({ id: 'u1', email: 'x@example.test', emailVerified: 0, status: 'active', displayName: null });
    expect(await sendProjectMail(env(), input)).toEqual({ ok: false, error: 'EMAIL_NOT_VERIFIED' });
    getUserById.mockResolvedValueOnce({ id: 'u1', email: 'x@example.test', emailVerified: 1, status: 'suspended', displayName: null });
    expect(await sendProjectMail(env(), input)).toEqual({ ok: false, error: 'USER_NOT_FOUND' });
    getUserById.mockResolvedValueOnce(null);
    expect(await sendProjectMail(env(), input)).toEqual({ ok: false, error: 'USER_NOT_FOUND' });
    expect(sendProjectTemplate).not.toHaveBeenCalled();
  });

  it('rejects bad data and a caller-supplied name', async () => {
    expect(await sendProjectMail(env(), { ...input, data: { name: 'Mallory' } })).toEqual({ ok: false, error: 'INVALID_DATA' });
    expect(await sendProjectMail(env(), { ...input, data: { 'Bad-Key': 'x' } })).toEqual({ ok: false, error: 'INVALID_DATA' });
    expect(await sendProjectMail(env(), { ...input, data: { goal: 'x'.repeat(2001) } })).toEqual({ ok: false, error: 'INVALID_DATA' });
  });

  it('greets "there" without a display name and reports a send failure', async () => {
    getUserById.mockResolvedValueOnce({ id: 'u1', email: 'd@example.test', emailVerified: 1, status: 'active', displayName: '  ' });
    sendProjectTemplate.mockRejectedValueOnce(new Error('Cloudflare Email: sender not verified'));
    expect(await sendProjectMail(env(), input)).toEqual({ ok: false, error: 'Cloudflare Email: sender not verified' });
    expect(sendProjectTemplate.mock.calls[0][4].name).toBe('there');
  });
});
