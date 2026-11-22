ALTER TABLE auth_sessions ADD COLUMN staff_restaurant_id TEXT REFERENCES restaurants(id);
CREATE INDEX idx_staff_session_scope ON auth_sessions(staff_restaurant_id,user_id);
CREATE TABLE restaurant_staff_access (
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 invitation_hash TEXT UNIQUE,
 invitation_expires_at INTEGER,
 credential_hash TEXT UNIQUE,
 revision INTEGER NOT NULL DEFAULT 1,
 FOREIGN KEY(restaurant_id,user_id) REFERENCES restaurant_memberships(restaurant_id,user_id)
);
CREATE INDEX idx_managed_staff ON restaurant_staff_access(restaurant_id,user_id);

CREATE TABLE restaurant_settlement_rules (
 id TEXT PRIMARY KEY,
 restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 effective_at INTEGER NOT NULL,
 commission_bps INTEGER NOT NULL CHECK(commission_bps BETWEEN 0 AND 10000),
 courier_bps INTEGER NOT NULL CHECK(courier_bps BETWEEN 0 AND 10000),
 author_id TEXT NOT NULL REFERENCES users(id),
 UNIQUE(restaurant_id,effective_at)
);
CREATE TABLE restaurant_settlements (
 id TEXT PRIMARY KEY,
 restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 from_at INTEGER NOT NULL,
 until_at INTEGER NOT NULL CHECK(until_at>from_at),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','calculated','approved','paid')),
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at INTEGER NOT NULL DEFAULT(unixepoch()),
 calculated_by TEXT REFERENCES users(id),
 calculated_at INTEGER,
 approved_by TEXT REFERENCES users(id),
 approved_at INTEGER,
 paid_by TEXT REFERENCES users(id),
 paid_at INTEGER,
 external_reference TEXT,
 UNIQUE(restaurant_id,from_at,until_at)
);
CREATE INDEX idx_settlements_period ON restaurant_settlements(restaurant_id,from_at,until_at);
CREATE TABLE restaurant_settlement_lines (
 settlement_id TEXT NOT NULL REFERENCES restaurant_settlements(id),
 order_id TEXT PRIMARY KEY REFERENCES restaurant_sales(order_id),
 rule_id TEXT NOT NULL REFERENCES restaurant_settlement_rules(id),
 method TEXT NOT NULL,
 total_minor INTEGER NOT NULL,
 discount_minor INTEGER NOT NULL,
 delivery_minor INTEGER NOT NULL,
 commission_minor INTEGER NOT NULL CHECK(commission_minor>=0),
 restaurant_minor INTEGER NOT NULL CHECK(restaurant_minor>=0),
 courier_minor INTEGER NOT NULL CHECK(courier_minor>=0),
 dvolada_minor INTEGER NOT NULL CHECK(dvolada_minor>=0),
 CHECK(total_minor=restaurant_minor+courier_minor+dvolada_minor)
);
CREATE TABLE restaurant_settlement_adjustments (
 id TEXT PRIMARY KEY,
 settlement_id TEXT NOT NULL REFERENCES restaurant_settlements(id),
 order_id TEXT NOT NULL REFERENCES restaurant_settlement_lines(order_id),
 author_id TEXT NOT NULL REFERENCES users(id),
 reason TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('adjustment','refund')),
 restaurant_minor INTEGER NOT NULL,
 courier_minor INTEGER NOT NULL,
 dvolada_minor INTEGER NOT NULL,
 created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE INDEX idx_settlement_lines ON restaurant_settlement_lines(settlement_id);
CREATE INDEX idx_settlement_adjustments ON restaurant_settlement_adjustments(settlement_id,order_id);
CREATE INDEX idx_settlement_adjustment_order ON restaurant_settlement_adjustments(order_id);
CREATE TRIGGER guard_settlement_period BEFORE INSERT ON restaurant_settlements
WHEN EXISTS(SELECT 1 FROM restaurant_settlements x WHERE x.restaurant_id=NEW.restaurant_id
 AND x.from_at<NEW.until_at AND x.until_at>NEW.from_at AND (x.from_at!=NEW.from_at OR x.until_at!=NEW.until_at))
BEGIN SELECT RAISE(ABORT,'SETTLEMENT_OVERLAP'); END;

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
  restaurant_minor,courier_minor,dvolada_minor)
 SELECT NEW.id,s.order_id,r.id,s.method,s.total_minor,s.discount_minor,s.delivery_minor,
  ((s.subtotal_minor-s.discount_minor)*r.commission_bps+5000)/10000,
  s.subtotal_minor-s.discount_minor-((s.subtotal_minor-s.discount_minor)*r.commission_bps+5000)/10000,
  (s.delivery_minor*r.courier_bps+5000)/10000,
  ((s.subtotal_minor-s.discount_minor)*r.commission_bps+5000)/10000+s.delivery_minor-(s.delivery_minor*r.courier_bps+5000)/10000
 FROM restaurant_sales s JOIN restaurant_settlement_rules r ON r.id=(
  SELECT id FROM restaurant_settlement_rules WHERE restaurant_id=s.restaurant_id AND effective_at<=s.paid_at
  ORDER BY effective_at DESC LIMIT 1)
 WHERE s.restaurant_id=NEW.restaurant_id AND s.paid_at>=NEW.from_at AND s.paid_at<NEW.until_at;
END;
CREATE TRIGGER guard_settlement_adjustment BEFORE INSERT ON restaurant_settlement_adjustments
WHEN NOT EXISTS(
 SELECT 1 FROM restaurant_settlements t JOIN restaurant_settlement_lines l ON l.order_id=NEW.order_id
 JOIN restaurant_settlements original ON original.id=l.settlement_id
 WHERE t.id=NEW.settlement_id AND t.status='calculated' AND original.restaurant_id=t.restaurant_id
 AND (original.id=t.id OR (original.status='paid' AND original.until_at<=t.from_at))
 AND (
  (NEW.kind='adjustment' AND NEW.restaurant_minor+NEW.courier_minor+NEW.dvolada_minor=0)
  OR (NEW.kind='refund' AND NEW.restaurant_minor<=0 AND NEW.courier_minor<=0 AND NEW.dvolada_minor<=0
      AND NEW.restaurant_minor+NEW.courier_minor+NEW.dvolada_minor<0)
 )
 AND l.restaurant_minor+NEW.restaurant_minor+COALESCE((SELECT SUM(restaurant_minor) FROM restaurant_settlement_adjustments WHERE order_id=l.order_id),0)>=0
 AND l.courier_minor+NEW.courier_minor+COALESCE((SELECT SUM(courier_minor) FROM restaurant_settlement_adjustments WHERE order_id=l.order_id),0)>=0
 AND l.dvolada_minor+NEW.dvolada_minor+COALESCE((SELECT SUM(dvolada_minor) FROM restaurant_settlement_adjustments WHERE order_id=l.order_id),0)>=0
)
BEGIN SELECT RAISE(ABORT,'SETTLEMENT_ADJUSTMENT_INVALID'); END;
