import { WorkerEntrypoint } from 'cloudflare:workers';
import type { Env } from './types';
import { sendProjectMail, type ProjectMailInput, type ProjectMailResult } from './services/project-mail-service';

/**
 * Service-binding entry point for other Workers in this account, e.g. cc-api:
 *   "services": [{ "binding": "AUTH_MAIL", "service": "auth", "entrypoint": "ProjectMail" }]
 * It has no route, so it cannot be called from the internet.
 */
export class ProjectMail extends WorkerEntrypoint<Env> {
  async send(input: ProjectMailInput): Promise<ProjectMailResult> {
    return sendProjectMail(this.env, input);
  }
}
