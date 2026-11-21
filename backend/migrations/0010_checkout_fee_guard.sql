-- Keep an accepted delivery quote consistent with the restaurant fee at commit.
-- Existing orders keep the rates they were charged.
CREATE TRIGGER IF NOT EXISTS trg_checkout_delivery_fee
BEFORE INSERT ON online_orders
WHEN NEW.delivery_method = 'delivery' AND NEW.delivery_fee_minor != (
 SELECT delivery_fee_minor FROM restaurants WHERE id = NEW.restaurant_id
)
BEGIN
 SELECT RAISE(ABORT, 'CHECKOUT_TOTAL_CHANGED');
END;
