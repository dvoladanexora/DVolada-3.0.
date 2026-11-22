ALTER TABLE courier_profiles ADD COLUMN available INTEGER NOT NULL DEFAULT 1 CHECK(available IN (0,1));
ALTER TABLE online_orders ADD COLUMN courier_offer_expires_at INTEGER;
UPDATE online_orders SET courier_offer_expires_at=COALESCE(
 (SELECT MAX(a.created_at) FROM order_assignments a WHERE a.order_id=online_orders.id AND a.courier_id=online_orders.courier_id),
 updated_at)+900 WHERE courier_response='offered';

CREATE TABLE courier_applications (
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE courier_availability_events (
 id INTEGER PRIMARY KEY,
 courier_id TEXT NOT NULL REFERENCES courier_profiles(user_id),
 available INTEGER NOT NULL CHECK(available IN (0,1)),
 created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE courier_restaurant_messages (
 id INTEGER PRIMARY KEY,
 order_id TEXT NOT NULL REFERENCES online_orders(id),
 courier_id TEXT NOT NULL REFERENCES courier_profiles(user_id),
 sender_id TEXT NOT NULL REFERENCES users(id),
 request_key TEXT NOT NULL,
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 600),
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 UNIQUE(sender_id,request_key)
);
CREATE INDEX idx_courier_restaurant_thread ON courier_restaurant_messages(order_id,courier_id,id DESC);
CREATE INDEX idx_courier_delivered_history ON online_orders(courier_id,status,updated_at DESC,id DESC);

DROP TRIGGER trg_assign_validate;
CREATE TRIGGER trg_assign_validate BEFORE INSERT ON order_assignments
BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM online_orders WHERE id=NEW.order_id AND restaurant_id=NEW.restaurant_id
   AND version=NEW.expected_version
   AND (courier_id IS NULL OR (courier_response='offered' AND courier_offer_expires_at<=unixepoch()))
   AND delivery_method='delivery' AND status IN ('Aceptado','Preparando','Listo')
 ) THEN RAISE(ABORT,'STALE_ASSIGNMENT') END;
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM courier_profiles c JOIN users u ON u.id=c.user_id WHERE c.user_id=NEW.courier_id
   AND c.active=1 AND c.available=1 AND u.account_role='courier' AND u.status='active'
 ) THEN RAISE(ABORT,'COURIER_INACTIVE') END;
 SELECT CASE WHEN (
  SELECT COUNT(*) FROM online_orders WHERE courier_id=NEW.courier_id
   AND status NOT IN ('Entregado','Cancelado','Rechazado')
   AND (courier_response='accepted' OR (courier_response='offered' AND courier_offer_expires_at>unixepoch()))
 ) >= (SELECT MIN(max_active_orders,2) FROM courier_profiles WHERE user_id=NEW.courier_id)
 THEN RAISE(ABORT,'COURIER_LIMIT') END;
END;

DROP TRIGGER trg_assign_commit;
CREATE TRIGGER trg_assign_commit AFTER INSERT ON order_assignments
BEGIN
 UPDATE online_orders SET courier_id=NEW.courier_id,courier_response='offered',courier_offer_expires_at=unixepoch()+900,
  version=version+1,updated_at=unixepoch()
 WHERE id=NEW.order_id AND restaurant_id=NEW.restaurant_id AND version=NEW.expected_version;
 INSERT INTO online_order_events(order_id,restaurant_id,actor_id,event_kind,to_status,version)
 SELECT id,restaurant_id,NEW.actor_id,'assigned',status,version FROM online_orders WHERE id=NEW.order_id;
END;

DROP TRIGGER trg_offer_validate;
CREATE TRIGGER trg_offer_validate BEFORE INSERT ON courier_offer_responses
BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM online_orders o JOIN courier_profiles c ON c.user_id=o.courier_id
  WHERE o.id=NEW.order_id AND o.courier_id=NEW.courier_id AND o.version=NEW.expected_version
   AND o.courier_response='offered' AND o.status IN ('Aceptado','Preparando','Listo')
   AND c.active=1
 ) THEN RAISE(ABORT,'OFFER_CHANGED') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM online_orders WHERE id=NEW.order_id AND courier_offer_expires_at<=unixepoch())
  THEN RAISE(ABORT,'OFFER_EXPIRED') END;
 SELECT CASE WHEN NEW.action='accept' AND NOT EXISTS(SELECT 1 FROM courier_profiles WHERE user_id=NEW.courier_id AND available=1)
  THEN RAISE(ABORT,'COURIER_INACTIVE') END;
END;
CREATE TRIGGER courier_availability_changed AFTER UPDATE OF available ON courier_profiles
WHEN OLD.available!=NEW.available
BEGIN
 INSERT INTO courier_availability_events(courier_id,available) VALUES(NEW.user_id,NEW.available);
END;
CREATE TRIGGER courier_delivery_pin_lock BEFORE INSERT ON order_actions
WHEN NEW.to_status='Entregado' AND EXISTS(
 SELECT 1 FROM online_orders WHERE id=NEW.order_id AND delivery_method='delivery' AND pin_attempts>=5
)
BEGIN SELECT RAISE(ABORT,'PIN_LOCKED'); END;
CREATE TABLE courier_pin_rejections (
 courier_id TEXT NOT NULL REFERENCES courier_profiles(user_id),
 request_key TEXT NOT NULL,
 order_id TEXT NOT NULL REFERENCES online_orders(id),
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 PRIMARY KEY(courier_id,request_key)
);
CREATE TRIGGER courier_pin_rejected AFTER INSERT ON courier_pin_rejections
BEGIN
 UPDATE online_orders SET pin_attempts=pin_attempts+1
 WHERE id=NEW.order_id AND courier_id=NEW.courier_id AND courier_response='accepted' AND status='En ubicación' AND pin_attempts<5;
END;
