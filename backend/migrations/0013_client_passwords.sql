ALTER TABLE client_credentials ADD COLUMN login_name TEXT COLLATE NOCASE;
ALTER TABLE client_credentials ADD COLUMN password_hash TEXT;
CREATE UNIQUE INDEX idx_client_login_name ON client_credentials(login_name) WHERE login_name IS NOT NULL;
