import type { Env } from '../types';
import { emailService } from './email-service';
import { projectService } from './project-service';
import { userService } from './user-service';

/**
 * Sends a project's own follow-up email to one of its users on behalf of another Worker in the same Cloudflare
 * account (reached only through the ProjectMail service binding, never over HTTP). The caller names the user, not
 * the address: the address and name come from the project's user table, and only verified, active users receive
 * mail. Only the follow-up types are allowed, and each project must name its own sender in PROJECT_SENDERS, so the
 * sign-in emails and other projects' mail are unaffected.
 */
export const PROJECT_MAIL_TYPES = ['followup_member', 'followup_other'] as const;
export type ProjectMailType = (typeof PROJECT_MAIL_TYPES)[number];
export interface ProjectMailInput { projectId: string; userId: string; type: ProjectMailType; data: Record<string, string> }
export type ProjectMailResult = { ok: true } | { ok: false; error: string };

const KEY = /^[a-z_]{1,40}$/;

function senderFor(env: Env, projectId: string): { email: string; name?: string } | null {
  try {
    const sender = JSON.parse(env.PROJECT_SENDERS ?? '{}')[projectId];
    return sender && typeof sender.email === 'string' ? { email: sender.email, name: typeof sender.name === 'string' ? sender.name : undefined } : null;
  } catch {
    return null;
  }
}

export async function sendProjectMail(env: Env, input: ProjectMailInput): Promise<ProjectMailResult> {
  if (!input || typeof input.projectId !== 'string' || typeof input.userId !== 'string') return { ok: false, error: 'INVALID_INPUT' };
  if (!PROJECT_MAIL_TYPES.includes(input.type)) return { ok: false, error: 'TYPE_NOT_ALLOWED' };
  const entries = Object.entries(input.data ?? {});
  if (entries.length > 30 || entries.some(([k, v]) => !KEY.test(k) || k === 'name' || typeof v !== 'string' || v.length > 2000)) {
    return { ok: false, error: 'INVALID_DATA' };
  }
  const sender = senderFor(env, input.projectId);
  if (!sender) return { ok: false, error: 'SENDER_NOT_CONFIGURED' };
  const project = await projectService.getProject(env, input.projectId);
  if (!project || !project.enabled) return { ok: false, error: 'PROJECT_NOT_FOUND' };
  const user = await userService.getUserById(env, project.userTableName, input.userId);
  if (!user || user.status !== 'active') return { ok: false, error: 'USER_NOT_FOUND' };
  if (!user.emailVerified) return { ok: false, error: 'EMAIL_NOT_VERIFIED' };
  const name = user.displayName?.trim().split(/\s+/)[0] || 'there';
  try {
    await emailService.sendProjectTemplate(env, user.email, project.id, input.type, { ...input.data, name, app_name: project.name }, sender);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'SEND_FAILED' };
  }
}
