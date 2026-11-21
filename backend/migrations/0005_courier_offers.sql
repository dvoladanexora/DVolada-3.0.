-- Courier invitations: independent couriers accept or reject; never silently enlist them.
ALTER TABLE online_orders ADD COLUMN courier_response TEXT NOT NULL DEFAULT 'unassigned'
 CHECK(courier_response IN ('unassigned','offered','accepted'));
UPDATE online_orders SET courier_response='accepted' WHERE courier_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_assign_commit;
CREATE TRIGGER trg_assign_commit AFTER INSERT ON order_assignments
BEGIN
 UPDATE online_orders SET courier_id=NEW.courier_id,courier_response='offered',
  version=version+1,updated_at=unixepoch()
 WHERE id=NEW.order_id AND restaurant_id=NEW.restaurant_id AND version=NEW.expected_version;
 INSERT INTO online_order_events(order_id,restaurant_id,actor_id,event_kind,to_status,version)
 SELECT id,restaurant_id,NEW.actor_id,'assigned',status,version FROM online_orders WHERE id=NEW.order_id;
END;
CREATE TABLE IF NOT EXISTS courier_offer_responses(
 id TEXT PRIMARY KEY,
 order_id TEXT NOT NULL REFERENCES online_orders(id),
 courier_id TEXT NOT NULL REFERENCES courier_profiles(user_id),
 request_key TEXT NOT NULL,
 request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
 expected_version INTEGER NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('accept','reject')),
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 UNIQUE(courier_id,request_key)
);
CREATE TRIGGER trg_offer_validate BEFORE INSERT ON courier_offer_responses
BEGIN
 SELECT CASE WHEN NOT EXISTS(
 SELECT 1 FROM online_orders o JOIN courier_profiles c ON c.user_id=o.courier_id
 WHERE o.id=NEW.order_id AND o.courier_id=NEW.courier_id AND o.version=NEW.expected_version
 AND o.courier_response='offered' AND o.status IN ('Aceptado','Preparando','Listo')
 AND c.active=1
 ) THEN RAISE(ABORT,'OFFER_CHANGED') END;
END;
CREATE TRIGGER trg_offer_commit AFTER INSERT ON courier_offer_responses
BEGIN
 UPDATE online_orders
 SET courier_response=CASE WHEN NEW.action='accept' THEN 'accepted' ELSE 'unassigned' END,
  courier_id=CASE WHEN NEW.action='accept' THEN NEW.courier_id ELSE NULL END,
  version=version+1,updated_at=unixepoch()
 WHERE id=NEW.order_id AND version=NEW.expected_version;
 INSERT INTO online_order_events(order_id,restaurant_id,actor_id,event_kind,to_status,version)
 SELECT id,restaurant_id,NEW.courier_id,'assigned',status,version FROM online_orders WHERE id=NEW.order_id;
END;
-- Prevent courier status mutation until a particular courier has explicitly accepted.
DROP TRIGGER IF EXISTS trg_actions_validate;
CREATE TRIGGER trg_actions_validate BEFORE INSERT ON order_actions
BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM online_orders WHERE id=NEW.order_id AND restaurant_id=NEW.restaurant_id
   AND status=NEW.from_status AND version=NEW.expected_version
 ) THEN RAISE(ABORT,'STALE_ORDER') END;
 SELECT CASE WHEN NOT (
    (NEW.from_status='Pendiente' AND NEW.to_status IN ('Aceptado','Rechazado','Cancelado')) OR
    (NEW.from_status='Aceptado' AND NEW.to_status IN ('Preparando','Cancelado')) OR
    (NEW.from_status='Preparando' AND NEW.to_status IN ('Listo','Cancelado')) OR
    (NEW.from_status='Listo' AND NEW.to_status='Recogido' AND EXISTS(
      SELECT 1 FROM online_orders WHERE id=NEW.order_id AND delivery_method='delivery'
       AND courier_id=NEW.actor_id AND courier_response='accepted'
    )) OR
    (NEW.from_status='Recogido' AND NEW.to_status='En camino' AND EXISTS(
      SELECT 1 FROM online_orders WHERE id=NEW.order_id AND courier_id=NEW.actor_id
       AND courier_response='accepted'
    )) OR
    (NEW.from_status='En camino' AND NEW.to_status='En ubicación' AND EXISTS(
      SELECT 1 FROM online_orders WHERE id=NEW.order_id AND courier_id=NEW.actor_id
       AND courier_response='accepted'
    )) OR
    (NEW.from_status='En ubicación' AND NEW.to_status='Entregado' AND EXISTS(
      SELECT 1 FROM online_orders WHERE id=NEW.order_id AND courier_id=NEW.actor_id
       AND courier_response='accepted'
    )) OR
    (NEW.from_status='Listo' AND NEW.to_status='Entregado' AND EXISTS(
      SELECT 1 FROM online_orders WHERE id=NEW.order_id AND delivery_method='pickup'
       AND courier_id IS NULL
    ))
 ) THEN RAISE(ABORT,'INVALID_TRANSITION') END;
END;
