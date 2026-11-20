-- Every real order carries a Honduran contact phone; OTP validation is server-side.
-- Phone numbers are not required to browse the public catalogue.
ALTER TABLE users ADD COLUMN phone_e164 TEXT;
ALTER TABLE users ADD COLUMN phone_verified_at INTEGER;
ALTER TABLE online_orders ADD COLUMN customer_phone_e164 TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_e164);
CREATE TRIGGER IF NOT EXISTS trg_checkout_phone BEFORE INSERT ON online_orders
BEGIN
 SELECT CASE WHEN NEW.customer_phone_e164 NOT GLOB '+504[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
 THEN RAISE(ABORT,'PHONE_REQUIRED') END;
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM users WHERE id=NEW.customer_id
   AND phone_e164=NEW.customer_phone_e164 AND phone_verified_at IS NOT NULL
 ) THEN RAISE(ABORT,'PHONE_NOT_VERIFIED') END;
END;
