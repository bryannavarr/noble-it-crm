import { Request, Response } from 'express';
import * as clientService from '../services/client.service';

export const createClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const client = await clientService.createClient(req.body);
    res.status(201).json({ success: true, data: client });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const listClients = async (req: Request, res: Response): Promise<void> => {
  try {
    const clients = await clientService.listClients();
    res.json({ success: true, data: clients });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const client = await clientService.getClientById(Number(req.params.id));
    if (!client) {
      res.status(404).json({ success: false, error: 'Client not found' });
      return;
    }
    res.json({ success: true, data: client });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const updateClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const client = await clientService.updateClient(Number(req.params.id), req.body);
    res.json({ success: true, data: client });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const resetTicketSequence = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await clientService.resetTicketSequence(Number(req.params.id));
    res.json({ success: true, data: result, message: 'Ticket sequence reset' });
  } catch (err: any) {
    console.error('[resetTicketSequence]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
