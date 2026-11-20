-- Per-tenant operational audit and platform provisioning log.
CREATE TABLE IF NOT EXISTS platform_audit(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 actor_id TEXT NOT NULL REFERENCES users(id),
 restaurant_id TEXT REFERENCES restaurants(id),
 subject_id TEXT,
 action TEXT NOT NULL CHECK(action IN (
  'restaurant_created','restaurant_updated','membership_assigned','courier_enrolled')),
 created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON platform_audit(created_at DESC);
CREATE TABLE IF NOT EXISTS restaurant_audit(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 actor_id TEXT NOT NULL REFERENCES users(id),
 product_id TEXT REFERENCES products(id),
 action TEXT NOT NULL CHECK(action IN ('product_created','product_updated','availability_updated')),
 created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_restaurant_audit_tenant ON restaurant_audit(restaurant_id,created_at DESC);
