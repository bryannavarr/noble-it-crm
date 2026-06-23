// import-invoices-from-csv.js — bulk-import archived invoice PDFs.
//
// Reads a CSV (the one inventory-pdfs.js produced, after you reviewed it),
// uploads each PDF to s3://AWS_S3_BUCKET/invoices/<INV>.pdf, inserts a row
// into `invoices` with is_in_cloud=1, and (per client) bumps
// clients.last_invoice_number to MAX(seen) so future generates don't collide
// with imported numbers. Idempotent on invoice_number: a row that already
// exists in `invoices` is skipped.
//
// Usage:
//   node scripts/import-invoices-from-csv.js <csv-path>              # real run
//   node scripts/import-invoices-from-csv.js <csv-path> --dry-run    # validate only
//
// CSV columns (header row required):
//   filepath, filename, client_prefix, invoice_number, invoice_date,
//   due_date, total_amount, total_hours, status, notes
//
// Required per row: filepath, client_prefix, invoice_number, invoice_date,
// total_amount. Anything else is filled with sensible defaults.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const CSV_PATH = process.argv[2];
const DRY_RUN = process.argv.includes("--dry-run");

if (!CSV_PATH) {
  console.error("Usage: node scripts/import-invoices-from-csv.js <csv-path> [--dry-run]");
  process.exit(1);
}
if (!fs.existsSync(CSV_PATH)) {
  console.error(`CSV not found: ${CSV_PATH}`);
  process.exit(1);
}

const region = process.env.AWS_REGION;
const bucket = process.env.AWS_S3_BUCKET;
if (!DRY_RUN && (!region || !bucket)) {
  console.error("AWS_REGION and AWS_S3_BUCKET must be set in .env (or use --dry-run).");
  process.exit(1);
}

// ── CSV parsing ─────────────────────────────────────────────────────────────
// Handles quoted fields (commas + escaped quotes inside) and CRLF/LF line endings.

const parseCsv = (content) => {
  const rows = [];
  let cur = "";
  let field = "";
  let inQuotes = false;
  let row = [];

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"' && content[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else {
      if (ch === '"' && field === "") inQuotes = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && content[i + 1] === "\n") i++;
        row.push(field);
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
        field = "";
      } else field += ch;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }

  if (!rows.length) return [];
  const header = rows.shift().map((h) => h.trim());
  return rows
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
};

// ── Main ────────────────────────────────────────────────────────────────────

(async () => {
  const rows = parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
  if (!rows.length) {
    console.error("CSV has no data rows.");
    process.exit(1);
  }
  console.log(`Loaded ${rows.length} row(s) from ${CSV_PATH}.`);
  if (DRY_RUN) console.log("DRY RUN — no DB writes, no S3 uploads.\n");

  const pool = await mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME || "noble_msp",
  });

  const [clientRows] = await pool.execute(
    "SELECT id, name, invoice_prefix FROM clients",
  );
  const clientByPrefix = Object.fromEntries(
    clientRows.map((c) => [c.invoice_prefix.toUpperCase(), c]),
  );

  const s3 = DRY_RUN ? null : new S3Client({ region });

  let imported = 0;
  let skipped = 0;
  const failures = [];
  const clientMaxSeen = new Map(); // client_id → max suffix imported

  for (const [i, row] of rows.entries()) {
    const lineNo = i + 2; // +1 header, +1 zero-index
    const filepath = row.filepath;
    const filename = row.filename || path.basename(filepath || "");
    const invoiceNumber = (row.invoice_number || "").trim();
    const clientPrefix = (row.client_prefix || "").trim().toUpperCase();
    const invoiceDate = (row.invoice_date || "").trim();
    const dueDate = (row.due_date || "").trim() || invoiceDate;
    const totalAmount = Number(row.total_amount);
    const totalHours = Number(row.total_hours || 0);
    const status = (row.status || "PAID").trim().toUpperCase();

    const fail = (reason) => {
      failures.push({ line: lineNo, row: invoiceNumber || filename, reason });
      console.error(`  ✗ row ${lineNo} (${invoiceNumber || filename}): ${reason}`);
    };

    if (!filepath) { fail("filepath is empty"); continue; }
    if (!fs.existsSync(filepath)) { fail(`file not found: ${filepath}`); continue; }
    if (!invoiceNumber) { fail("invoice_number is empty"); continue; }
    if (!clientPrefix) { fail("client_prefix is empty"); continue; }
    if (!Number.isFinite(totalAmount)) { fail("total_amount must be a number"); continue; }
    if (!invoiceDate) { fail("invoice_date is empty"); continue; }

    const client = clientByPrefix[clientPrefix];
    if (!client) {
      fail(`unknown client prefix "${clientPrefix}" (known: ${Object.keys(clientByPrefix).join(", ")})`);
      continue;
    }

    // Skip if invoice_number already in DB
    const [existing] = await pool.execute(
      "SELECT id FROM invoices WHERE invoice_number = ?",
      [invoiceNumber],
    );
    if (existing.length) {
      console.log(`  → skip ${invoiceNumber} (already in DB as id ${existing[0].id})`);
      skipped++;
      continue;
    }

    const s3Key = `invoices/${invoiceNumber}.pdf`;
    const validStatuses = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "PAID"];
    const safeStatus = validStatuses.includes(status) ? status : "PAID";

    if (DRY_RUN) {
      console.log(
        `  ✓ would import ${invoiceNumber} → s3://${bucket}/${s3Key}  ` +
          `(client=${client.name}, date=${invoiceDate}, amount=$${totalAmount.toFixed(2)}, status=${safeStatus})`,
      );
      imported++;
      const suffix = Number(String(invoiceNumber).split("-").pop());
      if (Number.isFinite(suffix)) {
        clientMaxSeen.set(client.id, Math.max(clientMaxSeen.get(client.id) ?? 0, suffix));
      }
      continue;
    }

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          Body: fs.readFileSync(filepath),
          ContentType: "application/pdf",
        }),
      );

      const sentAt = (safeStatus === "SENT" || safeStatus === "PAID") ? invoiceDate : null;
      const paidAt = safeStatus === "PAID" ? invoiceDate : null;

      await pool.execute(
        `INSERT INTO invoices
          (client_id, invoice_number, invoice_date, due_date, total_hours, total_amount,
           status, pdf_path, is_in_cloud, sent_at, paid_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          client.id,
          invoiceNumber,
          invoiceDate,
          dueDate || invoiceDate,
          totalHours,
          totalAmount,
          safeStatus,
          s3Key,
          sentAt,
          paidAt,
        ],
      );

      const suffix = Number(String(invoiceNumber).split("-").pop());
      if (Number.isFinite(suffix)) {
        clientMaxSeen.set(client.id, Math.max(clientMaxSeen.get(client.id) ?? 0, suffix));
      }

      console.log(`  ✓ ${invoiceNumber} → s3://${bucket}/${s3Key}`);
      imported++;
    } catch (err) {
      fail(err.message);
    }
  }

  // Bump each client's last_invoice_number to MAX(existing, imported) so the
  // next msp invoice --generate doesn't collide with an imported number.
  if (!DRY_RUN && clientMaxSeen.size) {
    console.log("\nUpdating clients.last_invoice_number where imports exceed current counter...");
    for (const [clientId, importedMax] of clientMaxSeen) {
      const [[cur]] = await pool.execute(
        "SELECT invoice_prefix, last_invoice_number FROM clients WHERE id = ?",
        [clientId],
      );
      if (importedMax > Number(cur.last_invoice_number)) {
        await pool.execute(
          "UPDATE clients SET last_invoice_number = ? WHERE id = ?",
          [importedMax, clientId],
        );
        console.log(
          `  ${cur.invoice_prefix}: ${cur.last_invoice_number} → ${importedMax}`,
        );
      }
    }
  }

  await pool.end();

  console.log("\n────────────────────────────────────");
  console.log(`Imported: ${imported}`);
  console.log(`Skipped (already in DB): ${skipped}`);
  console.log(`Failed: ${failures.length}`);
  if (failures.length) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(`  line ${f.line}: ${f.row} — ${f.reason}`));
  }
  if (DRY_RUN) console.log("\n(dry run — re-run without --dry-run to actually import)");
})().catch((err) => {
  console.error("import failed:", err);
  process.exit(1);
});
