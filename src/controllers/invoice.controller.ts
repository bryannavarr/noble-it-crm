import { Request, Response } from 'express';
import * as invoiceService from '../services/invoice.service';

export const previewInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { client_id, month } = req.query;
    if (!client_id || !month) {
      res.status(400).json({ success: false, error: 'client_id and month are required' });
      return;
    }
    const preview = await invoiceService.previewInvoice(Number(client_id), String(month));
    res.json({ success: true, data: preview });
  } catch (err: any) {
    console.error('[previewInvoice]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const generateInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { client_id, month } = req.body;
    if (!client_id || !month) {
      res.status(400).json({ success: false, error: 'client_id and month are required' });
      return;
    }
    const invoice = await invoiceService.generateInvoice(client_id, month);
    res.status(201).json({ success: true, data: invoice });
  } catch (err: any) {
    console.error('[generateInvoice]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const listInvoices = async (req: Request, res: Response): Promise<void> => {
  try {
    const { client_id } = req.query;
    const invoices = await invoiceService.listInvoices(
      client_id ? Number(client_id) : undefined
    );
    res.json({ success: true, data: invoices });
  } catch (err: any) {
    console.error('[listInvoices]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const invoice = await invoiceService.getInvoiceById(Number(req.params.id));
    if (!invoice) {
      res.status(404).json({ success: false, error: 'Invoice not found' });
      return;
    }
    res.json({ success: true, data: invoice });
  } catch (err: any) {
    console.error('[getInvoice]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const saveInvoiceToS3 = async (req: Request, res: Response): Promise<void> => {
  try {
    const invoice = await invoiceService.saveInvoiceToS3(Number(req.params.id));
    res.json({ success: true, data: invoice, message: 'Invoice saved to S3' });
  } catch (err: any) {
    console.error('[saveInvoiceToS3]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const deleteInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await invoiceService.deleteInvoice(Number(req.params.id));
    res.json({ success: true, data: result, message: 'Invoice deleted' });
  } catch (err: any) {
    console.error('[deleteInvoice]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const addAdjustment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { amount, label } = req.body;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount === 0) {
      res.status(400).json({ success: false, error: 'amount must be a non-zero number' });
      return;
    }
    if (!label || typeof label !== 'string' || !label.trim()) {
      res.status(400).json({ success: false, error: 'label is required' });
      return;
    }
    const invoice = await invoiceService.addAdjustment(
      Number(req.params.id),
      amount,
      label,
    );
    res.json({ success: true, data: invoice, message: 'Adjustment added' });
  } catch (err: any) {
    console.error('[addAdjustment]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
