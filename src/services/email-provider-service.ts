import { D1Database } from '@cloudflare/workers-types';
import { EmailProvider, EmailProviderType } from '../types';
import { AppError } from '../utils/errors';

export class EmailProviderService {
  constructor(private db: D1Database) {}

  async getProviders(): Promise<EmailProvider[]> {
    const { results } = await this.db.prepare('SELECT * FROM email_providers ORDER BY created_at DESC').all();
    return (results || []).map(this.mapRowToProvider);
  }

  async getProvider(id: string): Promise<EmailProvider | null> {
    const row = await this.db.prepare('SELECT * FROM email_providers WHERE id = ?').bind(id).first();
    return row ? this.mapRowToProvider(row) : null;
  }

  async getDefaultProvider(): Promise<EmailProvider | null> {
    const row = await this.db.prepare('SELECT * FROM email_providers WHERE is_default = 1').first();
    return row ? this.mapRowToProvider(row) : null;
  }
  
  async getFallbackProvider(): Promise<EmailProvider | null> {
    const row = await this.db.prepare('SELECT * FROM email_providers WHERE is_fallback = 1').first();
    return row ? this.mapRowToProvider(row) : null;
  }

  async createProvider(data: Omit<EmailProvider, 'id' | 'createdAt' | 'updatedAt'>): Promise<EmailProvider> {
    const id = crypto.randomUUID();
    
    // If setting as default/fallback, trigger will handle unsetting others, but let's be safe
    
    await this.db
      .prepare(
        `INSERT INTO email_providers (id, name, provider, type, is_default, is_fallback, config, from_email, from_name, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        data.name,
        data.provider,
        data.type,
        data.isDefault ? 1 : 0,
        data.isFallback ? 1 : 0,
        JSON.stringify(data.config),
        data.fromEmail,
        data.fromName || null,
        data.enabled ? 1 : 0
      )
      .run();

    return this.getProvider(id) as Promise<EmailProvider>;
  }

  async updateProvider(id: string, data: Partial<EmailProvider>): Promise<EmailProvider> {
    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
    if (data.provider !== undefined) { updates.push('provider = ?'); values.push(data.provider); }
    if (data.type !== undefined) { updates.push('type = ?'); values.push(data.type); }
    if (data.isDefault !== undefined) { updates.push('is_default = ?'); values.push(data.isDefault ? 1 : 0); }
    if (data.isFallback !== undefined) { updates.push('is_fallback = ?'); values.push(data.isFallback ? 1 : 0); }
    if (data.config !== undefined) { updates.push('config = ?'); values.push(JSON.stringify(data.config)); }
    if (data.fromEmail !== undefined) { updates.push('from_email = ?'); values.push(data.fromEmail); }
    if (data.fromName !== undefined) { updates.push('from_name = ?'); values.push(data.fromName); }
    if (data.enabled !== undefined) { updates.push('enabled = ?'); values.push(data.enabled ? 1 : 0); }

    if (updates.length === 0) return this.getProvider(id) as Promise<EmailProvider>;

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    await this.db
      .prepare(`UPDATE email_providers SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    return this.getProvider(id) as Promise<EmailProvider>;
  }

  async deleteProvider(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM email_providers WHERE id = ?').bind(id).run();
  }

  private mapRowToProvider(row: any): EmailProvider {
    return {
      id: row.id,
      name: row.name,
      provider: row.provider as EmailProviderType,
      type: row.type as 'api' | 'smtp',
      isDefault: Boolean(row.is_default),
      isFallback: Boolean(row.is_fallback),
      config: JSON.parse(row.config),
      fromEmail: row.from_email,
      fromName: row.from_name,
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
