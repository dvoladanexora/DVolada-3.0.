CREATE TABLE IF NOT EXISTS commercial_spots (
 id TEXT PRIMARY KEY, advertiser TEXT NOT NULL, title TEXT NOT NULL, placement TEXT NOT NULL CHECK(placement IN ('carousel','feed','restaurants')),
 starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL CHECK(ends_at>starts_at), duration_seconds INTEGER NOT NULL CHECK(duration_seconds BETWEEN 5 AND 30),
 link TEXT NOT NULL DEFAULT '', image_base64 TEXT NOT NULL, mime TEXT NOT NULL CHECK(mime IN ('image/jpeg','image/png','image/webp')),
 price_minor INTEGER NOT NULL CHECK(price_minor>=0), paid_minor INTEGER NOT NULL CHECK(paid_minor BETWEEN 0 AND price_minor),
 active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)), version INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_spots_live ON commercial_spots(placement,active,starts_at,ends_at);
CREATE TABLE IF NOT EXISTS restaurant_contracts (
 restaurant_id TEXT PRIMARY KEY REFERENCES restaurants(id), start_date TEXT NOT NULL, next_due TEXT,
 frequency TEXT NOT NULL CHECK(frequency IN ('monthly','quarterly','semiannual','annual','once')),
 billing_day INTEGER NOT NULL CHECK(billing_day BETWEEN 1 AND 31), amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
 version INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE TABLE IF NOT EXISTS restaurant_contract_payments (
 id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL REFERENCES restaurants(id), due_date TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(amount_minor>0), paid_date TEXT NOT NULL, method TEXT NOT NULL CHECK(method IN ('cash','transfer','external_card')),
 reference TEXT NOT NULL DEFAULT '', actor_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL DEFAULT(unixepoch()),
 UNIQUE(restaurant_id,due_date)
);
CREATE INDEX IF NOT EXISTS idx_contract_payments ON restaurant_contract_payments(restaurant_id,paid_date DESC);
CREATE TABLE IF NOT EXISTS courier_ratings (
 order_id TEXT PRIMARY KEY REFERENCES online_orders(id), customer_id TEXT NOT NULL REFERENCES users(id),
 courier_id TEXT NOT NULL REFERENCES courier_profiles(user_id), stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
 created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_courier_ratings_courier ON courier_ratings(courier_id);
