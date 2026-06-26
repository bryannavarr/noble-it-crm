-- ============================================================
-- noble_msp migration: 010_hardware_sell_price
-- Per-work-log hardware sell price. Captured at log time via the CLI
-- prompt (alongside unit cost) instead of being derived from a single
-- HARDWARE_MARKUP_PCT in .env.
--   * unit_price       = what we paid (cost)         — already existed
--   * unit_sell_price  = what we charge the client   — new
--   * NULL on legacy rows → fall back to env HARDWARE_MARKUP_PCT
-- Run once against the noble_msp database.
-- ============================================================

ALTER TABLE work_logs
  ADD COLUMN unit_sell_price DECIMAL(10,2) NULL AFTER unit_price;
