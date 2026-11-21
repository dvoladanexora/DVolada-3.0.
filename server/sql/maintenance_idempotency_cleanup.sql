-- Ejemplo de mantenimiento PROGRAMADO fuera de la API.
-- Ejecutar en una tarea de base de datos autorizada y supervisada.
-- Conserva el historial operativo de eventos; solamente elimina claves
-- de idempotencia expiradas (no borra pedidos ni datos de clientes).
-- Lotes acotados para reducir bloqueos en horas de actividad.
WITH expired AS (
 SELECT ctid FROM online_idempotency
 WHERE expires_at < now()
 ORDER BY expires_at
 LIMIT 1000
 FOR UPDATE SKIP LOCKED
)
DELETE FROM online_idempotency AS i
USING expired AS e
WHERE i.ctid = e.ctid;
