-- Orders remain disabled by ORDER_CREATION_ENABLED until staging is approved.
-- A contact phone is required but is never represented as verified without proof.
DROP TRIGGER IF EXISTS trg_checkout_phone;
CREATE TRIGGER trg_checkout_phone BEFORE INSERT ON online_orders
BEGIN
 SELECT CASE WHEN NEW.customer_phone_e164 NOT GLOB '+504[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
 THEN RAISE(ABORT,'PHONE_REQUIRED') END;
END;
