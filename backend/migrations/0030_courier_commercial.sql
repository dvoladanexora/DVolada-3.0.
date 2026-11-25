CREATE TABLE IF NOT EXISTS courier_manual_invites (
 user_id TEXT PRIMARY KEY REFERENCES courier_profiles(user_id),
 expires_at INTEGER NOT NULL, transport TEXT NOT NULL CHECK(transport IN ('motorcycle','car','bicycle','walking','other')),
 service_zone TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), claimed_at INTEGER
);
CREATE TABLE IF NOT EXISTS courier_fee_charges (
 id TEXT PRIMARY KEY, courier_id TEXT NOT NULL REFERENCES courier_profiles(user_id),
 period TEXT NOT NULL, due_date TEXT NOT NULL, amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
 created_by TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL DEFAULT(unixepoch()), version INTEGER NOT NULL DEFAULT 1,
 UNIQUE(courier_id,period)
);
CREATE TABLE IF NOT EXISTS courier_fee_receipts (
 id TEXT PRIMARY KEY, charge_id TEXT NOT NULL REFERENCES courier_fee_charges(id),
 amount_minor INTEGER NOT NULL CHECK(amount_minor>0), paid_date TEXT NOT NULL,
 method TEXT NOT NULL CHECK(method IN ('cash','transfer','external_card')), reference TEXT NOT NULL DEFAULT '',
 actor_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_courier_fee_receipts_charge ON courier_fee_receipts(charge_id);
CREATE INDEX IF NOT EXISTS idx_courier_fee_receipts_date ON courier_fee_receipts(paid_date);
