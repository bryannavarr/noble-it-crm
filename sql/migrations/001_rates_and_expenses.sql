-- ============================================================
-- noble_msp migration: 001_rates_and_expenses
-- Run this ONCE against your existing noble_msp database
-- Safe to run if tables already exist (uses IF NOT EXISTS)
-- ============================================================

USE noble_msp;

-- ── 1. Rename hourly_rate → default_rate on clients ──────────────────────────
-- Only run if hourly_rate column still exists
SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'noble_msp'
  AND TABLE_NAME     = 'clients'
  AND COLUMN_NAME    = 'hourly_rate'
);

SET @sql = IF(
  @col_exists > 0,
  'ALTER TABLE clients CHANGE hourly_rate default_rate DECIMAL(10,2) NOT NULL DEFAULT 50.00',
  'SELECT "hourly_rate already migrated, skipping" AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── 2. Create client_rates table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_rates (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  client_id   INT NOT NULL,
  category    ENUM(
                'BUG',
                'MAINTENANCE',
                'CLOUD_MAINTENANCE',
                'DATABASE',
                'DEPLOYMENT_STAGING',
                'DEPLOYMENT_PROD',
                'FEATURE',
                'MEETING'
              ) NOT NULL,
  rate        DECIMAL(10,2) NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_client_category (client_id, category),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- ── 3. Create expenses table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  client_id       INT NOT NULL,
  ticket_id       INT DEFAULT NULL,
  description     VARCHAR(500) NOT NULL,
  amount          DECIMAL(10,2) NOT NULL,
  markup_pct      DECIMAL(5,2) NOT NULL DEFAULT 0,
  billable_amount DECIMAL(10,2) NOT NULL,
  expense_date    DATE NOT NULL,
  invoice_id      INT DEFAULT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id)
);

-- ── 4. Update invoice_line_items type enum to include EXPENSE ─────────────────
ALTER TABLE invoice_line_items
  MODIFY COLUMN type ENUM('TICKET', 'MEETING', 'EXPENSE') NOT NULL;

-- ── 5. Update invoice_line_items subject column (was named 'summary') ─────────
-- Only run if summary column still exists
SET @summary_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'noble_msp'
  AND TABLE_NAME     = 'invoice_line_items'
  AND COLUMN_NAME    = 'summary'
);

SET @sql2 = IF(
  @summary_exists > 0,
  'ALTER TABLE invoice_line_items CHANGE summary subject VARCHAR(500) NOT NULL',
  'SELECT "summary already migrated to subject, skipping" AS info'
);

PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT 'Migration 001 complete' AS status;

SELECT
  TABLE_NAME,
  COLUMN_NAME,
  COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'noble_msp'
AND (
  (TABLE_NAME = 'clients'              AND COLUMN_NAME = 'default_rate') OR
  (TABLE_NAME = 'client_rates'         AND COLUMN_NAME = 'rate')         OR
  (TABLE_NAME = 'expenses'             AND COLUMN_NAME = 'billable_amount') OR
  (TABLE_NAME = 'invoice_line_items'   AND COLUMN_NAME = 'type')
)
ORDER BY TABLE_NAME, COLUMN_NAME;
