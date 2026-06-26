-- ============================================================
-- noble_msp migration: 011_payments_table
-- One row per payment received against an invoice. Multiple payments are
-- allowed (partials sum to PAID). Status sync on the invoices row is done
-- in application code (admin payment.service) inside the same transaction
-- as the INSERT/DELETE.
-- Run once against the noble_msp database.
-- ============================================================

CREATE TABLE IF NOT EXISTS payments (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id        INT NOT NULL,
  amount            DECIMAL(10,2) NOT NULL,
  method            ENUM('ACH','CASH','ZELLE','PAYPAL','VENMO','CHECK','CREDIT_CARD','OTHER') NOT NULL,
  paid_date         DATE NOT NULL,
  reference_number  VARCHAR(100) DEFAULT NULL,
  notes             TEXT DEFAULT NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  INDEX idx_invoice (invoice_id),
  INDEX idx_paid_date (paid_date)
);
