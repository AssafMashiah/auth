import { D1Database } from '@cloudflare/workers-types';
import { EmailTemplate, EmailTemplateType } from '../types';

export class EmailTemplateService {
  constructor(private db: D1Database) {}

  async getSystemTemplates(): Promise<EmailTemplate[]> {
    const { results } = await this.db.prepare('SELECT * FROM email_templates WHERE project_id IS NULL').all();
    return (results || []).map(this.mapRowToTemplate);
  }

  async getProjectTemplates(projectId: string): Promise<EmailTemplate[]> {
    const { results } = await this.db.prepare('SELECT * FROM email_templates WHERE project_id = ?').bind(projectId).all();
    return (results || []).map(this.mapRowToTemplate);
  }

  async getTemplate(projectId: string | null, type: EmailTemplateType): Promise<EmailTemplate | null> {
    if (projectId) {
      const row = await this.db.prepare('SELECT * FROM email_templates WHERE project_id = ? AND type = ?').bind(projectId, type).first();
      if (row) return this.mapRowToTemplate(row);
    }
    const row = await this.db.prepare('SELECT * FROM email_templates WHERE project_id IS NULL AND type = ?').bind(type).first();
    return row ? this.mapRowToTemplate(row) : null;
  }

  async createOrUpdateTemplate(projectId: string | null, type: EmailTemplateType, data: { subject: string; bodyHtml: string; bodyText?: string }): Promise<EmailTemplate> {
    const existing = projectId 
      ? await this.db.prepare('SELECT id FROM email_templates WHERE project_id = ? AND type = ?').bind(projectId, type).first()
      : await this.db.prepare('SELECT id FROM email_templates WHERE project_id IS NULL AND type = ?').bind(type).first();

    if (existing) {
      await this.db.prepare(
        `UPDATE email_templates 
         SET subject = ?, body_html = ?, body_text = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`
      ).bind(data.subject, data.bodyHtml, data.bodyText || null, existing.id).run();
      return this.getTemplate(projectId, type) as Promise<EmailTemplate>;
    } else {
      const id = crypto.randomUUID();
      await this.db.prepare(
        `INSERT INTO email_templates (id, project_id, type, subject, body_html, body_text)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(id, projectId, type, data.subject, data.bodyHtml, data.bodyText || null).run();
      return this.getTemplate(projectId, type) as Promise<EmailTemplate>;
    }
  }

  async deleteProjectTemplate(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM email_templates WHERE id = ? AND project_id IS NOT NULL').bind(id).run();
  }

  private mapRowToTemplate(row: any): EmailTemplate {
    return {
      id: row.id,
      projectId: row.project_id,
      type: row.type as EmailTemplateType,
      subject: row.subject,
      bodyHtml: row.body_html,
      bodyText: row.body_text,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
