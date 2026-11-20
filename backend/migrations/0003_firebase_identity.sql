-- Dvolada auth provider binding. Assign elevated roles only through approved back-office provisioning.
ALTER TABLE users ADD COLUMN firebase_uid TEXT;
ALTER TABLE users ADD COLUMN verified_email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid) WHERE firebase_uid IS NOT NULL;
CREATE TABLE IF NOT EXISTS auth_login_attempts (
  ip_hash TEXT NOT NULL,
  window_5m INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(ip_hash,window_5m)
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON auth_sessions(expires_at);
