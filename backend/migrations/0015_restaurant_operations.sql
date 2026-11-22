CREATE TABLE restaurant_profiles (
 restaurant_id TEXT PRIMARY KEY REFERENCES restaurants(id),
 description TEXT NOT NULL,
 address TEXT NOT NULL,
 latitude REAL,
 longitude REAL,
 hours TEXT NOT NULL CHECK(json_valid(hours)),
 payment_methods TEXT NOT NULL CHECK(json_valid(payment_methods))
);
ALTER TABLE products ADD COLUMN category TEXT NOT NULL DEFAULT '';
ALTER TABLE online_orders ADD COLUMN customer_note TEXT NOT NULL DEFAULT '';
CREATE TABLE restaurant_product_photos (
 product_id TEXT PRIMARY KEY REFERENCES products(id),
 mime TEXT NOT NULL CHECK(mime IN ('image/jpeg','image/png','image/webp')),
 image_base64 TEXT NOT NULL CHECK(length(image_base64)<=163840)
);
CREATE TABLE restaurant_operation_log (
 id INTEGER PRIMARY KEY,
 restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 actor_id TEXT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL,
 subject_id TEXT,
 happened_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_restaurant_operations_log ON restaurant_operation_log(restaurant_id,id DESC);
CREATE TABLE restaurant_shifts (
 id TEXT PRIMARY KEY,
 restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 opened_by TEXT NOT NULL REFERENCES users(id),
 open_key TEXT NOT NULL,
 opening_minor INTEGER NOT NULL CHECK(opening_minor>=0),
 opened_at INTEGER NOT NULL DEFAULT (unixepoch()),
 closed_by TEXT REFERENCES users(id),
 closed_at INTEGER,
 close_key TEXT,
 counted_minor INTEGER CHECK(counted_minor>=0),
 expected_cash_minor INTEGER,
 UNIQUE(restaurant_id,open_key),
 UNIQUE(restaurant_id,close_key)
);
CREATE UNIQUE INDEX idx_one_open_shift ON restaurant_shifts(restaurant_id) WHERE closed_at IS NULL;
CREATE TABLE restaurant_sales (
 order_id TEXT PRIMARY KEY REFERENCES online_orders(id),
 shift_id TEXT NOT NULL REFERENCES restaurant_shifts(id),
 restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 actor_id TEXT NOT NULL REFERENCES users(id),
 method TEXT NOT NULL CHECK(method IN ('cash','transfer','external_card')),
 paid_at INTEGER NOT NULL DEFAULT (unixepoch()),
 subtotal_minor INTEGER NOT NULL,
 discount_minor INTEGER NOT NULL,
 delivery_minor INTEGER NOT NULL,
 total_minor INTEGER NOT NULL,
 CHECK(total_minor=subtotal_minor+delivery_minor-discount_minor)
);
CREATE INDEX idx_sales_period ON restaurant_sales(restaurant_id,paid_at,order_id);
CREATE INDEX idx_sales_shift ON restaurant_sales(shift_id,method);
CREATE TRIGGER guard_restaurant_sale BEFORE INSERT ON restaurant_sales
WHEN NOT EXISTS(
 SELECT 1 FROM restaurant_shifts s JOIN online_orders o ON o.id=NEW.order_id
 WHERE s.id=NEW.shift_id AND s.restaurant_id=NEW.restaurant_id AND s.closed_at IS NULL
 AND o.restaurant_id=s.restaurant_id AND o.status='Entregado'
 AND o.subtotal_minor=NEW.subtotal_minor AND o.discount_minor=NEW.discount_minor
 AND o.delivery_fee_minor=NEW.delivery_minor AND o.total_minor-o.discount_minor=NEW.total_minor
 AND EXISTS(SELECT 1 FROM json_each(COALESCE((SELECT payment_methods FROM restaurant_profiles WHERE restaurant_id=s.restaurant_id),'["cash"]'))
  WHERE value=NEW.method)
)
BEGIN SELECT RAISE(ABORT,'SALE_NOT_ALLOWED'); END;
