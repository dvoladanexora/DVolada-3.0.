-- Infrastructure operator only. Bind the independently verified user UUID and login.
-- Run in sequence on the verified QA binding. Stop on any failed precondition.
-- An interruption after staging leaves the target ineligible for a new login.
-- The application cannot execute this procedure.
INSERT INTO privileged_passkey_accounts(user_id,access_role)
SELECT u.id,'platform_admin' FROM users u
JOIN client_credentials c ON c.user_id=u.id JOIN client_passkeys k ON k.user_id=u.id
WHERE u.id=?1 AND c.login_name=?2 AND u.account_role='customer' AND u.status='active'
AND u.admin_locked=0 AND u.firebase_uid IS NULL
AND NOT EXISTS(SELECT 1 FROM restaurant_memberships WHERE user_id=u.id AND active=1)
AND NOT EXISTS(SELECT 1 FROM courier_profiles WHERE user_id=u.id)
AND NOT EXISTS(SELECT 1 FROM privileged_passkey_accounts WHERE user_id=u.id);

UPDATE auth_sessions SET revoked_at=unixepoch()
WHERE user_id=?1 AND revoked_at IS NULL AND EXISTS(
 SELECT 1 FROM privileged_passkey_accounts WHERE user_id=?1 AND access_role='platform_admin');

DELETE FROM client_passkey_challenges WHERE login_name=?2 AND EXISTS(
 SELECT 1 FROM privileged_passkey_accounts WHERE user_id=?1 AND access_role='platform_admin');

INSERT INTO control_audit(actor_id,subject,action,detail)
SELECT ?1,?1,'operator_promotion_authorized','{"method":"existing_passkey","operator":"cloudflare"}'
WHERE EXISTS(SELECT 1 FROM privileged_passkey_accounts WHERE user_id=?1 AND access_role='platform_admin');

UPDATE users SET account_role='platform_admin',admin_version=admin_version+1
WHERE id=?1 AND account_role='customer' AND status='active' AND admin_locked=0 AND firebase_uid IS NULL
AND EXISTS(SELECT 1 FROM client_credentials c JOIN client_passkeys k ON k.user_id=c.user_id
 WHERE c.user_id=?1 AND c.login_name=?2)
AND EXISTS(SELECT 1 FROM privileged_passkey_accounts WHERE user_id=?1 AND access_role='platform_admin' AND invitation_expires_at IS NULL)
AND EXISTS(SELECT 1 FROM control_audit WHERE subject=?1 AND action='operator_promotion_authorized')
AND NOT EXISTS(SELECT 1 FROM auth_sessions WHERE user_id=?1 AND revoked_at IS NULL)
AND NOT EXISTS(SELECT 1 FROM restaurant_memberships WHERE user_id=?1 AND active=1)
AND NOT EXISTS(SELECT 1 FROM courier_profiles WHERE user_id=?1);
