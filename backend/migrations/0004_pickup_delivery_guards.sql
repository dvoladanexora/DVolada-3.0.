-- Enable authorized pickup completion; delivery requires the courier PIN path.
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
       AND courier_id=NEW.actor_id
    )) OR
    (NEW.from_status='Recogido' AND NEW.to_status='En camino' AND EXISTS(
      SELECT 1 FROM online_orders WHERE id=NEW.order_id AND courier_id=NEW.actor_id
    )) OR
    (NEW.from_status='En camino' AND NEW.to_status='En ubicación' AND EXISTS(
      SELECT 1 FROM online_orders WHERE id=NEW.order_id AND courier_id=NEW.actor_id
    )) OR
    (NEW.from_status='En ubicación' AND NEW.to_status='Entregado' AND EXISTS(
      SELECT 1 FROM online_orders WHERE id=NEW.order_id AND courier_id=NEW.actor_id
    )) OR
    (NEW.from_status='Listo' AND NEW.to_status='Entregado' AND EXISTS(
      SELECT 1 FROM online_orders WHERE id=NEW.order_id AND delivery_method='pickup'
       AND courier_id IS NULL
    ))
 ) THEN RAISE(ABORT,'INVALID_TRANSITION') END;
END;
