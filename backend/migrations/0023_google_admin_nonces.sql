-- Keep nonce consumption independent of the administrative session lifetime.
CREATE TABLE IF NOT EXISTS google_admin_consumed_nonces (
 nonce_hash TEXT PRIMARY KEY,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_google_admin_nonce_expiry ON google_admin_consumed_nonces(expires_at);
