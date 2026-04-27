-- ============================================================
-- noble_msp migration: 003_hardware_and_qty
-- Adds HARDWARE category, renames hours->qty, adds unit_price
-- ============================================================

USE noble_msp;

-- ── 1. Add HARDWARE to tickets category enum ─────────────────────────────────
ALTER TABLE tickets
  MODIFY COLUMN category ENUM(
    'BUG',
    'MAINTENANCE',
    'CLOUD_MAINTENANCE',
    'DATABASE',
    'DEPLOYMENT_STAGING',
    'DEPLOYMENT_PROD',
    'FEATURE',
    'HARDWARE'
  ) NOT NULL;

-- ── 2. Add HARDWARE to client_rates category enum ────────────────────────────
ALTER TABLE client_rates
  MODIFY COLUMN category ENUM(
    'BUG',
    'MAINTENANCE',
    'CLOUD_MAINTENANCE',
    'DATABASE',
    'DEPLOYMENT_STAGING',
    'DEPLOYMENT_PROD',
    'FEATURE',
    'HARDWARE',
    'MEETING'
  ) NOT NULL;

-- ── 3. Rename hours → qty in work_logs ───────────────────────────────────────
SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'noble_msp'
  AND TABLE_NAME     = 'work_logs'
  AND COLUMN_NAME    = 'hours'
);

SET @sql = IF(
  @col_exists > 0,
  'ALTER TABLE work_logs CHANGE hours qty DECIMAL(8,2) NOT NULL',
  'SELECT "hours already renamed to qty, skipping" AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── 4. Add unit_price column to work_logs ────────────────────────────────────
SET @col_exists2 = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'noble_msp'
  AND TABLE_NAME     = 'work_logs'
  AND COLUMN_NAME    = 'unit_price'
);

SET @sql2 = IF(
  @col_exists2 = 0,
  'ALTER TABLE work_logs ADD COLUMN unit_price DECIMAL(10,2) DEFAULT NULL AFTER qty',
  'SELECT "unit_price already exists, skipping" AS info'
);

PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- ── 5. Drop expenses table if it exists ──────────────────────────────────────
DROP TABLE IF EXISTS expenses;

-- ── 6. Revert invoice_line_items type to remove EXPENSE ──────────────────────
ALTER TABLE invoice_line_items
  MODIFY COLUMN type ENUM('TICKET', 'MEETING') NOT NULL;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT 'Migration 003 complete' AS status;

SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'noble_msp'
AND (
  (TABLE_NAME = 'work_logs' AND COLUMN_NAME IN ('qty', 'unit_price')) OR
  (TABLE_NAME = 'tickets'   AND COLUMN_NAME = 'category')
)
ORDER BY TABLE_NAME, COLUMN_NAME;
