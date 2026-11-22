ALTER TABLE users ADD COLUMN admin_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN admin_locked INTEGER NOT NULL DEFAULT 0 CHECK(admin_locked IN (0,1));
ALTER TABLE order_claims ADD COLUMN assignee_id TEXT REFERENCES users(id);
ALTER TABLE order_claims ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
CREATE INDEX idx_control_claim_status ON order_claims(status,updated_at DESC);
CREATE INDEX idx_control_orders ON online_orders(status,created_at DESC,id);
ALTER TABLE client_coupons ADD COLUMN global_limit INTEGER CHECK(global_limit BETWEEN 1 AND 100000);
CREATE INDEX idx_control_coupon_usage ON online_orders(coupon_code) WHERE coupon_code IS NOT NULL;
CREATE TRIGGER control_coupon_quota BEFORE INSERT ON online_orders
WHEN NEW.coupon_code IS NOT NULL AND (SELECT global_limit FROM client_coupons WHERE code=NEW.coupon_code)
 <= (SELECT COUNT(*) FROM online_orders WHERE coupon_code=NEW.coupon_code)
BEGIN SELECT RAISE(ABORT,'COUPON_UNAVAILABLE'); END;

CREATE TABLE control_audit (
 id INTEGER PRIMARY KEY,
 actor_id TEXT NOT NULL REFERENCES users(id),
 restaurant_id TEXT REFERENCES restaurants(id),
 subject TEXT NOT NULL,
 action TEXT NOT NULL,
 detail TEXT NOT NULL CHECK(json_valid(detail)),
 created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_control_audit_subject ON control_audit(subject,id DESC);

CREATE TABLE control_delivery_rates (
 id TEXT PRIMARY KEY,
 restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 zone TEXT NOT NULL,
 effective_at INTEGER NOT NULL,
 base_minor INTEGER NOT NULL CHECK(base_minor BETWEEN 0 AND 100000000),
 zone_minor INTEGER NOT NULL CHECK(zone_minor BETWEEN 0 AND 100000000),
 km_minor INTEGER NOT NULL CHECK(km_minor BETWEEN 0 AND 100000000),
 author_id TEXT NOT NULL REFERENCES users(id),
 UNIQUE(restaurant_id,zone,effective_at)
);
CREATE TRIGGER control_rate_no_backdating BEFORE INSERT ON control_delivery_rates
WHEN NEW.effective_at<=unixepoch()
BEGIN SELECT RAISE(ABORT,'RATE_RETROACTIVE'); END;
CREATE TRIGGER control_rate_no_overwrite BEFORE UPDATE ON control_delivery_rates
BEGIN SELECT RAISE(ABORT,'RATE_IMMUTABLE'); END;

CREATE TABLE control_courier_rules (
 id TEXT PRIMARY KEY,
 restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 courier_id TEXT NOT NULL REFERENCES courier_profiles(user_id),
 effective_at INTEGER NOT NULL,
 courier_bps INTEGER NOT NULL CHECK(courier_bps BETWEEN 0 AND 10000),
 author_id TEXT NOT NULL REFERENCES users(id),
 UNIQUE(restaurant_id,courier_id,effective_at)
);
ALTER TABLE restaurant_settlement_lines ADD COLUMN courier_rule_id TEXT REFERENCES control_courier_rules(id);
CREATE TRIGGER control_courier_rule_no_backdating BEFORE INSERT ON control_courier_rules
WHEN NEW.effective_at<=unixepoch()
BEGIN SELECT RAISE(ABORT,'RATE_RETROACTIVE'); END;
DROP TRIGGER calculate_settlement;
CREATE TRIGGER calculate_settlement AFTER UPDATE OF status ON restaurant_settlements
WHEN OLD.status='pending' AND NEW.status='calculated'
BEGIN
 SELECT CASE WHEN NEW.until_at>unixepoch() THEN RAISE(ABORT,'SETTLEMENT_PERIOD_OPEN') END;
 SELECT CASE WHEN EXISTS(
  SELECT 1 FROM restaurant_sales s JOIN restaurant_shifts h ON h.id=s.shift_id
  WHERE s.restaurant_id=NEW.restaurant_id AND s.paid_at>=NEW.from_at AND s.paid_at<NEW.until_at AND h.closed_at IS NULL
 ) THEN RAISE(ABORT,'SETTLEMENT_SHIFT_OPEN') END;
 SELECT CASE WHEN EXISTS(
  SELECT 1 FROM restaurant_sales s WHERE s.restaurant_id=NEW.restaurant_id AND s.paid_at>=NEW.from_at AND s.paid_at<NEW.until_at
  AND NOT EXISTS(SELECT 1 FROM restaurant_settlement_rules r WHERE r.restaurant_id=s.restaurant_id AND r.effective_at<=s.paid_at)
 ) THEN RAISE(ABORT,'SETTLEMENT_RULE_MISSING') END;
 INSERT INTO restaurant_settlement_lines(settlement_id,order_id,rule_id,method,total_minor,discount_minor,delivery_minor,commission_minor,
  restaurant_minor,courier_minor,dvolada_minor,courier_rule_id)
 SELECT NEW.id,s.order_id,r.id,s.method,s.total_minor,s.discount_minor,s.delivery_minor,
  ((s.subtotal_minor-s.discount_minor)*r.commission_bps+5000)/10000,
  s.subtotal_minor-s.discount_minor-((s.subtotal_minor-s.discount_minor)*r.commission_bps+5000)/10000,
  (s.delivery_minor*COALESCE(cr.courier_bps,r.courier_bps)+5000)/10000,
  ((s.subtotal_minor-s.discount_minor)*r.commission_bps+5000)/10000+s.delivery_minor-(s.delivery_minor*COALESCE(cr.courier_bps,r.courier_bps)+5000)/10000,cr.id
 FROM restaurant_sales s JOIN restaurant_settlement_rules r ON r.id=(
  SELECT id FROM restaurant_settlement_rules WHERE restaurant_id=s.restaurant_id AND effective_at<=s.paid_at
  ORDER BY effective_at DESC LIMIT 1)
 JOIN online_orders o ON o.id=s.order_id
 LEFT JOIN control_courier_rules cr ON cr.id=(
  SELECT id FROM control_courier_rules WHERE restaurant_id=s.restaurant_id AND courier_id=o.courier_id
   AND effective_at<=s.paid_at ORDER BY effective_at DESC LIMIT 1)
 WHERE s.restaurant_id=NEW.restaurant_id AND s.paid_at>=NEW.from_at AND s.paid_at<NEW.until_at;
END;
