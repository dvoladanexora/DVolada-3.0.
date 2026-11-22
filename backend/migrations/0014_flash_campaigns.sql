CREATE TABLE flash_campaigns (
 id TEXT PRIMARY KEY,
 restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 product_id TEXT REFERENCES products(id),
 gift_product_id TEXT REFERENCES products(id),
 title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 80),
 discount_minor INTEGER NOT NULL CHECK(discount_minor BETWEEN 0 AND 100000000),
 starts_at INTEGER NOT NULL,
 ends_at INTEGER NOT NULL CHECK(ends_at>starts_at),
 per_customer INTEGER NOT NULL CHECK(per_customer BETWEEN 1 AND 100),
 global_limit INTEGER NOT NULL CHECK(global_limit BETWEEN per_customer AND 100000),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_by TEXT NOT NULL REFERENCES users(id),
 CHECK((gift_product_id IS NOT NULL AND discount_minor=0) OR (gift_product_id IS NULL AND discount_minor>0))
);
CREATE INDEX idx_flash_catalog ON flash_campaigns(restaurant_id,active,ends_at);
ALTER TABLE online_orders ADD COLUMN flash_id TEXT REFERENCES flash_campaigns(id);
ALTER TABLE online_orders ADD COLUMN flash_gift_name TEXT;
CREATE INDEX idx_order_flash_use ON online_orders(flash_id,customer_id)
 WHERE flash_id IS NOT NULL AND status NOT IN ('Cancelado','Rechazado');
DROP TRIGGER client_coupon_checkout;
CREATE TRIGGER client_coupon_checkout BEFORE INSERT ON online_orders
WHEN (NEW.coupon_code IS NOT NULL AND NEW.flash_id IS NOT NULL)
 OR (NEW.coupon_code IS NULL AND NEW.flash_id IS NULL AND NEW.discount_minor!=0)
 OR (NEW.coupon_code IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM client_coupons c WHERE c.code=NEW.coupon_code AND c.restaurant_id=NEW.restaurant_id
  AND c.active=1 AND c.starts_at<=unixepoch() AND c.ends_at>unixepoch()
  AND NEW.discount_minor=MIN(c.discount_minor,NEW.subtotal_minor) AND NEW.discount_minor>0
  AND NOT EXISTS(SELECT 1 FROM online_orders o WHERE o.customer_id=NEW.customer_id AND o.coupon_code=c.code)
 ))
BEGIN SELECT RAISE(ABORT,'COUPON_UNAVAILABLE'); END;
CREATE TRIGGER client_flash_limit BEFORE INSERT ON online_orders WHEN NEW.flash_id IS NOT NULL
BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM flash_campaigns f WHERE f.id=NEW.flash_id AND f.restaurant_id=NEW.restaurant_id
  AND f.active=1 AND f.starts_at<=unixepoch() AND f.ends_at>unixepoch()
  AND f.global_limit>(SELECT COUNT(*) FROM online_orders o WHERE o.flash_id=f.id AND o.status NOT IN ('Cancelado','Rechazado'))
  AND f.per_customer>(SELECT COUNT(*) FROM online_orders o WHERE o.flash_id=f.id AND o.customer_id=NEW.customer_id
   AND o.status NOT IN ('Cancelado','Rechazado'))
 ) THEN RAISE(ABORT,'FLASH_UNAVAILABLE') END;
END;
-- This row is inserted after all order items in the same D1 batch.
CREATE TRIGGER client_flash_commit BEFORE INSERT ON order_create_requests
WHEN EXISTS(SELECT 1 FROM online_orders WHERE id=NEW.order_id AND flash_id IS NOT NULL)
BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM online_orders o JOIN flash_campaigns f ON f.id=o.flash_id
  LEFT JOIN products gift ON gift.id=f.gift_product_id AND gift.restaurant_id=o.restaurant_id AND gift.available=1
  WHERE o.id=NEW.order_id
  AND (f.product_id IS NULL OR EXISTS(SELECT 1 FROM online_order_items i WHERE i.order_id=o.id AND i.product_id=f.product_id))
  AND (
    (f.gift_product_id IS NOT NULL AND gift.name=o.flash_gift_name AND o.discount_minor=0)
    OR (f.gift_product_id IS NULL AND o.flash_gift_name IS NULL AND o.discount_minor>0
      AND o.discount_minor=MIN(f.discount_minor,CASE WHEN f.product_id IS NULL THEN o.subtotal_minor
       ELSE (SELECT SUM(i.line_total_minor+i.options_minor*i.quantity) FROM online_order_items i WHERE i.order_id=o.id AND i.product_id=f.product_id)
      END))
  )
 ) THEN RAISE(ABORT,'FLASH_UNAVAILABLE') END;
END;
CREATE TRIGGER client_flash_immutable BEFORE UPDATE OF flash_id,flash_gift_name ON online_orders
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_ORDER'); END;
