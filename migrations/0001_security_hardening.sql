-- Security hardening: one-time admin bootstrap and OAuth authorization transactions

CREATE TABLE IF NOT EXISTS admin_bootstrap (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  consumed_at TEXT
);
INSERT OR IGNORE INTO admin_bootstrap (id, consumed_at) VALUES (1, NULL);

CREATE TABLE IF NOT EXISTS oauth_authorization_states (
  state TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  browser_session_hash TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_oauth_authorization_states_expiry
  ON oauth_authorization_states(expires_at) WHERE used_at IS NULL;
