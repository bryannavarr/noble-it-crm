-- ============================================================
-- noble_msp migration: 008_adjustments_table
-- Adjustments as a first-class entity. They belong to a client and
-- become invoice line items at generation time, the same way
-- work_logs become line items.
--   * invoice_id NULL  → pending (will attach to the next generate
--                        for this client)
--   * invoice_id set   → attached to that invoice (already billed)
-- Run once against the noble_msp database.
-- ============================================================

CREATE TABLE IF NOT EXISTS adjustments (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  client_id  INT NOT NULL,
  amount     DECIMAL(10,2) NOT NULL,
  label      VARCHAR(255) NOT NULL,
  invoice_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY (client_id),
  KEY (invoice_id),
  CONSTRAINT adjustments_client_fk  FOREIGN KEY (client_id)  REFERENCES clients(id),
  CONSTRAINT adjustments_invoice_fk FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);
