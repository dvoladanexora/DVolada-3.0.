-- Migración 004. Integridad entre negocios y eventos de pedidos.
-- Fallar si hay datos históricos inconsistentes: no ocultar incidentes.
-- Garantiza que un evento del restaurante A no pueda referirse a una orden B,
-- incluso si un error futuro de código omite el filtro de restaurante.
CREATE UNIQUE INDEX IF NOT EXISTS idx_online_orders_id_restaurant
 ON online_orders(id,restaurant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_online_events_order_version
 ON online_order_events(order_id,version);

DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname='fk_online_event_order_tenant'
                  AND conrelid='online_order_events'::regclass) THEN
  ALTER TABLE online_order_events
   ADD CONSTRAINT fk_online_event_order_tenant
   FOREIGN KEY (order_id,restaurant_id)
   REFERENCES online_orders(id,restaurant_id)
   ON UPDATE RESTRICT;
 END IF;
END;
$$;
