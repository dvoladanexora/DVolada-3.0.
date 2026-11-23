CREATE TABLE privileged_passkey_accounts (
 user_id TEXT PRIMARY KEY REFERENCES client_credentials(user_id),
 access_role TEXT NOT NULL CHECK(access_role IN ('platform_admin','owner')),
 restaurant_id TEXT REFERENCES restaurants(id),
 invitation_expires_at INTEGER,
 CHECK((access_role='owner' AND restaurant_id IS NOT NULL) OR
       (access_role='platform_admin' AND restaurant_id IS NULL))
);
ALTER TABLE auth_sessions ADD COLUMN privileged_passkey INTEGER NOT NULL DEFAULT 0 CHECK(privileged_passkey IN (0,1));
