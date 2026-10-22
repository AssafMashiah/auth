-- Migration: 0003_followup_email_templates
-- Description: Two project email types that another Worker of the same account may send through the ProjectMail
-- service binding (src/project-mail.ts): a weekly member follow-up and a fortnightly follow-up for everyone else.
-- Existing rows and types are unchanged. SQLite cannot change a CHECK in place, so the table is recreated as in
-- 0001_one_time_tokens.

CREATE TABLE IF NOT EXISTS email_templates__new (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN (
        'welcome', 'confirmation', 'password_reset',
        'magic_link', 'email_change', 'otp', 'invite',
        'followup_member', 'followup_other'
    )),
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO email_templates__new
    (id, project_id, type, subject, body_html, body_text, created_at, updated_at)
SELECT id, project_id, type, subject, body_html, body_text, created_at, updated_at
FROM email_templates;

DROP TABLE email_templates;
ALTER TABLE email_templates__new RENAME TO email_templates;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_templates_project_type
    ON email_templates(project_id, type) WHERE project_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_templates_system_type
    ON email_templates(type) WHERE project_id IS NULL;
