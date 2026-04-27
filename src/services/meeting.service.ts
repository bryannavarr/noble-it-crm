import pool from '../db/pool';
import { CreateMeetingPayload } from '../types';

export const createMeeting = async (data: CreateMeetingPayload) => {
  const { client_id, description, meeting_date, start_time, end_time, hours } = data;

  const [result]: any = await pool.execute(
    `INSERT INTO meetings (client_id, description, meeting_date, start_time, end_time, hours)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [client_id, description, meeting_date, start_time ?? null, end_time ?? null, hours]
  );

  const [rows]: any = await pool.execute(
    'SELECT * FROM meetings WHERE id = ?',
    [result.insertId]
  );

  return rows[0];
};

export const listMeetings = async (filters: {
  client_id?: number;
  month?:     string;
}) => {
  const conditions: string[] = ['1=1'];
  const params: any[]        = [];

  if (filters.client_id) {
    conditions.push('m.client_id = ?');
    params.push(filters.client_id);
  }
  if (filters.month) {
    conditions.push('DATE_FORMAT(m.meeting_date, "%Y-%m") = ?');
    params.push(filters.month);
  }

  const [rows] = await pool.execute(
    `SELECT m.*, c.name AS client_name
     FROM meetings m
     JOIN clients c ON m.client_id = c.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY m.meeting_date DESC`,
    params
  );

  return rows;
};

export const updateMeeting = async (
  id: number,
  updates: Partial<CreateMeetingPayload>
) => {
  const fields: string[] = [];
  const params: any[]    = [];

  if (updates.description  !== undefined) { fields.push('description = ?');  params.push(updates.description); }
  if (updates.meeting_date !== undefined) { fields.push('meeting_date = ?'); params.push(updates.meeting_date); }
  if (updates.start_time   !== undefined) { fields.push('start_time = ?');   params.push(updates.start_time); }
  if (updates.end_time     !== undefined) { fields.push('end_time = ?');     params.push(updates.end_time); }
  if (updates.hours        !== undefined) { fields.push('hours = ?');        params.push(updates.hours); }

  if (!fields.length) throw new Error('No fields to update');

  await pool.execute(
    `UPDATE meetings SET ${fields.join(', ')} WHERE id = ?`,
    [...params, id]
  );

  const [rows]: any = await pool.execute(
    'SELECT * FROM meetings WHERE id = ?',
    [id]
  );

  return rows[0];
};

export const deleteMeeting = async (id: number) => {
  await pool.execute('DELETE FROM meetings WHERE id = ?', [id]);
};

export const getMeetingsForInvoice = async (
  clientId: number,
  month: string
) => {
  const [rows] = await pool.execute(
    `SELECT * FROM meetings
     WHERE client_id = ?
     AND DATE_FORMAT(meeting_date, '%Y-%m') = ?
     AND invoice_id IS NULL
     ORDER BY meeting_date ASC`,
    [clientId, month]
  );
  return rows as any[];
};
