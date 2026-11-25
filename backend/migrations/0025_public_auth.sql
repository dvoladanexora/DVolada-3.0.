-- Isolated enrollment challenges for an already authenticated commercial account.
CREATE TABLE IF NOT EXISTS client_biometric_challenges (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), session_id TEXT NOT NULL REFERENCES auth_sessions(id),
 challenge TEXT NOT NULL, revision INTEGER NOT NULL, admin_version INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_client_biometric_expiry ON client_biometric_challenges(expires_at);
