CREATE TABLE product_options (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 kind TEXT NOT NULL CHECK(kind IN ('variant','extra')),
 price_minor INTEGER NOT NULL CHECK(price_minor BETWEEN 0 AND 10000000),
 available INTEGER NOT NULL DEFAULT 1 CHECK(available IN (0,1))
);
CREATE INDEX idx_product_options_menu ON product_options(product_id,available);
CREATE TABLE client_coupons (
 code TEXT PRIMARY KEY,
 restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 discount_minor INTEGER NOT NULL CHECK(discount_minor>0),
 starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL CHECK(ends_at>starts_at),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
ALTER TABLE online_orders ADD COLUMN coupon_code TEXT REFERENCES client_coupons(code);
ALTER TABLE online_orders ADD COLUMN discount_minor INTEGER NOT NULL DEFAULT 0 CHECK(discount_minor BETWEEN 0 AND subtotal_minor);
ALTER TABLE online_order_items ADD COLUMN options_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(options_json));
ALTER TABLE online_order_items ADD COLUMN options_minor INTEGER NOT NULL DEFAULT 0 CHECK(options_minor>=0);
CREATE UNIQUE INDEX idx_coupon_once_per_client ON online_orders(customer_id,coupon_code) WHERE coupon_code IS NOT NULL;
CREATE TRIGGER client_coupon_checkout BEFORE INSERT ON online_orders
WHEN (NEW.coupon_code IS NULL AND NEW.discount_minor!=0) OR
 (NEW.coupon_code IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM client_coupons c WHERE c.code=NEW.coupon_code AND c.restaurant_id=NEW.restaurant_id
  AND c.active=1 AND c.starts_at<=unixepoch() AND c.ends_at>unixepoch()
  AND NEW.discount_minor=MIN(c.discount_minor,NEW.subtotal_minor) AND NEW.discount_minor>0
  AND NOT EXISTS(SELECT 1 FROM online_orders o WHERE o.customer_id=NEW.customer_id AND o.coupon_code=c.code)
 ))
BEGIN SELECT RAISE(ABORT,'COUPON_UNAVAILABLE'); END;
CREATE TRIGGER client_coupon_immutable BEFORE UPDATE OF coupon_code,discount_minor ON online_orders
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_ORDER'); END;
CREATE TRIGGER client_item_options_checkout BEFORE INSERT ON online_order_items
WHEN NEW.options_json!='[]' OR NEW.options_minor!=0
BEGIN
 SELECT CASE WHEN (
  SELECT COUNT(*) FROM json_each(NEW.options_json) j JOIN product_options p ON p.id=json_extract(j.value,'$.id')
  WHERE p.product_id=NEW.product_id AND p.available=1
   AND p.price_minor=json_extract(j.value,'$.price_minor') AND p.name=json_extract(j.value,'$.name')
 )!=json_array_length(NEW.options_json) OR NEW.options_minor!=(
  SELECT COALESCE(SUM(json_extract(value,'$.price_minor')),0) FROM json_each(NEW.options_json)
 ) THEN RAISE(ABORT,'PRODUCT_CHANGED') END;
END;
