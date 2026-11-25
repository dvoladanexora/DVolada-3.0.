CREATE TABLE IF NOT EXISTS courier_manual_invites (
 user_id TEXT PRIMARY KEY REFERENCES courier_profiles(user_id),
 expires_at INTEGER NOT NULL, transport TEXT NOT NULL CHECK(transport IN ('motorcycle','car','bicycle','walking','other')),
 service_zone TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), claimed_at INTEGER
);
CREATE TABLE IF NOT EXISTS courier_fee_charges (
 id TEXT PRIMARY KEY REFERENCES online_orders(id), courier_id TEXT NOT NULL REFERENCES courier_profiles(user_id),
 period TEXT NOT NULL, due_date TEXT NOT NULL, amount_minor INTEGER NOT NULL CHECK(amount_minor=500),
 created_at INTEGER NOT NULL DEFAULT(unixepoch()), version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS courier_fee_receipts (
 id TEXT PRIMARY KEY, charge_id TEXT NOT NULL REFERENCES courier_fee_charges(id),
 amount_minor INTEGER NOT NULL CHECK(amount_minor>0), paid_date TEXT NOT NULL,
 method TEXT NOT NULL CHECK(method IN ('cash','transfer','external_card')), reference TEXT NOT NULL DEFAULT '',
 actor_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_courier_fee_receipts_charge ON courier_fee_receipts(charge_id);
CREATE INDEX IF NOT EXISTS idx_courier_fee_receipts_date ON courier_fee_receipts(paid_date);

-- This policy is deliberately enabled only in the authorized original QA database.
CREATE TABLE IF NOT EXISTS launch_pricing (
 id INTEGER PRIMARY KEY CHECK(id=1), enabled_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_courier_fees_courier ON courier_fee_charges(courier_id,due_date);
CREATE TRIGGER IF NOT EXISTS launch_courier_delivery_fee AFTER UPDATE OF status ON online_orders
WHEN NEW.status='Entregado' AND OLD.status!='Entregado' AND NEW.delivery_method='delivery'
 AND NEW.courier_id IS NOT NULL AND NEW.courier_response='accepted' AND EXISTS(SELECT 1 FROM launch_pricing WHERE id=1)
BEGIN
 INSERT INTO courier_fee_charges(id,courier_id,period,due_date,amount_minor)
 VALUES(NEW.id,NEW.courier_id,strftime('%Y-%m',unixepoch()-21600,'unixepoch'),date(unixepoch()-21600,'unixepoch'),500)
 ON CONFLICT(id) DO NOTHING;
END;
CREATE TABLE IF NOT EXISTS restaurant_activation_charges (
 restaurant_id TEXT PRIMARY KEY REFERENCES restaurants(id), amount_minor INTEGER NOT NULL CHECK(amount_minor=150000),
 created_at INTEGER NOT NULL DEFAULT(unixepoch()), version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS restaurant_activation_receipts (
 id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL REFERENCES restaurant_activation_charges(restaurant_id),
 amount_minor INTEGER NOT NULL CHECK(amount_minor>0), paid_date TEXT NOT NULL,
 method TEXT NOT NULL CHECK(method IN ('cash','transfer','external_card')), reference TEXT NOT NULL DEFAULT '',
 actor_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_activation_receipts_restaurant ON restaurant_activation_receipts(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_activation_receipts_date ON restaurant_activation_receipts(paid_date);
CREATE TRIGGER IF NOT EXISTS launch_contract_initial AFTER INSERT ON restaurant_contracts
WHEN EXISTS(SELECT 1 FROM launch_pricing WHERE id=1) AND EXISTS(SELECT 1 FROM restaurants WHERE id=NEW.restaurant_id AND plan='ONLINE')
BEGIN INSERT INTO restaurant_activation_charges(restaurant_id,amount_minor) VALUES(NEW.restaurant_id,150000) ON CONFLICT DO NOTHING; END;
CREATE TRIGGER IF NOT EXISTS launch_settlement_rule_guard BEFORE INSERT ON restaurant_settlement_rules
WHEN EXISTS(SELECT 1 FROM launch_pricing WHERE id=1) AND (NEW.commission_bps!=0 OR NEW.courier_bps!=10000)
BEGIN SELECT RAISE(ABORT,'LAUNCH_PRICING_FIXED'); END;
CREATE TRIGGER IF NOT EXISTS launch_courier_rule_guard BEFORE INSERT ON control_courier_rules
WHEN EXISTS(SELECT 1 FROM launch_pricing WHERE id=1) AND NEW.courier_bps!=10000
BEGIN SELECT RAISE(ABORT,'LAUNCH_PRICING_FIXED'); END;
