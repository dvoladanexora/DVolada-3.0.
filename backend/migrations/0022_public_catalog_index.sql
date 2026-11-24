-- Serve the public catalogue in display order without scanning inactive restaurants.
CREATE INDEX IF NOT EXISTS idx_public_restaurants_name
ON restaurants(name, id, online_state, delivery_fee_minor)
WHERE plan IN ('ONLINE','PLUS') AND subscription_status='active'
  AND online_state IN ('open','paused');
