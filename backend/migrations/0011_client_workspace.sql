-- QA client accounts and order support. Existing accounts/orders remain unchanged.
CREATE TABLE IF NOT EXISTS client_credentials (
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 access_hash TEXT NOT NULL UNIQUE,
 recovery_hash TEXT NOT NULL UNIQUE,
 revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS client_auth_throttle (
 source_hash TEXT PRIMARY KEY,
 time_bucket INTEGER NOT NULL,
 attempts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS client_favorites (
 user_id TEXT NOT NULL REFERENCES users(id),
 restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 PRIMARY KEY (user_id,restaurant_id)
);
CREATE TABLE IF NOT EXISTS order_messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 order_id TEXT NOT NULL REFERENCES online_orders(id),
 channel TEXT NOT NULL CHECK(channel IN ('restaurant','courier')),
 courier_id TEXT REFERENCES users(id),
 sender_id TEXT NOT NULL REFERENCES users(id),
 request_key TEXT NOT NULL,
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 600),
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 UNIQUE (sender_id,request_key)
);
CREATE INDEX IF NOT EXISTS idx_order_messages_thread ON order_messages(order_id,channel,courier_id,id);
CREATE TABLE IF NOT EXISTS order_claims (
 order_id TEXT PRIMARY KEY REFERENCES online_orders(id),
 category TEXT NOT NULL CHECK(category IN ('pedido','entrega','otro')),
 body TEXT NOT NULL CHECK(length(body) BETWEEN 8 AND 800),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','review','resolved')),
 resolution TEXT,
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
