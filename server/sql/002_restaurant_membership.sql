-- Dvolada Online: membresías vigentes del negocio (migración de seguridad).
-- Ejecutar después de 001_online_core.sql, ANTES de habilitar la API.
-- Se cargan solo usuarios autorizados desde el futuro proveedor de identidad;
-- no crear cuentas demo, propietarios automáticos ni permisos universales.
CREATE TABLE IF NOT EXISTS restaurant_users (
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,
 role text NOT NULL CHECK (role IN ('owner','manager','cashier','kitchen')),
 active boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (restaurant_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_restaurant_users_user_active
 ON restaurant_users (user_id,restaurant_id) WHERE active=true;
