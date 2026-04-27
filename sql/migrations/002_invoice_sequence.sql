-- ============================================================
-- noble_msp migration: 002_invoice_sequence
-- Adds last_invoice_number to clients table and fast-forwards
-- UNIK sequence to 25 (next invoice will be UNIK-26)
-- ============================================================

USE noble_msp;

-- ── 1. Add last_invoice_number column to clients ──────────────────────────────
SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'noble_msp'
  AND TABLE_NAME     = 'clients'
  AND COLUMN_NAME    = 'last_invoice_number'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE clients ADD COLUMN last_invoice_number INT NOT NULL DEFAULT 0',
  'SELECT "last_invoice_number already exists, skipping" AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── 2. Fast-forward UNIK invoice sequence to 25 ───────────────────────────────
UPDATE clients
SET last_invoice_number = 25
WHERE invoice_prefix = 'UNIK';

-- ── 3. Fast-forward UNIK ticket sequence to 106 ──────────────────────────────
UPDATE client_ticket_sequences
SET last_number = 106
WHERE client_id = (SELECT id FROM clients WHERE invoice_prefix = 'UNIK');

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT 'Migration 002 complete' AS status;

SELECT
  c.invoice_prefix,
  c.last_invoice_number,
  cts.last_number AS last_ticket_number,
  CONCAT(c.invoice_prefix, '-', c.last_invoice_number + 1) AS next_invoice,
  CONCAT(c.invoice_prefix, '-', cts.last_number + 1)       AS next_ticket
FROM clients c
JOIN client_ticket_sequences cts ON cts.client_id = c.id
ORDER BY c.invoice_prefix;
