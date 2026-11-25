CREATE TABLE IF NOT EXISTS contract_receipts (
 id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL REFERENCES restaurants(id), due_date TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(amount_minor>0), paid_date TEXT NOT NULL,
 method TEXT NOT NULL CHECK(method IN ('cash','transfer','external_card')), reference TEXT NOT NULL DEFAULT '',
 actor_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_contract_receipts_due ON contract_receipts(restaurant_id,due_date);
CREATE INDEX IF NOT EXISTS idx_contract_receipts_date ON contract_receipts(paid_date);
CREATE TABLE IF NOT EXISTS spot_receipts (
 id TEXT PRIMARY KEY, spot_id TEXT NOT NULL REFERENCES commercial_spots(id), amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
 paid_date TEXT NOT NULL, method TEXT NOT NULL CHECK(method IN ('cash','transfer','external_card')),
 reference TEXT NOT NULL DEFAULT '', actor_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_spot_receipts_spot ON spot_receipts(spot_id,paid_date);
CREATE INDEX IF NOT EXISTS idx_spot_receipts_date ON spot_receipts(paid_date);
