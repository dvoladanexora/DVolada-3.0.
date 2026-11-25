CREATE TABLE IF NOT EXISTS restaurant_bank_accounts (
 restaurant_id TEXT PRIMARY KEY REFERENCES restaurants(id),
 bank TEXT NOT NULL, beneficiary TEXT NOT NULL, account_type TEXT NOT NULL,
 account_number TEXT NOT NULL, instructions TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_bank_transfers (
 order_id TEXT PRIMARY KEY REFERENCES online_orders(id),
 restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 reference TEXT NOT NULL, bank TEXT NOT NULL, beneficiary TEXT NOT NULL,
 account_type TEXT NOT NULL, account_number TEXT NOT NULL, instructions TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('awaiting_reference','pending','confirmed','rejected')),
 reviewed_by TEXT REFERENCES users(id), reviewed_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_reference_claim ON order_bank_transfers(restaurant_id,bank,account_number,reference)
 WHERE status IN ('pending','confirmed');
CREATE INDEX IF NOT EXISTS idx_bank_transfer_restaurant ON order_bank_transfers(restaurant_id,status);
CREATE TRIGGER IF NOT EXISTS bank_transfer_before_accept
 BEFORE UPDATE OF status ON online_orders
 WHEN NEW.status='Aceptado' AND EXISTS(SELECT 1 FROM order_bank_transfers WHERE order_id=OLD.id AND status!='confirmed')
 BEGIN SELECT RAISE(ABORT,'TRANSFER_NOT_CONFIRMED'); END;
CREATE TRIGGER IF NOT EXISTS bank_transfer_sale_guard BEFORE INSERT ON restaurant_sales
 WHEN EXISTS(SELECT 1 FROM order_bank_transfers WHERE order_id=NEW.order_id AND (status!='confirmed' OR NEW.method!='transfer'))
 BEGIN SELECT RAISE(ABORT,'SALE_NOT_ALLOWED'); END;
CREATE TRIGGER IF NOT EXISTS bank_transfer_cancellation_guard
 BEFORE UPDATE OF status ON online_orders
 WHEN NEW.status IN ('Cancelado','Rechazado') AND EXISTS(
  SELECT 1 FROM order_bank_transfers WHERE order_id=OLD.id AND status IN ('pending','confirmed'))
 BEGIN SELECT RAISE(ABORT,'TRANSFER_CANCELLATION_REQUIRES_REVIEW'); END;
