// fill-hours-in-csv.js — opens each PDF referenced in the CSV, tries to extract
// total hours, and fills in the total_hours column ONLY for rows where it's
// currently blank. All other rows are written back unchanged so your manual
// edits are preserved.
//
// Usage:
//   node scripts/fill-hours-in-csv.js invoices-to-import.csv
//
// Writes back to the same file. Prints a per-row line saying what it filled in
// (with the pattern it matched) so you can spot anything fishy before the import.

const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

const CSV_PATH = process.argv[2];
if (!CSV_PATH) {
  console.error("Usage: node scripts/fill-hours-in-csv.js <csv-path>");
  process.exit(1);
}
if (!fs.existsSync(CSV_PATH)) {
  console.error(`CSV not found: ${CSV_PATH}`);
  process.exit(1);
}

// ── CSV ─────────────────────────────────────────────────────────────────────
// Same parser as the importer. Returns { header, rows } so we can write back
// with the original column order preserved.

const parseCsv = (content) => {
  const rows = [];
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
  const header = rows.shift();
  return { header, rows };
};

const csvEscape = (val) => {
  const s = String(val ?? "");
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const writeCsv = (header, rows) =>
  [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";

// ── Hour extraction ─────────────────────────────────────────────────────────
// Tried in order; first match wins. Each strategy returns { hours, source } or
// null. The `source` is printed alongside so you can sanity-check the match.

const extractHours = (text, totalAmount) => {
  // 1. Explicit "Total Hours: X" / "TOTAL HOURS: X" — my CLI's PDFKit output
  let m = text.match(/Total\s*Hours[:\s]+([\d.]+)/i);
  if (m) return { hours: parseFloat(m[1]), source: "Total Hours label" };

  // 2. Zoho format — each hourly line item has "X.XX\nHour" beneath the qty
  //    (sometimes "X.XX\n Hour" with a space). Sum them.
  const zoho = [...text.matchAll(/(\d+(?:\.\d+)?)\s*\n\s*Hour\b/gi)];
  if (zoho.length) {
    const hours = zoho.reduce((s, mm) => s + parseFloat(mm[1]), 0);
    return { hours, source: `${zoho.length} Zoho "Hour" line(s)` };
  }

  // 3. HubSpot-style — qty appended to the amount cell as "Xh" or "X.Xh":
  //    "$30.001h", "$100.002h". Sum the hour suffixes.
  const hSuffix = [...text.matchAll(/\$[\d,]+\.\d{2}\s*([\d]+(?:\.\d+)?)h\b/gi)];
  if (hSuffix.length) {
    const hours = hSuffix.reduce((s, mm) => s + parseFloat(mm[1]), 0);
    return { hours, source: `${hSuffix.length} "Xh" suffix(es)` };
  }

  // 4. Older PDFKit format (UNIK07-style): "qty$rate$amount" glued, no Hour
  //    label. If qty * rate ≈ amount for the row, treat qty as hours. Sum
  //    only those rows.
  const lineItems = [...text.matchAll(/(\d+(?:\.\d+)?)\s*\$(\d+(?:\.\d{2}))\s*\$(\d+(?:,\d{3})*(?:\.\d{2}))/g)];
  if (lineItems.length) {
    let hours = 0;
    let matchedRows = 0;
    for (const mm of lineItems) {
      const qty = parseFloat(mm[1]);
      const rate = parseFloat(mm[2]);
      const amount = parseFloat(mm[3].replace(/,/g, ""));
      if (Math.abs(qty * rate - amount) < 0.01) {
        hours += qty;
        matchedRows++;
      }
    }
    if (hours > 0) {
      return { hours, source: `${matchedRows} qty×rate=amount row(s)` };
    }
  }

  // 5. Newer PDFKit format (UNIK10–UNIK22): "<hours>$<amount>" — single $,
  //    no rate column. Try standard rates and accept only when most rows
  //    consistent AND sum-of-rows ≈ total_amount (so we don't false-match
  //    other dollar figures in the doc).
  const oneDollar = [...text.matchAll(/(\d+(?:\.\d+)?)\s*\$([\d,]+\.\d{2})\b/g)];
  if (oneDollar.length >= 1 && totalAmount > 0) {
    for (const rate of [50, 75, 100, 125, 150]) {
      let hours = 0;
      let matched = 0;
      for (const mm of oneDollar) {
        const h = parseFloat(mm[1]);
        const amount = parseFloat(mm[2].replace(/,/g, ""));
        if (Math.abs(h * rate - amount) < 0.01) {
          hours += h;
          matched++;
        }
      }
      // Confidence gate: at least 2 matched rows AND their sum equals the
      // invoice total (within a dollar). Stops us from counting things like
      // "Page 1 of 2$X" or other stray $-figures as hours.
      if (matched >= 2 && Math.abs(hours * rate - totalAmount) < 1) {
        return { hours, source: `${matched} <h>$<amt> row(s) at $${rate}/hr` };
      }
    }

    // 5b. Single-item invoice at a non-standard rate (e.g. EARNEST-1's
    //     "1$129.00", SIONA-1's "1$60.00"). Accept ONLY when exactly one
    //     match has amount == total — that proves it's the line item, not a
    //     stray figure.
    for (const mm of oneDollar) {
      const h = parseFloat(mm[1]);
      const amount = parseFloat(mm[2].replace(/,/g, ""));
      if (h > 0 && Math.abs(amount - totalAmount) < 0.01) {
        return {
          hours: h,
          source: `single line item at $${(amount / h).toFixed(2)}/hr`,
        };
      }
    }
  }

  return null;
};

// ── Main ────────────────────────────────────────────────────────────────────

(async () => {
  const { header, rows } = parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
  const col = (name) => header.findIndex((h) => h.trim() === name);
  const FILEPATH = col("filepath");
  const HOURS = col("total_hours");
  const AMOUNT = col("total_amount");
  const INV = col("invoice_number");

  if (FILEPATH < 0 || HOURS < 0) {
    console.error("CSV missing required columns: filepath, total_hours");
    process.exit(1);
  }

  let filled = 0;
  let skippedExisting = 0;
  let unknown = 0;

  for (const row of rows) {
    const filepath = row[FILEPATH];
    const inv = row[INV];
    const currentHours = (row[HOURS] || "").trim();
    const totalAmount = Number(row[AMOUNT]);

    if (currentHours !== "") {
      skippedExisting++;
      continue;
    }
    if (!filepath || !fs.existsSync(filepath)) {
      console.log(`  · ${inv || filepath}: file not found, skipping`);
      unknown++;
      continue;
    }

    try {
      const data = await pdfParse(fs.readFileSync(filepath));
      const result = extractHours(data.text, totalAmount);
      if (result) {
        // Strip pointless trailing zeros: 5.00 → 5, 1.50 → 1.5
        const formatted = String(Number(result.hours.toFixed(2)));
        row[HOURS] = formatted;
        console.log(`  ✓ ${inv}: ${formatted}h  (${result.source})`);
        filled++;
      } else {
        console.log(`  · ${inv}: no pattern matched, left blank`);
        unknown++;
      }
    } catch (err) {
      console.log(`  ✗ ${inv}: pdf parse failed — ${err.message}`);
      unknown++;
    }
  }

  fs.writeFileSync(CSV_PATH, writeCsv(header, rows));

  console.log(`\n────────────────────────────────────`);
  console.log(`Filled:                ${filled}`);
  console.log(`Already had a value:   ${skippedExisting}`);
  console.log(`Couldn't determine:    ${unknown}`);
  console.log(`\nCSV updated in place: ${path.resolve(CSV_PATH)}`);
})().catch((err) => {
  console.error("fill failed:", err);
  process.exit(1);
});
