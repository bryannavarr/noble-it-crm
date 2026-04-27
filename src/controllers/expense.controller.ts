import { Request, Response } from 'express';
import * as expenseService from '../services/expense.service';

export const createExpense = async (req: Request, res: Response): Promise<void> => {
  try {
    const expense = await expenseService.createExpense(req.body);
    res.status(201).json({ success: true, data: expense });
  } catch (err: any) {
    console.error('[createExpense]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const listExpenses = async (req: Request, res: Response): Promise<void> => {
  try {
    const { client_id, month, ticket_id } = req.query;
    const expenses = await expenseService.listExpenses({
      client_id: client_id ? Number(client_id) : undefined,
      month:     month     ? String(month)     : undefined,
      ticket_id: ticket_id ? Number(ticket_id) : undefined,
    });
    res.json({ success: true, data: expenses });
  } catch (err: any) {
    console.error('[listExpenses]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const updateExpense = async (req: Request, res: Response): Promise<void> => {
  try {
    const expense = await expenseService.updateExpense(Number(req.params.id), req.body);
    res.json({ success: true, data: expense });
  } catch (err: any) {
    console.error('[updateExpense]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const deleteExpense = async (req: Request, res: Response): Promise<void> => {
  try {
    await expenseService.deleteExpense(Number(req.params.id));
    res.json({ success: true, message: 'Expense deleted' });
  } catch (err: any) {
    console.error('[deleteExpense]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
