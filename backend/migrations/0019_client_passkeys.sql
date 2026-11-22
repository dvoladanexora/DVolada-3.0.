CREATE TABLE client_passkeys (
 user_id TEXT PRIMARY KEY REFERENCES client_credentials(user_id),
 credential_id TEXT NOT NULL UNIQUE,
 public_key TEXT NOT NULL,
 counter INTEGER NOT NULL CHECK(counter>=0),
 created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE TABLE client_passkey_challenges (
 id TEXT PRIMARY KEY,
 browser_hash TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('register','login','recover')),
 challenge TEXT NOT NULL,
 user_id TEXT,
 login_name TEXT NOT NULL,
 display_name TEXT,
 revision INTEGER,
 admin_version INTEGER,
 expires_at INTEGER NOT NULL
);
CREATE INDEX idx_client_passkey_expiry ON client_passkey_challenges(expires_at);
