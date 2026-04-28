import pool from "../db/pool";
import {
  CreateTicketPayload,
  UpdateTicketPayload,
  LogTimePayload,
  CreateCommentPayload,
} from "../types";

// ── Ticket number ─────────────────────────────────────────────────────────────

const getNextTicketNumber = async (clientId: number): Promise<string> => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [rows]: any = await conn.execute(
      "SELECT last_number FROM client_ticket_sequences WHERE client_id = ? FOR UPDATE",
      [clientId],
    );

    if (!rows.length) {
      throw new Error(`No ticket sequence found for client ${clientId}`);
    }

    const nextNumber = rows[0].last_number + 1;

    await conn.execute("UPDATE client_ticket_sequences SET last_number = ? WHERE client_id = ?", [
      nextNumber,
      clientId,
    ]);

    const [clientRows]: any = await conn.execute(
      "SELECT invoice_prefix FROM clients WHERE id = ?",
      [clientId],
    );

    await conn.commit();

    const { invoice_prefix } = clientRows[0];
    return `${invoice_prefix}-${nextNumber}`;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ── Tickets ───────────────────────────────────────────────────────────────────

export const createTickets = async (payload: CreateTicketPayload | CreateTicketPayload[]) => {
  const tickets = Array.isArray(payload) ? payload : [payload];

  const results = await Promise.all(
    tickets.map(async ({ client_id, subject, description, category, priority = "MEDIUM" }) => {
      const ticketNumber = await getNextTicketNumber(client_id);

      const [result]: any = await pool.execute(
        `INSERT INTO tickets
  (ticket_number, client_id, subject, description, category, priority, status)
 VALUES (?, ?, ?, ?, ?, ?, 'IN_PROGRESS')`,
        [ticketNumber, client_id, subject, description ?? null, category, priority],
      );

      return getTicketById(result.insertId);
    }),
  );

  return results;
};

export const listTickets = async (filters: {
  client_id?: number;
  client_name?: string;
  status?: string;
  category?: string;
  priority?: string;
}) => {
  const conditions: string[] = ["1=1"];
  const params: any[] = [];

  if (filters.client_id) {
    conditions.push("t.client_id = ?");
    params.push(filters.client_id);
  }
  if (filters.client_name) {
    conditions.push("c.name LIKE ?");
    params.push(`%${filters.client_name}%`);
  }
  if (filters.status) {
    conditions.push("t.status = ?");
    params.push(filters.status);
  }
  if (filters.category) {
    conditions.push("t.category = ?");
    params.push(filters.category);
  }
  if (filters.priority) {
    conditions.push("t.priority = ?");
    params.push(filters.priority);
  }

  const [rows] = await pool.execute(
    `SELECT t.*,
          c.name           AS client_name,
          c.invoice_prefix,
          (SELECT COALESCE(SUM(wl.qty), 0) FROM work_logs wl WHERE wl.ticket_id = t.id) AS total_hours_logged
   FROM tickets t
   JOIN clients c ON t.client_id = c.id
   WHERE ${conditions.join(" AND ")}
ORDER BY CAST(SUBSTRING_INDEX(t.ticket_number, '-', -1) AS UNSIGNED) ASC`,
    params,
  );
  return rows;
};

export const getTicketById = async (id: number) => {
  const [rows]: any = await pool.execute(
    `SELECT t.*,
          c.name           AS client_name,
          c.invoice_prefix,
          c.default_rate,
          (SELECT COALESCE(SUM(wl.qty), 0) FROM work_logs wl WHERE wl.ticket_id = t.id) AS total_hours_logged
   FROM tickets t
   JOIN clients c ON t.client_id = c.id
   WHERE t.id = ?`,
    [id],
  );
  return rows[0] ?? null;
};

export const getTicketByNumber = async (ticketNumber: string) => {
  const [rows]: any = await pool.execute(
    `SELECT t.*,
          c.name           AS client_name,
          c.invoice_prefix,
          c.default_rate,
          (SELECT COALESCE(SUM(wl.qty), 0) FROM work_logs wl WHERE wl.ticket_id = t.id) AS total_hours_logged
   FROM tickets t
   JOIN clients c ON t.client_id = c.id
   WHERE t.ticket_number = ?`,
    [ticketNumber.toUpperCase()],
  );
  return rows[0] ?? null;
};

export const updateTicket = async (id: number, updates: UpdateTicketPayload) => {
  const fields: string[] = [];
  const params: any[] = [];

  if (updates.subject !== undefined) {
    fields.push("subject = ?");
    params.push(updates.subject);
  }
  if (updates.description !== undefined) {
    fields.push("description = ?");
    params.push(updates.description);
  }
  if (updates.category !== undefined) {
    fields.push("category = ?");
    params.push(updates.category);
  }
  if (updates.priority !== undefined) {
    fields.push("priority = ?");
    params.push(updates.priority);
  }
  if (updates.status !== undefined) {
    fields.push("status = ?");
    params.push(updates.status);
  }

  if (!fields.length) throw new Error("No fields to update");

  await pool.execute(`UPDATE tickets SET ${fields.join(", ")} WHERE id = ?`, [...params, id]);

  return getTicketById(id);
};

export const deleteTicket = async (id: number) => {
  await pool.execute("DELETE FROM comments  WHERE ticket_id = ?", [id]);
  await pool.execute("DELETE FROM work_logs WHERE ticket_id = ?", [id]);
  await pool.execute("DELETE FROM tickets   WHERE id = ?", [id]);
};

// ── Work logs ─────────────────────────────────────────────────────────────────

export const logTime = async (ticketId: number, payload: LogTimePayload) => {
  const { qty, unit_price, description, worked_date } = payload;

  const ticket: any = await getTicketById(ticketId);
  if (!ticket) throw new Error("Ticket not found");

  // Hardware tickets require a unit_price
  if (ticket.category === "HARDWARE" && !unit_price) {
    throw new Error("unit_price is required for HARDWARE tickets");
  }

  const [result]: any = await pool.execute(
    `INSERT INTO work_logs (ticket_id, client_id, qty, unit_price, description, worked_date)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [ticketId, ticket.client_id, qty, unit_price ?? null, description ?? null, worked_date],
  );

  const [rows]: any = await pool.execute("SELECT * FROM work_logs WHERE id = ?", [result.insertId]);

  return rows[0];
};

export const getWorkLogs = async (ticketId: number) => {
  const [rows] = await pool.execute(
    "SELECT * FROM work_logs WHERE ticket_id = ? ORDER BY worked_date ASC, created_at ASC",
    [ticketId],
  );
  return rows;
};

export const updateWorkLog = async (
  ticketId: number,
  logId: number,
  updates: Partial<LogTimePayload>,
) => {
  const fields: string[] = [];
  const params: any[] = [];

  if (updates.qty !== undefined) {
    fields.push("qty = ?");
    params.push(updates.qty);
  }
  if (updates.unit_price !== undefined) {
    fields.push("unit_price = ?");
    params.push(updates.unit_price);
  }
  if (updates.description !== undefined) {
    fields.push("description = ?");
    params.push(updates.description);
  }
  if (updates.worked_date !== undefined) {
    fields.push("worked_date = ?");
    params.push(updates.worked_date);
  }

  if (!fields.length) throw new Error("No fields to update");

  await pool.execute(`UPDATE work_logs SET ${fields.join(", ")} WHERE id = ? AND ticket_id = ?`, [
    ...params,
    logId,
    ticketId,
  ]);

  const [rows]: any = await pool.execute("SELECT * FROM work_logs WHERE id = ?", [logId]);

  return rows[0];
};

export const deleteWorkLog = async (ticketId: number, logId: number) => {
  await pool.execute("DELETE FROM work_logs WHERE id = ? AND ticket_id = ?", [logId, ticketId]);
};

// ── Comments ──────────────────────────────────────────────────────────────────

export const addComment = async (ticketId: number, payload: CreateCommentPayload) => {
  const ticket = await getTicketById(ticketId);
  if (!ticket) throw new Error("Ticket not found");

  const [result]: any = await pool.execute("INSERT INTO comments (ticket_id, body) VALUES (?, ?)", [
    ticketId,
    payload.body,
  ]);

  const [rows]: any = await pool.execute("SELECT * FROM comments WHERE id = ?", [result.insertId]);

  return rows[0];
};

export const getComments = async (ticketId: number) => {
  const [rows] = await pool.execute(
    "SELECT * FROM comments WHERE ticket_id = ? ORDER BY created_at ASC",
    [ticketId],
  );
  return rows;
};

export const updateComment = async (ticketId: number, commentId: number, body: string) => {
  await pool.execute("UPDATE comments SET body = ? WHERE id = ? AND ticket_id = ?", [
    body,
    commentId,
    ticketId,
  ]);

  const [rows]: any = await pool.execute("SELECT * FROM comments WHERE id = ?", [commentId]);

  return rows[0];
};

export const deleteComment = async (ticketId: number, commentId: number) => {
  await pool.execute("DELETE FROM comments WHERE id = ? AND ticket_id = ?", [commentId, ticketId]);
};
