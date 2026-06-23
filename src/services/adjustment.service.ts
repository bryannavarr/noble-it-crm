// Adjustments are a first-class entity: discounts/credits/surcharges that
// belong to a client and get attached to an invoice at generation time.
// They become invoice_line_items of type 'ADJUSTMENT' once attached.
//
// invoice_id NULL  → pending (next generate for this client picks it up)
// invoice_id set   → attached to that invoice (already billed)

import { PoolConnection } from "mysql2/promise";
import pool from "../db/pool";

export interface Adjustment {
  id: number;
  client_id: number;
  amount: number;
  label: string;
  invoice_id: number | null;
  created_at: Date;
  updated_at: Date;
}

const sanitize = (amount: number, label: string) => {
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error("amount must be a non-zero number");
  }
  const trimmed = String(label ?? "").trim();
  if (!trimmed) throw new Error("label is required");
  return { amount: Number(amount.toFixed(2)), label: trimmed };
};

export const addPending = async (
  clientId: number,
  amount: number,
  label: string,
): Promise<Adjustment> => {
  const clean = sanitize(amount, label);
  const [result]: any = await pool.execute(
    `INSERT INTO adjustments (client_id, amount, label, invoice_id)
     VALUES (?, ?, ?, NULL)`,
    [clientId, clean.amount, clean.label],
  );
  const [rows]: any = await pool.execute(
    `SELECT * FROM adjustments WHERE id = ?`,
    [result.insertId],
  );
  return rows[0];
};

// Creates an adjustment already attached to a specific invoice — used by the
// post-generation /adjust path.
export const addAttached = async (
  clientId: number,
  invoiceId: number,
  amount: number,
  label: string,
  conn?: PoolConnection,
): Promise<Adjustment> => {
  const clean = sanitize(amount, label);
  const executor = conn ?? pool;
  const [result]: any = await executor.execute(
    `INSERT INTO adjustments (client_id, amount, label, invoice_id)
     VALUES (?, ?, ?, ?)`,
    [clientId, clean.amount, clean.label, invoiceId],
  );
  const [rows]: any = await executor.execute(
    `SELECT * FROM adjustments WHERE id = ?`,
    [result.insertId],
  );
  return rows[0];
};

// All pending adjustments for a client (invoice_id IS NULL).
export const listPendingForClient = async (
  clientId: number,
  conn?: PoolConnection,
): Promise<Adjustment[]> => {
  const executor = conn ?? pool;
  const [rows]: any = await executor.execute(
    `SELECT * FROM adjustments
     WHERE client_id = ? AND invoice_id IS NULL
     ORDER BY id ASC`,
    [clientId],
  );
  return rows;
};

// All adjustments for a client (pending and historical).
export const listAllForClient = async (clientId: number): Promise<Adjustment[]> => {
  const [rows]: any = await pool.execute(
    `SELECT * FROM adjustments
     WHERE client_id = ?
     ORDER BY id DESC`,
    [clientId],
  );
  return rows;
};

// Refuses if the row is already attached to an invoice. Pending only.
export const removeIfPending = async (id: number): Promise<void> => {
  const [rows]: any = await pool.execute(`SELECT invoice_id FROM adjustments WHERE id = ?`, [id]);
  if (!rows.length) throw new Error("Adjustment not found");
  if (rows[0].invoice_id !== null) {
    throw new Error("Cannot remove an adjustment that's already attached to an invoice");
  }
  await pool.execute(`DELETE FROM adjustments WHERE id = ?`, [id]);
};

// Marks all pending adjustments for a client as attached to the given invoice.
// Called inside generateInvoice's transaction so the attach is atomic with
// the line-item inserts.
export const attachPendingToInvoice = async (
  clientId: number,
  invoiceId: number,
  conn: PoolConnection,
): Promise<Adjustment[]> => {
  const [pending]: any = await conn.execute(
    `SELECT * FROM adjustments
     WHERE client_id = ? AND invoice_id IS NULL
     ORDER BY id ASC`,
    [clientId],
  );
  if (pending.length) {
    await conn.execute(
      `UPDATE adjustments SET invoice_id = ?
       WHERE client_id = ? AND invoice_id IS NULL`,
      [invoiceId, clientId],
    );
  }
  return pending;
};
