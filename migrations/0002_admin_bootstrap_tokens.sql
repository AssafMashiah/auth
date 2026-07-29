-- One-time token for initial privileged-account bootstrap.
-- No admin account is seeded by migrations; existing D1 rows are intentionally untouched.
CREATE TABLE IF NOT EXISTS admin_bootstrap_tokens (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    used_at INTEGER
);
