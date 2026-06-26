import { createTransport } from "nodemailer";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import pool from "../db/pool";
import { CATEGORY_LABELS } from "../types";
import {
  getClientById,
  getNextInvoiceNumber,
  getRateForCategory,
  peekNextInvoiceNumber,
} from "./client.service";
import { getMeetingsForInvoice } from "./meeting.service";
import * as s3 from "./s3.service";
import * as adjustmentService from "./adjustment.service";

// Materializes a pending Adjustment row into the line-item shape buildLineItems
// produces — used so previewInvoice and the PDF generator treat adjustments
// uniformly with TICKET/MEETING rows.
const adjustmentToLineItem = (adj: { id: number; amount: number; label: string }) => ({
  type: "ADJUSTMENT" as const,
  reference_id: adj.id,
  category: "Adjustment",
  subject: adj.label,
  qty: 0, // hours column is left blank for ADJUSTMENT rows on the PDF
  unit_price: null,
  rate: Number(adj.amount),
  amount: Number(adj.amount),
  is_hardware: false,
});

// ── Preview ───────────────────────────────────────────────────────────────────

export const previewInvoice = async (clientId: number, month: string) => {
  const client: any = await getClientById(clientId);
  if (!client) throw new Error("Client not found");

  const workItems = await buildLineItems(clientId, month);
  const pendingAdjustments = await adjustmentService.listPendingForClient(clientId);
  const adjustmentItems = pendingAdjustments.map(adjustmentToLineItem);

  const lineItems = [...workItems, ...adjustmentItems];

  // Hours come only from work items — adjustments are dollar-value rows.
  const totalHours = workItems.reduce((sum, item) => sum + Number(item.qty), 0);
  const totalAmount = lineItems.reduce((sum, item) => sum + Number(item.amount), 0);

  return {
    client,
    month,
    line_items: lineItems,
    pending_adjustments: pendingAdjustments,
    total_hours: totalHours,
    total_amount: totalAmount,
    invoice_number_preview: await peekNextInvoiceNumber(clientId),
  };
};

// ── Generate ──────────────────────────────────────────────────────────────────

export const generateInvoice = async (clientId: number, month: string) => {
  const client: any = await getClientById(clientId);
  if (!client) throw new Error("Client not found");

  const workItems = await buildLineItems(clientId, month);

  // We allow generation if there are pending adjustments even with no work items
  // (a manual-credit-only invoice), but disallow if everything is empty.
  const pendingForCheck = await adjustmentService.listPendingForClient(clientId);
  if (!workItems.length && !pendingForCheck.length) {
    throw new Error("No billable items found for this period");
  }

  const totalHours = workItems.reduce((sum, item) => sum + Number(item.qty), 0);
  const workTotal = workItems.reduce((sum, item) => sum + Number(item.amount), 0);

  const invoiceNumber = await getNextInvoiceNumber(clientId);
  const invoiceDate = new Date();
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + Number(process.env.PAYMENT_DUE_DAYS ?? 30));

  // Use a transaction so the invoice row + line items + adjustment attach
  // either all land or all roll back.
  const conn = await pool.getConnection();
  let invoiceId: number;
  let lineItems: any[];
  let totalAmount: number;
  try {
    await conn.beginTransaction();

    const [result]: any = await conn.execute(
      `INSERT INTO invoices
        (client_id, invoice_number, invoice_date, due_date, total_hours, total_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, 'DRAFT')`,
      [
        clientId,
        invoiceNumber,
        invoiceDate.toISOString().split("T")[0],
        dueDate.toISOString().split("T")[0],
        totalHours,
        workTotal, // placeholder; we update after we know the adjustment total
      ],
    );
    invoiceId = result.insertId;

    // Attach any pending adjustments to this invoice and materialize them as
    // line items in the same transaction.
    const attached = await adjustmentService.attachPendingToInvoice(clientId, invoiceId, conn);
    const adjustmentItems = attached.map(adjustmentToLineItem);

    lineItems = [...workItems, ...adjustmentItems];
    totalAmount = lineItems.reduce((sum, item) => sum + Number(item.amount), 0);

    for (const item of lineItems) {
      await conn.execute(
        `INSERT INTO invoice_line_items
          (invoice_id, type, reference_id, category, subject, hours, rate, amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          item.type,
          item.reference_id,
          item.category,
          item.subject,
          item.qty,
          item.rate ?? 0,
          item.amount,
        ],
      );
    }

    // Refresh total_amount with the adjustment-inclusive value.
    await conn.execute(`UPDATE invoices SET total_amount = ? WHERE id = ?`, [
      totalAmount,
      invoiceId,
    ]);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Mark meetings as invoiced
  const meetingIds = lineItems
    .filter((item) => item.type === "MEETING")
    .map((item) => item.reference_id);

  if (meetingIds.length) {
    await pool.execute(
      `UPDATE meetings SET invoice_id = ? WHERE id IN (${meetingIds.map(() => "?").join(",")})`,
      [invoiceId, ...meetingIds],
    );
  }

  // Mark tickets as DONE
  const ticketIds = [
    ...new Set(lineItems.filter((item) => item.type === "TICKET").map((item) => item.reference_id)),
  ];

  if (ticketIds.length) {
    await pool.execute(
      `UPDATE tickets SET status = 'DONE' WHERE id IN (${ticketIds.map(() => "?").join(",")})`,
      ticketIds,
    );
  }

  const meta = { invoiceNumber, invoiceDate, dueDate, totalHours, totalAmount };

  const pdfPath = await generatePDF(invoiceId, client, lineItems, meta);

  await pool.execute(`UPDATE invoices SET pdf_path = ?, status = 'PENDING_APPROVAL' WHERE id = ?`, [
    pdfPath,
    invoiceId,
  ]);

  await sendApprovalEmail(invoiceId, client, lineItems, { ...meta, pdfPath });

  return getInvoiceById(invoiceId);
};

// ── List / Get ────────────────────────────────────────────────────────────────

export const listInvoices = async (clientId?: number) => {
  const conditions = clientId ? "WHERE i.client_id = ?" : "";
  const params = clientId ? [clientId] : [];

  const [rows] = await pool.execute(
    `SELECT i.*, c.name AS client_name
     FROM invoices i
     JOIN clients c ON i.client_id = c.id
     ${conditions}
     ORDER BY i.invoice_date DESC`,
    params,
  );

  return rows;
};

export const getInvoiceById = async (id: number) => {
  const [rows]: any = await pool.execute(
    `SELECT i.*,
            c.name         AS client_name,
            c.email        AS client_email,
            c.contact_name,
            c.phone        AS client_phone
     FROM invoices i
     JOIN clients c ON i.client_id = c.id
     WHERE i.id = ?`,
    [id],
  );

  if (!rows[0]) return null;

  const [lineItems] = await pool.execute(
    "SELECT * FROM invoice_line_items WHERE invoice_id = ? ORDER BY id ASC",
    [id],
  );

  return { ...rows[0], line_items: lineItems };
};

// Deletes an invoice and unwinds its side effects so the underlying work can
// be re-billed cleanly:
//   * invoice_line_items rows go away
//   * adjustments go back to pending (invoice_id NULL) so they attach to the
//     next generate
//   * meetings get unmarked (invoice_id NULL) so they're billable again
//   * the per-client ticket-prefix counter rolls back IF this was the most
//     recent invoice for that client (otherwise a gap is left, since rolling
//     back would conflict with later invoice numbers)
//   * local PDF file is deleted, S3 object is removed if was archived
// Tickets are *not* reverted from DONE — work_logs aren't tied to invoices,
// so the next generate will pick them up regardless; the user can adjust
// ticket status manually if they want it back to IN_PROGRESS.
export const deleteInvoice = async (id: number) => {
  const invoice: any = await getInvoiceById(id);
  if (!invoice) throw new Error("Invoice not found");

  const localPdfPath = invoice.is_in_cloud ? null : invoice.pdf_path;
  const s3Key = invoice.is_in_cloud ? invoice.pdf_path : null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(`UPDATE adjustments SET invoice_id = NULL WHERE invoice_id = ?`, [id]);
    await conn.execute(`UPDATE meetings    SET invoice_id = NULL WHERE invoice_id = ?`, [id]);
    await conn.execute(`DELETE FROM invoice_line_items WHERE invoice_id = ?`, [id]);
    await conn.execute(`DELETE FROM invoices WHERE id = ?`, [id]);

    // Recompute the per-client invoice counter from whatever invoices are
    // left. Sets it to the highest remaining suffix, or 0 if none remain.
    // Robust to out-of-order deletes (deleting VIVIAN-1 before VIVIAN-2) and
    // to clearing every invoice for a client.
    const [[maxRow]]: any = await conn.execute(
      `SELECT COALESCE(
         MAX(CAST(SUBSTRING_INDEX(invoice_number, '-', -1) AS UNSIGNED)),
         0
       ) AS max_num
       FROM invoices
       WHERE client_id = ?`,
      [invoice.client_id],
    );
    await conn.execute(
      `UPDATE clients SET last_invoice_number = ? WHERE id = ?`,
      [Number(maxRow.max_num), invoice.client_id],
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Best-effort file cleanup; we don't want a missing file to fail the delete.
  if (localPdfPath) {
    try {
      if (fs.existsSync(localPdfPath)) fs.unlinkSync(localPdfPath);
    } catch (err: any) {
      console.warn(`[deleteInvoice] could not remove local file ${localPdfPath}: ${err.message}`);
    }
  }
  if (s3Key && s3.isEnabled()) {
    try {
      await s3.deleteObject(s3Key);
    } catch (err: any) {
      console.warn(`[deleteInvoice] could not remove S3 object ${s3Key}: ${err.message}`);
    }
  }

  return {
    id,
    invoice_number: invoice.invoice_number,
    client_id: invoice.client_id,
  };
};

// Appends an ADJUSTMENT line item (positive surcharge or negative discount)
// to an existing invoice, recomputes total_amount from all line items, and
// regenerates the PDF. If the invoice already lives in S3, re-uploads it.
// The adjustment is also recorded in the `adjustments` table (with invoice_id
// set immediately) so it shares the same audit trail as pending adjustments.
export const addAdjustment = async (invoiceId: number, amount: number, label: string) => {
  const invoice: any = await getInvoiceById(invoiceId);
  if (!invoice) throw new Error("Invoice not found");

  // Record in adjustments table first — also validates amount + label.
  const adj = await adjustmentService.addAttached(
    invoice.client_id,
    invoiceId,
    amount,
    label,
  );

  await pool.execute(
    `INSERT INTO invoice_line_items
       (invoice_id, type, reference_id, category, subject, hours, rate, amount)
     VALUES (?, 'ADJUSTMENT', ?, 'Adjustment', ?, 0, ?, ?)`,
    [invoiceId, adj.id, adj.label, adj.amount, adj.amount],
  );

  const [[totals]]: any = await pool.execute(
    `SELECT COALESCE(SUM(amount), 0) AS total_amount
     FROM invoice_line_items
     WHERE invoice_id = ?`,
    [invoiceId],
  );

  await pool.execute(`UPDATE invoices SET total_amount = ? WHERE id = ?`, [
    Number(totals.total_amount),
    invoiceId,
  ]);

  // Pull a fresh view (with the new line item) and regenerate the PDF.
  const fresh: any = await getInvoiceById(invoiceId);
  const client: any = await getClientById(fresh.client_id);
  const meta = {
    invoiceNumber: fresh.invoice_number,
    invoiceDate: new Date(fresh.invoice_date),
    dueDate: new Date(fresh.due_date),
    totalHours: Number(fresh.total_hours),
    totalAmount: Number(fresh.total_amount),
  };
  const newPdfPath = await generatePDF(invoiceId, client, fresh.line_items, meta);

  // If the invoice was already archived to S3, re-upload the new PDF under
  // the same S3 key so links keep working. pdf_path holds the S3 key in that
  // case, so we need to upload from the regenerated local file and then
  // remove the local copy again.
  if (fresh.is_in_cloud) {
    const s3Key = fresh.pdf_path;
    await s3.uploadFile(newPdfPath, s3Key, "application/pdf");
    try {
      if (fs.existsSync(newPdfPath)) fs.unlinkSync(newPdfPath);
    } catch (err: any) {
      console.warn(`[addAdjustment] could not remove local file ${newPdfPath}: ${err.message}`);
    }
  } else {
    // Otherwise update pdf_path to the freshly regenerated local file.
    await pool.execute(`UPDATE invoices SET pdf_path = ? WHERE id = ?`, [newPdfPath, invoiceId]);
  }

  return getInvoiceById(invoiceId);
};

// Saves the invoice PDF to S3, marks status=APPROVED + is_in_cloud=1, updates
// pdf_path to the S3 key, and removes the local file. Idempotent: a second
// call on an already-saved invoice is a no-op that returns the row as-is.
//
// When S3 isn't configured (typical for local dev) the upload/delete are
// skipped and only the status flips to APPROVED — useful for testing the
// email click flow without real cloud storage.
export const saveInvoiceToS3 = async (id: number) => {
  const invoice: any = await getInvoiceById(id);
  if (!invoice) throw new Error("Invoice not found");

  // Already saved? No-op.
  if (invoice.is_in_cloud) return invoice;

  if (!invoice.pdf_path) throw new Error("No PDF found for this invoice");

  const localPath = invoice.pdf_path;
  const s3Key = `invoices/${invoice.invoice_number}.pdf`;

  if (s3.isEnabled()) {
    await s3.uploadFile(localPath, s3Key, "application/pdf");
    // Best-effort local cleanup — log but don't fail the save if the unlink errors.
    try {
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    } catch (err: any) {
      console.warn(`[saveInvoiceToS3] could not remove local file ${localPath}: ${err.message}`);
    }
    await pool.execute(
      `UPDATE invoices SET status = 'APPROVED', is_in_cloud = 1, pdf_path = ? WHERE id = ?`,
      [s3Key, id],
    );
  } else {
    // S3 disabled (local dev). Approve without moving the file.
    await pool.execute(`UPDATE invoices SET status = 'APPROVED' WHERE id = ?`, [id]);
  }

  return getInvoiceById(id);
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const buildLineItems = async (clientId: number, month: string) => {
  const items: any[] = [];

  // Exclude tickets that already have a line item on any prior invoice — once
  // a ticket has been billed, it shouldn't reappear on subsequent previews
  // just because it still has work_logs in the queried month.
  const [tickets]: any = await pool.execute(
    `SELECT t.id, t.ticket_number, t.category, t.subject, t.description,
            SUM(wl.qty) AS total_qty
     FROM tickets t
     JOIN work_logs wl ON wl.ticket_id = t.id
     WHERE t.client_id = ?
     AND DATE_FORMAT(wl.worked_date, '%Y-%m') = ?
     AND NOT EXISTS (
       SELECT 1 FROM invoice_line_items ili
       WHERE ili.reference_id = t.id AND ili.type = 'TICKET'
     )
     GROUP BY t.id
     HAVING total_qty > 0
     ORDER BY CAST(SUBSTRING_INDEX(t.ticket_number, '-', -1) AS UNSIGNED) ASC`,
    [clientId, month],
  );

  const hardwareMarkup = 1 + Number(process.env.HARDWARE_MARKUP_PCT ?? 30) / 100;

  for (const ticket of tickets) {
    const label =
      CATEGORY_LABELS[ticket.category as keyof typeof CATEGORY_LABELS] ?? ticket.category;
    const subject = ticket.description
      ? `${ticket.ticket_number}: ${ticket.subject}\n${ticket.description}`
      : `${ticket.ticket_number}: ${ticket.subject}`;

    if (ticket.category === "HARDWARE") {
      // Hardware: customer pays qty × unit_sell_price per row. unit_sell_price
      // is captured at log time. NULL means "legacy row logged before this
      // feature shipped" — fall back to cost × env markup so old invoices
      // still bill correctly.
      const [logs]: any = await pool.execute(
        `SELECT qty, unit_price, unit_sell_price FROM work_logs
         WHERE ticket_id = ?
         AND DATE_FORMAT(worked_date, '%Y-%m') = ?`,
        [ticket.id, month],
      );

      const totalQty = logs.reduce((sum: number, l: any) => sum + Number(l.qty), 0);
      const totalAmount = logs.reduce((sum: number, l: any) => {
        const sellPerUnit =
          l.unit_sell_price != null
            ? Number(l.unit_sell_price)
            : Number(l.unit_price) * hardwareMarkup;
        return sum + Number(l.qty) * sellPerUnit;
      }, 0);

      items.push({
        type: "TICKET",
        reference_id: ticket.id,
        category: label,
        subject,
        qty: totalQty,
        unit_price: null,
        rate: null,
        amount: Number(totalAmount.toFixed(2)),
        is_hardware: true,
      });
    } else if (ticket.category === "MEDIA_DIGITIZATION") {
      // One line per work log so each (qty × unit_price × media type) row is
      // visible on the invoice. No markup.
      const [logs]: any = await pool.execute(
        `SELECT id, qty, unit_price, description FROM work_logs
         WHERE ticket_id = ?
         AND DATE_FORMAT(worked_date, '%Y-%m') = ?
         ORDER BY id ASC`,
        [ticket.id, month],
      );

      for (const log of logs) {
        const qty = Number(log.qty);
        const unit = Number(log.unit_price);
        const detail = log.description?.trim() ? ` — ${log.description.trim()}` : "";
        items.push({
          type: "TICKET",
          reference_id: ticket.id,
          category: label,
          subject: `${ticket.ticket_number}: ${ticket.subject}${detail}`,
          qty,
          unit_price: unit,
          rate: unit,
          amount: Number((qty * unit).toFixed(2)),
          is_hardware: true, // share HARDWARE's "qty × unit" display path in the PDF
        });
      }
    } else {
      const rate = await getRateForCategory(clientId, ticket.category);
      const qty = Number(ticket.total_qty);
      items.push({
        type: "TICKET",
        reference_id: ticket.id,
        category: label,
        subject,
        qty,
        unit_price: null,
        rate,
        amount: qty * rate,
        is_hardware: false,
      });
    }
  }

  const meetings = await getMeetingsForInvoice(clientId, month);

  for (const meeting of meetings) {
    const rate = await getRateForCategory(clientId, "MEETING");
    const qty = Number(meeting.hours);
    const meetingDateStr = new Date(meeting.meeting_date).toISOString().substring(0, 10);
    const timeRange =
      meeting.start_time && meeting.end_time
        ? `${meetingDateStr} ${meeting.start_time} - ${meeting.end_time}`
        : meetingDateStr;

    items.push({
      type: "MEETING",
      reference_id: meeting.id,
      category: "Meeting",
      subject: `${meeting.description}\n${timeRange}`,
      qty,
      unit_price: null,
      rate,
      amount: qty * rate,
      is_hardware: false,
    });
  }

  return items;
};

const generatePDF = (
  invoiceId: number,
  client: any,
  lineItems: any[],
  meta: {
    invoiceNumber: string;
    invoiceDate: Date;
    dueDate: Date;
    totalHours: number;
    totalAmount: number;
  },
): Promise<string> => {
  const outputDir = process.env.INVOICE_PDF_DIR ?? "/tmp/noble-msp/invoices";
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const filepath = path.join(outputDir, `${meta.invoiceNumber}.pdf`);

  return new Promise((resolve, reject) => {
    // autoFirstPage false so we control page size and margins fully
    const doc = new PDFDocument({ margin: 50, size: "A4", autoFirstPage: true, bufferPages: true });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    const BLUE = "#4a5fa5";
    const LBLUE = "#c5cce8";
    const GRAY = "#888888";
    const LGRAY = "#cccccc";
    const BLACK = "#1a1a1a";
    const WHITE = "#ffffff";
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const margin = 50;
    const contentW = pageW - margin * 2;

    // ── Header — 3/4 blue | 1/4 light blue ──────────────────────────────────
    const splitX = pageW * 0.72;
    const lightW = pageW - splitX;
    const lightStartX = splitX;

    doc.rect(0, 0, splitX, 100).fill(BLUE);
    doc.rect(splitX, 0, lightW, 100).fill(LBLUE);

    // INVOICE label on the left
    doc.fillColor(WHITE).fontSize(28).font("Helvetica-Bold").text("INVOICE", margin, 35);

    // Amount Due — centered within the light blue section
    doc
      .fillColor(GRAY)
      .fontSize(10)
      .font("Helvetica")
      .text("Amount Due (USD)", lightStartX, 25, { width: lightW, align: "center" });
    doc
      .fillColor(BLACK)
      .fontSize(22)
      .font("Helvetica-Bold")
      .text(`$${meta.totalAmount.toFixed(2)}`, lightStartX, 48, { width: lightW, align: "center" });

    // ── Noble IT info ────────────────────────────────────────────────────────
    // doc
    //   .fillColor(BLACK)
    //   .fontSize(9)
    //   .font("Helvetica")
    //   .text(process.env.NOBLE_IT_NAME ?? "Noble IT", margin, 115)
    //   .text(process.env.NOBLE_IT_ADDRESS ?? "", margin, 128)
    //   .text(process.env.NOBLE_IT_PHONE ?? "", margin, 141)
    //   .text(process.env.NOBLE_IT_EMAIL ?? "", margin, 154);

    // ── Bill To ──────────────────────────────────────────────────────────────
    doc.fillColor(GRAY).fontSize(8).text("BILL TO", margin, 120);
    doc.fillColor(BLACK).fontSize(10).font("Helvetica-Bold").text(client.name, margin, 133);
    doc
      .font("Helvetica")
      .fontSize(9)
      .text(client.contact_name ?? "", margin, 146)
      .text(client.phone ?? "", margin, 159)
      .text(client.email ?? "", margin, 172);

    // ── Invoice metadata (right column) ──────────────────────────────────────
    const metaX = pageW * 0.55;
    const valX = metaX + 115;
    const formatDate = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    doc
      .fillColor(GRAY)
      .fontSize(9)
      .font("Helvetica")
      .text("Invoice Number:", metaX, 120)
      .text("Invoice Date:", metaX, 135)
      .text("Payment Due:", metaX, 150)
      .text("Amount Due (USD):", metaX, 165);

    doc
      .fillColor(BLACK)
      .text(meta.invoiceNumber, valX, 120)
      .text(formatDate(meta.invoiceDate), valX, 135)
      .text(formatDate(meta.dueDate), valX, 150)
      .text(`$${meta.totalAmount.toFixed(2)}`, valX, 165);

    // ── Column layout constants ─────────────────────────────────────────────────
    const colAmountW = 65;
    const colAmountX = pageW - margin - colAmountW;
    const colHoursW = 50;
    const colHoursX = colAmountX - colHoursW - 10;
    const colLabelX = margin + 5;
    const colLabelW = 110; // category column width
    const colDescX = colLabelX + colLabelW + 5; // description column start
    const colServW = colHoursX - colDescX - 10;

    // ── Line items table ──────────────────────────────────────────────────────
    const tableY = 200;
    doc.rect(margin, tableY, contentW, 18).fill("#f0f2f8");
    doc.fillColor(GRAY).fontSize(8);
    doc
      .fillColor(GRAY)
      .fontSize(8)
      .font("Helvetica")
      .text("CATEGORY", colLabelX, tableY + 5)
      .text("DESCRIPTION", colDescX, tableY + 5)
      .text("QTY / HRS", colHoursX, tableY + 5, { width: colHoursW, align: "right" })
      .text("AMOUNT", colAmountX, tableY + 5, { width: colAmountW, align: "right" });

    let y = tableY + 25;

    const FOOTER_HEIGHT = 100;
    const TOTALS_HEIGHT = 60;
    const safeBottom = pageH - FOOTER_HEIGHT - TOTALS_HEIGHT;

    lineItems.forEach((item) => {
      const summaryLines = item.subject.split("\n");
      const itemHeight = 13 + summaryLines.length * 12 + 16;

      if (y + itemHeight > safeBottom) {
        doc.addPage();
        y = 50;
      }

      const rowTop = y;

      // Category column
      doc
        .fillColor(BLACK)
        .fontSize(9)
        .font("Helvetica-Bold")
        .text(item.category, colLabelX, rowTop, { width: colLabelW });

      // Description column — ticket number + subject
      summaryLines.forEach((line: string, idx: number) => {
        doc
          .fillColor(BLACK)
          .fontSize(8)
          .font("Helvetica")
          .text(line, colDescX, rowTop + idx * 12, { width: colServW });
      });

      y += Math.max(13, summaryLines.length * 12) + 6;
      doc
        .fillColor(BLACK)
        .fontSize(9)
        .text(`$${item.amount.toFixed(2)}`, colAmountX, rowTop, {
          width: colAmountW,
          align: "right",
        });
      // Hardware shows plain qty, services show qty with 'h' suffix, and
      // adjustments leave the hours/qty cell blank (it's a flat dollar value).
      const qtyLabel =
        item.type === "ADJUSTMENT"
          ? ""
          : item.is_hardware
            ? String(item.qty)
            : `${item.qty}h`;
      doc.text(qtyLabel, colHoursX, rowTop, { width: colHoursW, align: "right" });

      doc
        .moveTo(margin, y + 4)
        .lineTo(margin + contentW, y + 4)
        .strokeColor("#e8e8e8")
        .lineWidth(0.5)
        .stroke();

      y += 16;
    });

    // ── Totals ────────────────────────────────────────────────────────────────
    const totLabelW = colHoursW + colHoursX - (colAmountX - colHoursW - 80);
    const totLabelX = colAmountX - 120;

    y += 12;
    doc
      .fillColor(GRAY)
      .fontSize(9)
      .font("Helvetica")
      .text("Total:", totLabelX, y, { width: 110, align: "right" });
    doc
      .fillColor(BLACK)
      .font("Helvetica-Bold")
      .text(`$${meta.totalAmount.toFixed(2)}`, colAmountX, y, {
        width: colAmountW,
        align: "right",
      });

    doc
      .moveTo(totLabelX, y + 16)
      .lineTo(pageW - margin, y + 16)
      .strokeColor(LGRAY)
      .lineWidth(0.5)
      .stroke();

    y += 36;
    doc
      .fillColor(GRAY)
      .fontSize(9)
      .font("Helvetica")
      .text("Amount Due (USD):", totLabelX, y, { width: 110, align: "right" });
    doc
      .fillColor(BLACK)
      .fontSize(11)
      .font("Helvetica-Bold")
      .text(`$${meta.totalAmount.toFixed(2)}`, colAmountX, y, {
        width: colAmountW,
        align: "right",
      });

    // ── Footer — three column layout ─────────────────────────────────────
    const footerY = pageH - 90;
    const logoPath = process.env.NOBLE_IT_LOGO;
    const logoExists = logoPath && fs.existsSync(logoPath);
    const colW = contentW / 3;

    doc
      .moveTo(margin, footerY)
      .lineTo(pageW - margin, footerY)
      .strokeColor("#e8e8e8")
      .lineWidth(0.5)
      .stroke();

    // Left col — logo
    if (logoExists) {
      doc.image(logoPath!, margin, footerY + 10, { height: 22, fit: [82, 22] });
    } else {
      doc
        .fillColor(BLACK)
        .fontSize(10)
        .font("Helvetica-Bold")
        .text(process.env.NOBLE_IT_NAME ?? "Noble IT", margin, footerY + 16);
    }

    // Middle col — mailing address
    // Middle col — mailing address
    const midX = margin + colW + 20;
    doc
      .fillColor(GRAY)
      .fontSize(8)
      .font("Helvetica")
      .text("3654 Thornton Avenue #1065", midX, footerY + 10, { width: colW, align: "center" })
      .text("Fremont, CA 94536", midX, footerY + 21, { width: colW, align: "center" });

    // Right col — phone and billing email
    // Right col — phone and billing email
    const rightX = margin + colW * 2;
    doc
      .fillColor(GRAY)
      .fontSize(8)
      .font("Helvetica")
      .text(process.env.NOBLE_IT_PHONE ?? "510-214-3657", rightX, footerY + 10, {
        width: colW,
        align: "right",
      });
    doc
      .fillColor(GRAY)
      .fontSize(8)
      .font("Helvetica")
      .text(process.env.NOBLE_IT_BILLING_EMAIL ?? "billing@nobleit.co", rightX, footerY + 22, {
        width: colW,
        align: "right",
      });
    doc.end();
    stream.on("finish", () => resolve(filepath));
    stream.on("error", reject);
  });
};

const buildTransporter = () =>
  createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

const sendApprovalEmail = async (
  invoiceId: number,
  client: any,
  lineItems: any[],
  meta: {
    invoiceNumber: string;
    invoiceDate: Date;
    dueDate: Date;
    totalHours: number;
    totalAmount: number;
    pdfPath: string;
  },
) => {
  const transporter = buildTransporter();
  const apiBase = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3100}`;

  const lineItemsHtml = lineItems
    .map(
      (item) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">
        <strong>${item.category}</strong><br/>
        <span style="color:#666;font-size:13px;">${item.subject.replace("\n", "<br/>")}</span>
      </td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${
        item.type === "ADJUSTMENT" ? "" : item.is_hardware ? item.qty : item.qty + "h"
      }</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">$${item.amount.toFixed(2)}</td>
    </tr>
  `,
    )
    .join("");

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#4a5fa5;color:white;padding:24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">Invoice Approval Required</h2>
        <p style="margin:4px 0 0;opacity:0.8;">${meta.invoiceNumber} · ${client.name}</p>
      </div>
      <div style="background:#f9f9f9;padding:24px;border:1px solid #eee;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#f0f2f8;">
              <th style="padding:8px;text-align:left;font-size:12px;color:#888;">SERVICES</th>
              <th style="padding:8px;text-align:center;font-size:12px;color:#888;">HOURS</th>
              <th style="padding:8px;text-align:right;font-size:12px;color:#888;">AMOUNT</th>
            </tr>
          </thead>
          <tbody>${lineItemsHtml}</tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding:12px 8px;text-align:right;font-weight:bold;">Total:</td>
              <td style="padding:12px 8px;text-align:right;font-weight:bold;font-size:16px;">
                $${meta.totalAmount.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
        <div style="margin-top:24px;text-align:center;">
          <a href="${apiBase}/api/invoices/${invoiceId}/save"
             style="background:#4a5fa5;color:white;padding:12px 32px;border-radius:6px;
                    text-decoration:none;font-weight:bold;display:inline-block;">
            💾 Save Invoice
          </a>
        </div>
        <p style="text-align:center;color:#888;font-size:12px;margin-top:12px;">
          Clicking Save uploads this invoice to S3 and archives the local copy.
          The PDF is attached for your review.
        </p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"Noble IT" <${process.env.SMTP_USER}>`,
    to: process.env.APPROVAL_EMAIL,
    subject: `[APPROVAL NEEDED] Invoice ${meta.invoiceNumber} · ${client.name}`,
    html,
    attachments: [{ filename: `${meta.invoiceNumber}.pdf`, path: meta.pdfPath }],
  });
};
