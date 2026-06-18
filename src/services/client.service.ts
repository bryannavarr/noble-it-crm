import pool from "../db/pool";

interface CreateClientData {
  name: string;
  contact_name?: string;
  email: string;
  phone?: string;
  invoice_prefix: string;
  default_rate: number;
  address?: string;
}

interface UpdateClientData {
  name?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  default_rate?: number;
  address?: string;
}

export const createClient = async (data: CreateClientData) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [result]: any = await conn.execute(
      `INSERT INTO clients (name, contact_name, email, phone, invoice_prefix, default_rate, address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.contact_name ?? null,
        data.email,
        data.phone ?? null,
        data.invoice_prefix.toUpperCase(),
        data.default_rate,
        data.address ?? null,
      ],
    );

    const { insertId } = result;

    await conn.execute(
      "INSERT INTO client_ticket_sequences (client_id, last_number) VALUES (?, 0)",
      [insertId],
    );

    await conn.commit();
    return getClientById(insertId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const listClients = async () => {
  const [rows] = await pool.execute("SELECT * FROM clients ORDER BY name ASC");
  return rows;
};

export const getClientById = async (id: number) => {
  const [rows]: any = await pool.execute("SELECT * FROM clients WHERE id = ?", [id]);
  return rows[0] ?? null;
};

export const getClientByPrefix = async (prefix: string) => {
  const [rows]: any = await pool.execute("SELECT * FROM clients WHERE invoice_prefix = ?", [
    prefix.toUpperCase(),
  ]);
  return rows[0] ?? null;
};

export const updateClient = async (id: number, updates: UpdateClientData) => {
  const fields: string[] = [];
  const params: any[] = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    params.push(updates.name);
  }
  if (updates.contact_name !== undefined) {
    fields.push("contact_name = ?");
    params.push(updates.contact_name);
  }
  if (updates.email !== undefined) {
    fields.push("email = ?");
    params.push(updates.email);
  }
  if (updates.phone !== undefined) {
    fields.push("phone = ?");
    params.push(updates.phone);
  }
  if (updates.default_rate !== undefined) {
    fields.push("default_rate = ?");
    params.push(updates.default_rate);
  }
  if (updates.address !== undefined) {
    fields.push("address = ?");
    params.push(updates.address);
  }

  if (!fields.length) throw new Error("No fields to update");

  await pool.execute(`UPDATE clients SET ${fields.join(", ")} WHERE id = ?`, [...params, id]);

  return getClientById(id);
};

export const getRateForCategory = async (clientId: number, category: string): Promise<number> => {
  // Check for category-specific override first
  const [rows]: any = await pool.execute(
    "SELECT rate FROM client_rates WHERE client_id = ? AND category = ?",
    [clientId, category],
  );

  if (rows.length) return Number(rows[0].rate);

  // Fall back to client default rate
  const client: any = await getClientById(clientId);
  if (!client) throw new Error("Client not found");
  return Number(client.default_rate);
};

export const getNextInvoiceNumber = async (clientId: number): Promise<string> => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [rows]: any = await conn.execute(
      "SELECT invoice_prefix, last_invoice_number FROM clients WHERE id = ? FOR UPDATE",
      [clientId],
    );

    if (!rows.length) throw new Error("Client not found");

    const { invoice_prefix, last_invoice_number } = rows[0];
    const nextNum = last_invoice_number + 1;

    await conn.execute("UPDATE clients SET last_invoice_number = ? WHERE id = ?", [
      nextNum,
      clientId,
    ]);

    await conn.commit();
    return `${invoice_prefix}-${nextNum}`;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const peekNextInvoiceNumber = async (clientId: number): Promise<string> => {
  const [rows]: any = await pool.execute(
    "SELECT invoice_prefix, last_invoice_number FROM clients WHERE id = ?",
    [clientId],
  );
  if (!rows.length) throw new Error("Client not found");
  const { invoice_prefix, last_invoice_number } = rows[0];
  return `${invoice_prefix}-${last_invoice_number + 1}`;
};

// Resets the per-client ticket number counter so the next ticket starts at 1.
// Used by `msp clean <client>` after a bulk delete so ticket numbers don't have
// gaps. Doesn't touch any existing tickets.
export const resetTicketSequence = async (clientId: number) => {
  const [rows]: any = await pool.execute(
    "SELECT id, invoice_prefix FROM clients WHERE id = ?",
    [clientId],
  );
  if (!rows.length) throw new Error("Client not found");

  await pool.execute(
    "UPDATE client_ticket_sequences SET last_number = 0 WHERE client_id = ?",
    [clientId],
  );
  return { client_id: clientId, invoice_prefix: rows[0].invoice_prefix, last_number: 0 };
};
