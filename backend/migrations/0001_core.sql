-- Dvolada Online / Cloudflare D1 — v1. SQLite; never run against another project's DB.
-- No real personal data, tokens or demo credentials belong in migrations.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 120),
  account_role TEXT NOT NULL CHECK(account_role IN ('customer','courier','platform_admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS restaurants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
  plan TEXT NOT NULL CHECK(plan IN ('ONLINE','LOCAL','PLUS')),
  subscription_status TEXT NOT NULL CHECK(subscription_status IN ('active','inactive')),
  online_state TEXT NOT NULL DEFAULT 'closed' CHECK(online_state IN ('open','paused','closed')),
  delivery_fee_minor INTEGER NOT NULL DEFAULT 0 CHECK(delivery_fee_minor >= 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS restaurant_memberships (
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  staff_role TEXT NOT NULL CHECK(staff_role IN ('owner','manager','kitchen','cashier')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  PRIMARY KEY(restaurant_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON restaurant_memberships(user_id,active);
CREATE TABLE IF NOT EXISTS courier_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  max_active_orders INTEGER NOT NULL DEFAULT 2 CHECK(max_active_orders BETWEEN 1 AND 2)
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  device_label TEXT NOT NULL DEFAULT 'Dispositivo' CHECK(length(device_label) <= 100),
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_auth_session_user ON auth_sessions(user_id,expires_at);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 150),
  price_minor INTEGER NOT NULL CHECK(price_minor BETWEEN 0 AND 100000000),
  available INTEGER NOT NULL DEFAULT 1 CHECK(available IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(id,restaurant_id)
);
CREATE INDEX IF NOT EXISTS idx_products_restaurant ON products(restaurant_id,available);
CREATE TABLE IF NOT EXISTS online_orders (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  customer_id TEXT NOT NULL REFERENCES users(id),
  courier_id TEXT REFERENCES courier_profiles(user_id),
  order_number TEXT NOT NULL,
  delivery_method TEXT NOT NULL CHECK(delivery_method IN ('delivery','pickup')),
  delivery_address TEXT NOT NULL DEFAULT '' CHECK(length(delivery_address) <= 300),
  status TEXT NOT NULL DEFAULT 'Pendiente' CHECK(status IN
    ('Pendiente','Aceptado','Preparando','Listo','Recogido','En camino','En ubicación','Entregado','Cancelado','Rechazado')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  subtotal_minor INTEGER NOT NULL CHECK(subtotal_minor >= 0),
  delivery_fee_minor INTEGER NOT NULL DEFAULT 0 CHECK(delivery_fee_minor >= 0),
  total_minor INTEGER NOT NULL CHECK(total_minor = subtotal_minor + delivery_fee_minor),
  pin_attempts INTEGER NOT NULL DEFAULT 0 CHECK(pin_attempts BETWEEN 0 AND 5),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(restaurant_id,order_number)
);
CREATE INDEX IF NOT EXISTS idx_online_orders_restaurant ON online_orders(restaurant_id,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_online_orders_customer ON online_orders(customer_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_online_orders_courier ON online_orders(courier_id,status);
CREATE TABLE IF NOT EXISTS online_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES online_orders(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  name_snapshot TEXT NOT NULL,
  unit_price_minor INTEGER NOT NULL CHECK(unit_price_minor>=0),
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 25),
  line_total_minor INTEGER NOT NULL CHECK(line_total_minor=unit_price_minor*quantity)
);
CREATE INDEX IF NOT EXISTS idx_online_items_order ON online_order_items(order_id);
CREATE TABLE IF NOT EXISTS online_order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES online_orders(id),
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  event_kind TEXT NOT NULL CHECK(event_kind IN ('created','status','assigned')),
  from_status TEXT,
  to_status TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_online_events_tenant ON online_order_events(restaurant_id,id);

CREATE TABLE IF NOT EXISTS order_create_requests (
  user_id TEXT NOT NULL REFERENCES users(id),
  request_key TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
  order_id TEXT NOT NULL REFERENCES online_orders(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY(user_id,request_key)
);
CREATE TABLE IF NOT EXISTS order_actions (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES online_orders(id),
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  request_key TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
  expected_version INTEGER NOT NULL CHECK(expected_version >= 1),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(actor_id,request_key)
);
CREATE TABLE IF NOT EXISTS order_assignments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES online_orders(id),
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  courier_id TEXT NOT NULL REFERENCES courier_profiles(user_id),
  request_key TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
  expected_version INTEGER NOT NULL CHECK(expected_version >= 1),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(actor_id,request_key)
);
-- One SQL INSERT triggers an atomic, version-checked status transition plus audit.
CREATE TRIGGER IF NOT EXISTS trg_actions_validate BEFORE INSERT ON order_actions
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM online_orders WHERE id=NEW.order_id AND restaurant_id=NEW.restaurant_id
      AND status=NEW.from_status AND version=NEW.expected_version
  ) THEN RAISE(ABORT,'STALE_ORDER') END;
  SELECT CASE WHEN NOT (
    (NEW.from_status='Pendiente' AND NEW.to_status IN ('Aceptado','Rechazado','Cancelado')) OR
    (NEW.from_status='Aceptado' AND NEW.to_status IN ('Preparando','Cancelado')) OR
    (NEW.from_status='Preparando' AND NEW.to_status IN ('Listo','Cancelado')) OR
    (NEW.from_status='Listo' AND NEW.to_status='Recogido') OR
    (NEW.from_status='Recogido' AND NEW.to_status='En camino') OR
    (NEW.from_status='En camino' AND NEW.to_status='En ubicación') OR
    (NEW.from_status='En ubicación' AND NEW.to_status='Entregado')
  ) THEN RAISE(ABORT,'INVALID_TRANSITION') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_actions_commit AFTER INSERT ON order_actions
BEGIN
  UPDATE online_orders SET status=NEW.to_status,version=version+1,updated_at=unixepoch()
   WHERE id=NEW.order_id AND restaurant_id=NEW.restaurant_id
     AND version=NEW.expected_version AND status=NEW.from_status;
  INSERT INTO online_order_events(order_id,restaurant_id,actor_id,event_kind,from_status,to_status,version)
   VALUES(NEW.order_id,NEW.restaurant_id,NEW.actor_id,'status',NEW.from_status,NEW.to_status,NEW.expected_version+1);
END;
-- The database enforces the independent courier's limit, including simultaneous assignments.
CREATE TRIGGER IF NOT EXISTS trg_assign_validate BEFORE INSERT ON order_assignments
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM online_orders WHERE id=NEW.order_id AND restaurant_id=NEW.restaurant_id
      AND version=NEW.expected_version AND courier_id IS NULL
      AND delivery_method='delivery' AND status IN ('Aceptado','Preparando','Listo')
  ) THEN RAISE(ABORT,'STALE_ASSIGNMENT') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM courier_profiles c JOIN users u ON u.id=c.user_id
    WHERE c.user_id=NEW.courier_id AND c.active=1 AND u.account_role='courier' AND u.status='active'
  ) THEN RAISE(ABORT,'COURIER_INACTIVE') END;
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM online_orders
    WHERE courier_id=NEW.courier_id AND status NOT IN ('Entregado','Cancelado','Rechazado')
  ) >= (SELECT max_active_orders FROM courier_profiles WHERE user_id=NEW.courier_id)
  THEN RAISE(ABORT,'COURIER_LIMIT') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_assign_commit AFTER INSERT ON order_assignments
BEGIN
  UPDATE online_orders SET courier_id=NEW.courier_id,version=version+1,updated_at=unixepoch()
   WHERE id=NEW.order_id AND restaurant_id=NEW.restaurant_id AND version=NEW.expected_version;
  INSERT INTO online_order_events(order_id,restaurant_id,actor_id,event_kind,to_status,version)
   SELECT id,restaurant_id,NEW.actor_id,'assigned',status,version FROM online_orders WHERE id=NEW.order_id;
END;
CREATE TABLE IF NOT EXISTS request_rate_limits (
  session_id TEXT NOT NULL,
  window_minute INTEGER NOT NULL,
  count INTEGER NOT NULL CHECK(count>0),
  PRIMARY KEY(session_id,window_minute)
);
