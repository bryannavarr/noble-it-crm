-- ============================================================
-- noble_msp migration: 007_media_digitization_and_adjustments
-- Adds MEDIA_DIGITIZATION to the ticket category enum (covers
-- VHS, cassette, Hi-8, slides, etc. — anything analog → digital)
-- and ADJUSTMENT to invoice_line_items so we can attach
-- discounts / credits to an invoice post-generation.
-- Run once against the noble_msp database.
-- ============================================================

ALTER TABLE tickets MODIFY COLUMN category ENUM(
  'BUG',
  'MAINTENANCE',
  'CLOUD_MAINTENANCE',
  'DATABASE',
  'DEPLOYMENT_STAGING',
  'DEPLOYMENT_PROD',
  'FEATURE',
  'HARDWARE',
  'BREAK_FIX',
  'IT_SUPPORT',
  'MEDIA_DIGITIZATION'
) NOT NULL;

ALTER TABLE invoice_line_items MODIFY COLUMN type ENUM(
  'TICKET',
  'MEETING',
  'ADJUSTMENT'
) NOT NULL;
