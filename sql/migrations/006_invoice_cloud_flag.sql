-- ============================================================
-- noble_msp migration: 006_invoice_cloud_flag
-- Marks invoices that have been uploaded to S3 (vs. only on the
-- local filesystem). pdf_path is reused: it holds the S3 key
-- once is_in_cloud = 1, and the local path before that.
-- Run once against the noble_msp database.
-- ============================================================

ALTER TABLE invoices
  ADD COLUMN is_in_cloud TINYINT(1) NOT NULL DEFAULT 0 AFTER pdf_path;
