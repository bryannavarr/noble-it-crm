-- ============================================================
-- noble_msp migration: 010_hardware_markup_per_work_log
-- Per-work-log hardware markup. Captured at log time via the CLI
-- prompt instead of being read from HARDWARE_MARKUP_PCT in .env.
--   * NULL  → fall back to env HARDWARE_MARKUP_PCT (legacy rows)
--   * 0–999 → percent markup applied at invoice generation time
-- Run once against the noble_msp database.
-- ============================================================

ALTER TABLE work_logs
  ADD COLUMN markup_pct DECIMAL(5,2) NULL AFTER unit_price;
