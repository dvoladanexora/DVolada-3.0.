CREATE TABLE IF NOT EXISTS restaurant_applications (
 id TEXT PRIMARY KEY,
 business_name TEXT NOT NULL,
 owner_name TEXT NOT NULL,
 phone TEXT NOT NULL,
 email TEXT NOT NULL,
 location TEXT NOT NULL,
 business_type TEXT NOT NULL,
 plan TEXT NOT NULL CHECK(plan IN ('ONLINE','LOCAL','PLUS')),
 notes TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 reason TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_restaurant_applications_queue ON restaurant_applications(status,created_at DESC,id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurant_pending_contact ON restaurant_applications(lower(business_name),phone) WHERE status='pending';
