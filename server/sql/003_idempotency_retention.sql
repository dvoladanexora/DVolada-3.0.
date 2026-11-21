-- Migración 003: la tabla de idempotencia no debe crecer sin límite.
-- Conserva respuestas durante 7 días para reintentos de red.
-- Ejecutar tras 001 y 002. El borrado se hace fuera del request HTTP.
ALTER TABLE online_idempotency
 ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days');

CREATE INDEX IF NOT EXISTS idx_online_idempotency_expires_at
 ON online_idempotency(expires_at);
