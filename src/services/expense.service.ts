import pool from '../db/pool';
import { CreateExpensePayload } from '../types';

export const createExpense = async (data: CreateExpensePayload) => {
  const {
    client_id,
    ticket_id,
    description,
    amount,
    markup_pct = 0,
    expense_date,
  } = data;

  const billable_amount = Number(amount) * (1 + Number(markup_pct) / 100);

  const [result]: any = await pool.execute(
    `INSERT INTO expenses
      (client_id, ticket_id, description, amount, markup_pct, billable_amount, expense_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      client_id,
      ticket_id ?? null,
      description,
      amount,
      markup_pct,
      billable_amount.toFixed(2),
      expense_date,
    ]
  );

  const [rows]: any = await pool.execute(
    'SELECT * FROM expenses WHERE id = ?',
    [result.insertId]
  );

  return rows[0];
};

export const listExpenses = async (filters: {
  client_id?: number;
  month?:     string;
  ticket_id?: number;
}) => {
  const conditions: string[] = ['1=1'];
  const params: any[]        = [];

  if (filters.client_id) {
    conditions.push('e.client_id = ?');
    params.push(filters.client_id);
  }
  if (filters.ticket_id) {
    conditions.push('e.ticket_id = ?');
    params.push(filters.ticket_id);
  }
  if (filters.month) {
    conditions.push('DATE_FORMAT(e.expense_date, "%Y-%m") = ?');
    params.push(filters.month);
  }

  const [rows] = await pool.execute(
    `SELECT e.*, c.name AS client_name, t.ticket_number
     FROM expenses e
     JOIN clients c ON e.client_id = c.id
     LEFT JOIN tickets t ON e.ticket_id = t.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY e.expense_date DESC`,
    params
  );

  return rows;
};

export const updateExpense = async (
  id: number,
  updates: Partial<CreateExpensePayload>
) => {
  const fields: string[] = [];
  const params: any[]    = [];

  if (updates.description  !== undefined) { fields.push('description = ?');  params.push(updates.description); }
  if (updates.amount       !== undefined) { fields.push('amount = ?');       params.push(updates.amount); }
  if (updates.markup_pct   !== undefined) { fields.push('markup_pct = ?');   params.push(updates.markup_pct); }
  if (updates.expense_date !== undefined) { fields.push('expense_date = ?'); params.push(updates.expense_date); }
  if (updates.ticket_id    !== undefined) { fields.push('ticket_id = ?');    params.push(updates.ticket_id); }

  // Recalculate billable_amount if amount or markup changed
  if (updates.amount !== undefined || updates.markup_pct !== undefined) {
    const [rows]: any = await pool.execute('SELECT amount, markup_pct FROM expenses WHERE id = ?', [id]);
    const current     = rows[0];
    const amount      = updates.amount     ?? current.amount;
    const markup      = updates.markup_pct ?? current.markup_pct;
    const billable    = Number(amount) * (1 + Number(markup) / 100);
    fields.push('billable_amount = ?');
    params.push(billable.toFixed(2));
  }

  if (!fields.length) throw new Error('No fields to update');

  await pool.execute(
    `UPDATE expenses SET ${fields.join(', ')} WHERE id = ?`,
    [...params, id]
  );

  const [rows]: any = await pool.execute('SELECT * FROM expenses WHERE id = ?', [id]);
  return rows[0];
};

export const deleteExpense = async (id: number) => {
  await pool.execute('DELETE FROM expenses WHERE id = ?', [id]);
};

export const getExpensesForInvoice = async (
  clientId: number,
  month: string
) => {
  const [rows] = await pool.execute(
    `SELECT * FROM expenses
     WHERE client_id = ?
     AND DATE_FORMAT(expense_date, '%Y-%m') = ?
     AND invoice_id IS NULL
     ORDER BY expense_date ASC`,
    [clientId, month]
  );
  return rows as any[];
};
