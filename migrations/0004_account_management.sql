-- Migration: 0004_account_management
-- Description: The member-facing account surface needs two new event and template kinds: an account whose email
-- address changed, and the email that tells the old address. SQLite cannot change a CHECK in place, so both tables
-- are recreated as in 0001_one_time_tokens and 0003_followup_email_templates. Every existing row and kind is kept.

CREATE TABLE IF NOT EXISTS email_templates__new (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN (
        'welcome', 'confirmation', 'password_reset',
        'magic_link', 'email_change', 'otp', 'invite',
        'followup_member', 'followup_other',
        'email_changed'
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

-- The notice that tells the old address the account moved to a new one.
INSERT OR IGNORE INTO email_templates (type, subject, body_html, body_text)
VALUES (
    'email_changed',
    'Your {{app_name}} address changed',
    '<h1>Your address changed</h1><p>The address you sign in to {{app_name}} with is now {{new_email}}.</p><p>If this was not you, contact support.</p>',
    'Your address changed. The address you sign in to {{app_name}} with is now {{new_email}}. If this was not you, contact support.'
);

CREATE TABLE IF NOT EXISTS audit_logs__new (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,

    -- Event details
    event_type TEXT NOT NULL CHECK (event_type IN (
        'user_created', 'user_login', 'user_logout', 'user_deleted',
        'password_changed', 'email_verified', 'oauth_linked', 'oauth_unlinked',
        'admin_action', 'project_created', 'project_updated', 'project_deleted',
        'oauth_provider_added', 'oauth_provider_updated', 'oauth_provider_removed',
        'suspicious_activity', 'rate_limit_triggered', 'account_locked',
        'email_confirmation_requested', 'email_confirmed', 'email_confirmation_failed',
        'password_reset_requested', 'password_reset_completed',
        'email_changed', 'email_change_requested',
        'supabase_import_started', 'supabase_import_completed',
        'supabase_import_failed', 'supabase_import_batch_failed'
    )),
    event_status TEXT DEFAULT 'success' CHECK (event_status IN ('success', 'failure', 'warning')),

    -- Actors
    user_id TEXT,
    admin_user_id TEXT,

    -- Event context
    ip_address TEXT,
    user_agent TEXT,
    event_data TEXT,

    -- Timestamp
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO audit_logs__new
    (id, project_id, event_type, event_status, user_id, admin_user_id, ip_address, user_agent, event_data, created_at)
SELECT id, project_id, event_type, event_status, user_id, admin_user_id, ip_address, user_agent, event_data, created_at
FROM audit_logs;

DROP TABLE audit_logs;
ALTER TABLE audit_logs__new RENAME TO audit_logs;

CREATE INDEX IF NOT EXISTS idx_audit_logs_project_created
    ON audit_logs(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type
    ON audit_logs(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user
    ON audit_logs(user_id, created_at) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin
    ON audit_logs(admin_user_id, created_at) WHERE admin_user_id IS NOT NULL;
