-- ============================================================
-- noble_msp migration: 012_payments_direct
-- Direct payments (retainers, recurring, etc.) that aren't tied to an
-- invoice. invoice_id becomes nullable; client_id is required and added.
-- Backfills client_id from the existing invoice link before the NOT NULL
-- constraint is applied.
-- Run once against the noble_msp database.
-- ============================================================

-- 1. Widen: invoice_id nullable, add client_id nullable (so backfill can run).
ALTER TABLE payments
  MODIFY COLUMN invoice_id INT NULL,
  ADD COLUMN client_id INT NULL AFTER invoice_id,
  ADD INDEX idx_client (client_id);

-- 2. Backfill client_id for every existing (invoice-linked) payment.
UPDATE payments p
JOIN invoices i ON i.id = p.invoice_id
SET p.client_id = i.client_id
WHERE p.client_id IS NULL;

-- 3. Enforce client_id NOT NULL and add the FK. Done separately so the
--    backfill runs against a still-permissive schema.
ALTER TABLE payments
  MODIFY COLUMN client_id INT NOT NULL,
  ADD CONSTRAINT fk_payment_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE;
