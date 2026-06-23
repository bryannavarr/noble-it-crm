// inventory-pdfs.js — produces a CSV inventory of every PDF under a directory
// for review before bulk upload. Parses what it can from filename + folder
// names + PDF text. Anything ambiguous lands in the CSV blank or with a
// `notes` field — fill in by hand, then feed the CSV to import-invoices-from-csv.js.
//
// Usage:
//   node scripts/inventory-pdfs.js <directory> > invoices-to-import.csv
//
// Requires: npm install pdf-parse

const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

const ROOT = process.argv[2];
if (!ROOT) {
  console.error("Usage: node scripts/inventory-pdfs.js <directory> > out.csv");
  process.exit(1);
}
if (!fs.existsSync(ROOT) || !fs.statSync(ROOT).isDirectory()) {
  console.error(`Not a directory: ${ROOT}`);
  process.exit(1);
}

// ── File walking ────────────────────────────────────────────────────────────

const STATUS_FOLDERS = new Set(["PAID", "SENT", "OPEN", "UNPAID", "DRAFT", "PENDING"]);

const findPdfs = (dir) => {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findPdfs(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) out.push(full);
  }
  return out;
};

// ── Filename parsing ────────────────────────────────────────────────────────
// Order matters: most specific pattern first.

// [A-Z]+ (letters only) so PREFIX01 doesn't get greedy-matched as one blob.
// Order matters: most specific first. INV-NNNNNN above the generic PREFIX-NN
// so the zero-padded form is preserved (and client_prefix stays empty for
// human review).
const FILENAME_PATTERNS = [
  // 1. Generic INV-NNNNNN — preserve original, no client guess.
  {
    re: /^INV-?(\d+)$/i,
    extract: (m, filepath) => ({
      client_prefix: clientPrefixFromFolder(filepath), // empty for flat layout
      invoice_number: m[0].toUpperCase(), // preserves leading zeros
    }),
  },
  // 2. Invoice_PREFIX[-_]?NN_YYYY-MM-DD  (UNIK-24, UNIK02, UNIIK05, EARNEST-1…)
  {
    re: /^(?:Invoice|Receipt)_([A-Z]+)[-_]?(\d+)_(\d{4}-\d{2}-\d{2})$/i,
    extract: (m) => ({
      client_prefix: m[1].toUpperCase(),
      invoice_number: `${m[1].toUpperCase()}-${Number(m[2])}`,
      invoice_date: m[3],
    }),
  },
  // 3. PREFIX-NN  (e.g. UNIK-27)
  {
    re: /^([A-Z]+)-(\d+)$/i,
    extract: (m) => ({
      client_prefix: m[1].toUpperCase(),
      invoice_number: `${m[1].toUpperCase()}-${Number(m[2])}`,
    }),
  },
  // 4. PREFIXNN  (e.g. BELL06, UNIK02 — no separator)
  {
    re: /^([A-Z]+)(\d+)$/i,
    extract: (m) => ({
      client_prefix: m[1].toUpperCase(),
      invoice_number: `${m[1].toUpperCase()}-${Number(m[2])}`,
    }),
  },
];

// Walks up the path skipping status folders (PAID/SENT/etc.) to find a
// folder name we can treat as a client hint. Strips whitespace, uppercases.
const clientPrefixFromFolder = (filepath) => {
  let dir = path.dirname(filepath);
  while (dir && dir !== "/") {
    const name = path.basename(dir);
    if (!STATUS_FOLDERS.has(name.toUpperCase())) {
      // Normalize "BELL PLASTICS" → "BELL_PLASTICS", strip non-alpha
      return name.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "");
    }
    dir = path.dirname(dir);
  }
  return "";
};

const parseFilename = (filepath) => {
  // Strip duplicate-download suffix like "foo (1).pdf" before matching so the
  // patterns don't have to know about it.
  const base = path
    .basename(filepath, path.extname(filepath))
    .replace(/\s+\(\d+\)$/, "");
  for (const pat of FILENAME_PATTERNS) {
    const m = base.match(pat.re);
    if (m) return pat.extract(m, filepath);
  }
  // Fallback: everything blank, client from folder
  return {
    client_prefix: clientPrefixFromFolder(filepath),
    invoice_number: base, // user can rewrite
  };
};

// Folder-derived status (PAID/SENT/etc.) wins as default if present.
const statusFromFolder = (filepath) => {
  for (const part of filepath.split(path.sep)) {
    if (STATUS_FOLDERS.has(part.toUpperCase())) return part.toUpperCase();
  }
  return "PAID"; // safe default for archived invoices
};

// ── PDF text parsing ────────────────────────────────────────────────────────

const MONTHS = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";

// Convert "April 30, 2026" / "Apr 30 2026" / "28 Nov 2023" / "2026-04-30" /
// "04/30/2026" → "YYYY-MM-DD"
const MONTH_MAP = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};
const normalizeDate = (raw) => {
  if (!raw) return "";
  raw = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // MM/DD/YYYY
  let m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  // "April 30, 2026" / "Apr 30 2026"
  m = raw.match(new RegExp(`^(${MONTHS})\\s+(\\d{1,2}),?\\s+(\\d{4})$`, "i"));
  if (m) {
    const mm = MONTH_MAP[m[1].slice(0, 3).toLowerCase()];
    return `${m[3]}-${mm}-${m[2].padStart(2, "0")}`;
  }
  // "28 Nov 2023" / "28 November 2023"
  m = raw.match(new RegExp(`^(\\d{1,2})\\s+(${MONTHS})\\s+(\\d{4})$`, "i"));
  if (m) {
    const mm = MONTH_MAP[m[2].slice(0, 3).toLowerCase()];
    return `${m[3]}-${mm}-${m[1].padStart(2, "0")}`;
  }
  return raw; // give up — user can fix in CSV
};

const parsePdfText = async (filepath) => {
  try {
    const data = await pdfParse(fs.readFileSync(filepath));
    const text = data.text.replace(/ /g, " ");

    // Total amount — try a few common labels
    const amountPatterns = [
      /(?:Total\s+Due|Amount\s+Due|Balance\s+Due|Grand\s+Total|Total)[^\d\$]*\$?\s*([\d,]+\.\d{2})/i,
      /\$\s*([\d,]+\.\d{2})\s*(?:USD)?\s*$/m,
    ];
    let total_amount = "";
    for (const re of amountPatterns) {
      const m = text.match(re);
      if (m) { total_amount = m[1].replace(/,/g, ""); break; }
    }

    // Any of: YYYY-MM-DD, MM/DD/YYYY, "Mon DD, YYYY", "DD Mon YYYY"
    const DATE_ANY =
      `(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}/\\d{4}|` +
      `(?:${MONTHS})\\s+\\d{1,2},?\\s+\\d{4}|` +
      `\\d{1,2}\\s+(?:${MONTHS})\\s+\\d{4})`;

    // Invoice date
    const dateLabel = new RegExp(
      `(?:Invoice\\s*Date|Date\\s*Issued|Issued|Date)[:\\s]+${DATE_ANY}`,
      "i",
    );
    const dm = text.match(dateLabel);
    const invoice_date = dm ? normalizeDate(dm[1]) : "";

    // Due date
    const dueLabel = new RegExp(
      `(?:Due\\s*Date|Payment\\s*Due|Due)[:\\s]+${DATE_ANY}`,
      "i",
    );
    const ddm = text.match(dueLabel);
    const due_date = ddm ? normalizeDate(ddm[1]) : "";

    return { total_amount, invoice_date, due_date, notes: "" };
  } catch (err) {
    return { total_amount: "", invoice_date: "", due_date: "", notes: `pdf parse failed: ${err.message}` };
  }
};

// ── CSV output ──────────────────────────────────────────────────────────────

const csvEscape = (val) => {
  const s = String(val ?? "");
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

(async () => {
  const files = findPdfs(ROOT).sort();

  // CSV header — matches what import-invoices-from-csv.js expects
  console.log(
    [
      "filepath",
      "filename",
      "client_prefix",
      "invoice_number",
      "invoice_date",
      "due_date",
      "total_amount",
      "total_hours",
      "status",
      "notes",
    ].join(","),
  );

  for (const filepath of files) {
    const fromName = parseFilename(filepath);
    const fromPdf = await parsePdfText(filepath);
    const status = statusFromFolder(filepath);

    const row = [
      filepath,
      path.basename(filepath),
      fromName.client_prefix || "",
      fromName.invoice_number || "",
      fromPdf.invoice_date || fromName.invoice_date || "",
      fromPdf.due_date || "",
      fromPdf.total_amount || "",
      "", // total_hours — almost never in archived PDFs; fill if you have it
      status,
      fromPdf.notes || "",
    ];
    console.log(row.map(csvEscape).join(","));
  }

  console.error(`\nInventoried ${files.length} PDF(s) under ${ROOT}.`);
})().catch((err) => {
  console.error("inventory failed:", err);
  process.exit(1);
});
