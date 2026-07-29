import type { AdminUser, Env } from '../types';
import { generateSessionToken, hashPassword, hashToken } from '../utils/crypto';
import { AuthorizationError, ConflictError } from '../utils/errors';

const BOOTSTRAP_TOKEN_ID = 'initial-super-admin';

export interface BootstrapAdminData {
  token: string;
  email: string;
  password: string;
  displayName: string;
}

export class AdminBootstrapService {
  private assertBootstrapSecret(configuredSecret: string | undefined, suppliedSecret: string | undefined): void {
    if (!configuredSecret || !suppliedSecret || configuredSecret !== suppliedSecret) {
      throw new AuthorizationError('Bootstrap authorization failed');
    }
  }

  private async assertNoSuperAdmin(env: Env): Promise<void> {
    const existing = await env.DB
      .prepare("SELECT id FROM admin_users WHERE role = 'super_admin' LIMIT 1")
      .bind()
      .first();

    if (existing) {
      throw new ConflictError('Initial super admin setup has already been completed');
    }
  }

  async issueSetupUrl(
    env: Env,
    configuredSecret: string | undefined,
    suppliedSecret: string | undefined,
    origin: string,
  ): Promise<{ setupUrl: string }> {
    this.assertBootstrapSecret(configuredSecret, suppliedSecret);
    await this.assertNoSuperAdmin(env);

    const token = generateSessionToken();
    const tokenHash = await hashToken(token);
    const now = Math.floor(Date.now() / 1000);

    // One stable row means issuing a replacement URL invalidates the prior one.
    await env.DB.prepare(`
      INSERT INTO admin_bootstrap_tokens (id, token_hash, created_at, used_at)
      VALUES (?, ?, ?, NULL)
      ON CONFLICT(id) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at, used_at = NULL
    `).bind(BOOTSTRAP_TOKEN_ID, tokenHash, now).run();

    return { setupUrl: new URL(`/admin/setup?token=${encodeURIComponent(token)}`, origin).toString() };
  }

  async completeSetup(
    env: Env,
    configuredSecret: string | undefined,
    suppliedSecret: string | undefined,
    data: BootstrapAdminData,
  ): Promise<Pick<AdminUser, 'email' | 'displayName' | 'role'>> {
    this.assertBootstrapSecret(configuredSecret, suppliedSecret);
    await this.assertNoSuperAdmin(env);

    const tokenHash = await hashToken(data.token);
    const token = await env.DB.prepare(`
      SELECT id FROM admin_bootstrap_tokens
      WHERE id = ? AND token_hash = ? AND used_at IS NULL
      LIMIT 1
    `).bind(BOOTSTRAP_TOKEN_ID, tokenHash).first();

    if (!token) {
      throw new ConflictError('Initial super admin setup has already been completed');
    }

    // Claim the token before creating the account. A failed or replayed claim
    // cannot result in a second privileged account.
    const now = Math.floor(Date.now() / 1000);
    const claim = await env.DB.prepare(`
      UPDATE admin_bootstrap_tokens
      SET used_at = ?
      WHERE id = ? AND token_hash = ? AND used_at IS NULL
    `).bind(now, BOOTSTRAP_TOKEN_ID, tokenHash).run();

    if (!claim.meta.changes) {
      throw new ConflictError('Initial super admin setup has already been completed');
    }

    const passwordHash = await hashPassword(data.password);
    await env.DB.prepare(`
      INSERT INTO admin_users (email, password_hash, display_name, role, enabled, mfa_enabled)
      VALUES (?, ?, ?, 'super_admin', 1, 0)
    `).bind(data.email, passwordHash, data.displayName).run();

    return { email: data.email, displayName: data.displayName, role: 'super_admin' };
  }
}

export const adminBootstrapService = new AdminBootstrapService();
