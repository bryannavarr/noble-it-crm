import { createTransport } from "nodemailer";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import pool from "../db/pool";
import { CATEGORY_LABELS } from "../types";
import { getClientById, getNextInvoiceNumber, getRateForCategory } from "./client.service";
import { getMeetingsForInvoice } from "./meeting.service";

// ── Preview ───────────────────────────────────────────────────────────────────

export const previewInvoice = async (clientId: number, month: string) => {
  const client: any = await getClientById(clientId);
  if (!client) throw new Error("Client not found");

  const lineItems = await buildLineItems(clientId, month);
  const totalHours = lineItems.reduce((sum, item) => sum + Number(item.qty), 0);
  const totalAmount = lineItems.reduce((sum, item) => sum + Number(item.amount), 0);

  return {
    client,
    month,
    line_items: lineItems,
    total_hours: totalHours,
    total_amount: totalAmount,
    invoice_number_preview: await getNextInvoiceNumber(clientId),
  };
};

// ── Generate ──────────────────────────────────────────────────────────────────

export const generateInvoice = async (clientId: number, month: string) => {
  const client: any = await getClientById(clientId);
  if (!client) throw new Error("Client not found");

  const lineItems = await buildLineItems(clientId, month);
  if (!lineItems.length) throw new Error("No billable items found for this period");

  const totalHours = lineItems.reduce((sum, item) => sum + Number(item.qty), 0);
  const totalAmount = lineItems.reduce((sum, item) => sum + Number(item.amount), 0);

  const invoiceNumber = await getNextInvoiceNumber(clientId);
  const invoiceDate = new Date();
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + Number(process.env.PAYMENT_DUE_DAYS ?? 30));

  const [result]: any = await pool.execute(
    `INSERT INTO invoices
      (client_id, invoice_number, invoice_date, due_date, total_hours, total_amount, status)
     VALUES (?, ?, ?, ?, ?, ?, 'DRAFT')`,
    [
      clientId,
      invoiceNumber,
      invoiceDate.toISOString().split("T")[0],
      dueDate.toISOString().split("T")[0],
      totalHours,
      totalAmount,
    ],
  );

  const invoiceId = result.insertId;

  // Insert line items
  await Promise.all(
    lineItems.map((item) =>
      pool.execute(
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
      ),
    ),
  );

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

export const approveInvoice = async (id: number) => {
  await pool.execute(`UPDATE invoices SET status = 'APPROVED' WHERE id = ?`, [id]);
  return getInvoiceById(id);
};

export const sendInvoice = async (id: number) => {
  const invoice: any = await getInvoiceById(id);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "APPROVED") throw new Error("Invoice must be approved before sending");
  if (!invoice.pdf_path) throw new Error("No PDF found for this invoice");

  const transporter = buildTransporter();

  await transporter.sendMail({
    from: `"Noble IT" <${process.env.SMTP_USER}>`,
    to: invoice.client_email,
    subject: `Invoice ${invoice.invoice_number} from Noble IT`,
    html: buildClientEmailHtml(invoice),
    attachments: [{ filename: `${invoice.invoice_number}.pdf`, path: invoice.pdf_path }],
  });

  await pool.execute(`UPDATE invoices SET status = 'SENT', sent_at = NOW() WHERE id = ?`, [id]);
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const buildLineItems = async (clientId: number, month: string) => {
  const items: any[] = [];

  const [tickets]: any = await pool.execute(
    `SELECT t.id, t.ticket_number, t.category, t.subject,
            SUM(wl.qty) AS total_qty
     FROM tickets t
     JOIN work_logs wl ON wl.ticket_id = t.id
     WHERE t.client_id = ?
     AND DATE_FORMAT(wl.worked_date, '%Y-%m') = ?
     GROUP BY t.id
     HAVING total_qty > 0
     ORDER BY CAST(SUBSTRING_INDEX(t.ticket_number, '-', -1) AS UNSIGNED) ASC`,
    [clientId, month],
  );

  const hardwareMarkup = 1 + Number(process.env.HARDWARE_MARKUP_PCT ?? 30) / 100;

  for (const ticket of tickets) {
    const label =
      CATEGORY_LABELS[ticket.category as keyof typeof CATEGORY_LABELS] ?? ticket.category;
    const subject = `${ticket.ticket_number}: ${ticket.subject}`;

    if (ticket.category === "HARDWARE") {
      // Hardware: sum qty × unit_price × markup per work log entry
      const [logs]: any = await pool.execute(
        `SELECT qty, unit_price FROM work_logs
         WHERE ticket_id = ?
         AND DATE_FORMAT(worked_date, '%Y-%m') = ?`,
        [ticket.id, month],
      );

      const totalQty = logs.reduce((sum: number, l: any) => sum + Number(l.qty), 0);
      const totalCost = logs.reduce(
        (sum: number, l: any) => sum + Number(l.qty) * Number(l.unit_price),
        0,
      );
      const totalAmount = totalCost * hardwareMarkup;

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
    doc
      .fillColor(BLACK)
      .fontSize(9)
      .font("Helvetica")
      .text(process.env.NOBLE_IT_NAME ?? "Noble IT", margin, 115)
      .text(process.env.NOBLE_IT_ADDRESS ?? "", margin, 128)
      .text(process.env.NOBLE_IT_PHONE ?? "", margin, 141)
      .text(process.env.NOBLE_IT_EMAIL ?? "", margin, 154);

    // ── Bill To ──────────────────────────────────────────────────────────────
    doc.fillColor(GRAY).fontSize(8).text("BILL TO", margin, 190);
    doc.fillColor(BLACK).fontSize(10).font("Helvetica-Bold").text(client.name, margin, 203);
    doc
      .font("Helvetica")
      .fontSize(9)
      .text(client.contact_name ?? "", margin, 216)
      .text(client.phone ?? "", margin, 229)
      .text(client.email ?? "", margin, 242);

    // ── Invoice metadata (right column) ──────────────────────────────────────
    const metaX = pageW * 0.55;
    const valX = metaX + 115;
    const formatDate = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    doc
      .fillColor(GRAY)
      .fontSize(9)
      .font("Helvetica")
      .text("Invoice Number:", metaX, 190)
      .text("Invoice Date:", metaX, 205)
      .text("Payment Due:", metaX, 220)
      .text("Amount Due (USD):", metaX, 235);

    doc
      .fillColor(BLACK)
      .text(meta.invoiceNumber, valX, 190)
      .text(formatDate(meta.invoiceDate), valX, 205)
      .text(formatDate(meta.dueDate), valX, 220)
      .text(`$${meta.totalAmount.toFixed(2)}`, valX, 235);

    // ── Column layout constants ─────────────────────────────────────────────────
    const colAmountW = 65;
    const colAmountX = pageW - margin - colAmountW;
    const colHoursW = 50;
    const colHoursX = colAmountX - colHoursW - 10;
    const colLabelX = margin + 5;
    const colServW = colHoursX - colLabelX - 10;

    // ── Line items table ──────────────────────────────────────────────────────
    const tableY = 280;
    doc.rect(margin, tableY, contentW, 18).fill("#f0f2f8");
    doc
      .fillColor(GRAY)
      .fontSize(8)
      .font("Helvetica")
      .text("SERVICES", colLabelX, tableY + 5)
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

      doc.fillColor(BLACK).fontSize(9).font("Helvetica-Bold").text(item.category, colLabelX, y);
      y += 13;

      summaryLines.forEach((line: string) => {
        doc
          .fillColor(BLACK)
          .fontSize(8)
          .font("Helvetica")
          .text(line, colLabelX, y, { width: colServW });
        y += 12;
      });

      const rowTop = y - (12 * summaryLines.length + 13);
      doc
        .fillColor(BLACK)
        .fontSize(9)
        .text(`$${item.amount.toFixed(2)}`, colAmountX, rowTop, {
          width: colAmountW,
          align: "right",
        });
      // Hardware shows plain qty, services show qty with 'h' suffix
      const qtyLabel = item.is_hardware ? String(item.qty) : `${item.qty}h`;
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

    // ── Footer — logo only, no address text to avoid page overflow ────────
    const footerY = pageH - 80;
    const logoPath = process.env.NOBLE_IT_LOGO;
    const logoExists = logoPath && fs.existsSync(logoPath);

    doc
      .moveTo(margin, footerY)
      .lineTo(pageW - margin, footerY)
      .strokeColor("#e8e8e8")
      .lineWidth(0.5)
      .stroke();

    if (logoExists) {
      doc.image(logoPath!, margin, footerY + 10, { height: 22, fit: [82, 22] });
    } else {
      doc
        .fillColor(BLACK)
        .fontSize(10)
        .font("Helvetica-Bold")
        .text(process.env.NOBLE_IT_NAME ?? "Noble IT", margin, footerY + 18);
    }

    // Billing contact — right justified, does not overlap logo on the left
    const billingEmail = process.env.NOBLE_IT_BILLING_EMAIL ?? process.env.NOBLE_IT_EMAIL ?? "";
    if (billingEmail) {
      doc
        .fillColor(GRAY)
        .fontSize(8)
        .font("Helvetica")
        .text(`For billing inquiries, please contact ${billingEmail}`, margin, footerY + 20, {
          width: contentW,
          align: "right",
        });
    }

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
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.is_hardware ? item.qty : item.qty + "h"}</td>
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
          <a href="${apiBase}/api/invoices/${invoiceId}/approve"
             style="background:#4a5fa5;color:white;padding:12px 32px;border-radius:6px;
                    text-decoration:none;font-weight:bold;display:inline-block;">
            ✓ Approve &amp; Send to Client
          </a>
        </div>
        <p style="text-align:center;color:#888;font-size:12px;margin-top:12px;">
          PDF invoice is attached for your review.
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

const buildClientEmailHtml = (invoice: any): string => `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:#4a5fa5;color:white;padding:24px;border-radius:8px 8px 0 0;">
      <h2 style="margin:0;">Invoice from Noble IT</h2>
      <p style="margin:4px 0 0;opacity:0.8;">${invoice.invoice_number}</p>
    </div>
    <div style="padding:24px;border:1px solid #eee;">
      <p>Hi ${invoice.contact_name ?? invoice.client_name},</p>
      <p>Please find your invoice attached. A total of
         <strong>$${Number(invoice.total_amount).toFixed(2)}</strong>
         is due by <strong>${new Date(invoice.due_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</strong>.
      </p>
      <p style="color:#888;font-size:13px;">
        Questions? Reply to this email or call ${process.env.NOBLE_IT_PHONE ?? ""}.
      </p>
    </div>
  </div>
`;
