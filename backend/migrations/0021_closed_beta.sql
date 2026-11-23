-- Only populated in the isolated beta database. Store SHA-256 of 32 random bytes.
CREATE TABLE closed_beta_invitations (
 id TEXT PRIMARY KEY,
 invitation_hash TEXT UNIQUE,
 session_hash TEXT UNIQUE,
 expires_at INTEGER NOT NULL,
 revoked_at INTEGER,
 CHECK(invitation_hash IS NOT NULL OR session_hash IS NOT NULL)
);
