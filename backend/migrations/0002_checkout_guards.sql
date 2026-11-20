-- Additional D1 integrity gates to prevent time-of-check/time-of-use cart races.
CREATE TRIGGER IF NOT EXISTS trg_checkout_restaurant BEFORE INSERT ON online_orders
BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM restaurants WHERE id=NEW.restaurant_id
   AND plan IN ('ONLINE','PLUS') AND subscription_status='active' AND online_state='open'
 ) THEN RAISE(ABORT,'RESTAURANT_CLOSED') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_checkout_item BEFORE INSERT ON online_order_items
BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM products p JOIN online_orders o ON o.id=NEW.order_id
   WHERE p.id=NEW.product_id AND p.restaurant_id=o.restaurant_id
    AND p.available=1 AND p.price_minor=NEW.unit_price_minor
 ) THEN RAISE(ABORT,'PRODUCT_CHANGED') END;
END;
-- No switching tenant, customer, courier or pricing after creation without a separate audited action.
CREATE TRIGGER IF NOT EXISTS trg_order_immutable BEFORE UPDATE OF
 restaurant_id,customer_id,delivery_method,subtotal_minor,delivery_fee_minor,total_minor ON online_orders
BEGIN
 SELECT RAISE(ABORT,'IMMUTABLE_ORDER');
END;
