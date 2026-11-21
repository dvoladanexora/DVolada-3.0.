-- Additive. Existing order events are not backfilled or sent.
CREATE TABLE IF NOT EXISTS order_push_outbox (
  event_id INTEGER PRIMARY KEY REFERENCES online_order_events(id),
  kind TEXT NOT NULL,
  audience TEXT NOT NULL CHECK(audience IN ('customer','restaurant','courier')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL DEFAULT (unixepoch()),
  finished_at INTEGER,
  outcome TEXT CHECK(outcome IN ('sent','skipped','failed'))
);
CREATE INDEX IF NOT EXISTS idx_order_push_pending ON order_push_outbox(available_at,event_id)
 WHERE finished_at IS NULL;
CREATE TRIGGER IF NOT EXISTS trg_order_push_events AFTER INSERT ON online_order_events
BEGIN
 INSERT INTO order_push_outbox(event_id,kind,audience)
 SELECT NEW.id,
 CASE
  WHEN NEW.event_kind='created' THEN 'order_created'
  WHEN NEW.event_kind='assigned' THEN 'courier_assigned'
  WHEN NEW.to_status='Aceptado' THEN 'order_accepted'
  WHEN NEW.to_status='Preparando' THEN 'order_preparing'
  WHEN NEW.to_status='Listo' THEN 'order_ready'
  WHEN NEW.to_status='Recogido' THEN 'order_collected'
  WHEN NEW.to_status='En camino' THEN 'order_on_the_way'
  WHEN NEW.to_status='En ubicación' THEN 'order_arrived'
  WHEN NEW.to_status='Entregado' THEN 'order_delivered'
  ELSE 'order_cancelled'
 END,
 CASE
  WHEN NEW.event_kind='created' THEN 'restaurant'
  WHEN NEW.event_kind='assigned' THEN 'courier'
  WHEN NEW.to_status='Cancelado' AND NEW.actor_id=o.customer_id THEN 'restaurant'
  ELSE 'customer'
 END
 FROM online_orders o WHERE o.id=NEW.order_id AND (
  NEW.event_kind='created'
  OR (NEW.event_kind='assigned' AND o.courier_response='offered')
  OR (NEW.event_kind='status' AND NEW.to_status IN (
   'Aceptado','Preparando','Listo','Recogido','En camino','En ubicación','Entregado','Cancelado','Rechazado'
  ))
 );
END;
