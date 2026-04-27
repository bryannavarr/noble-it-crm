import { Request, Response } from 'express';
import * as ticketService from '../services/ticket.service';

// ── Tickets ───────────────────────────────────────────────────────────────────

export const createTickets = async (req: Request, res: Response): Promise<void> => {
  try {
    const tickets = await ticketService.createTickets(req.body);
    res.status(201).json({ success: true, data: tickets });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const listTickets = async (req: Request, res: Response): Promise<void> => {
  try {
    const { client_id, client_name, status, category, priority } = req.query;

    const tickets = await ticketService.listTickets({
      client_id:   client_id   ? Number(client_id)        : undefined,
      client_name: client_name ? String(client_name)      : undefined,
      status:      status      ? String(status)           : undefined,
      category:    category    ? String(category)         : undefined,
      priority:    priority    ? String(priority)         : undefined,
    });

    res.json({ success: true, data: tickets });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getTicket = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Support lookup by internal id OR ticket_number e.g. UNIK-1
    const ticket = isNaN(Number(id))
      ? await ticketService.getTicketByNumber(id)
      : await ticketService.getTicketById(Number(id));

    if (!ticket) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }

    res.json({ success: true, data: ticket });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const updateTicket = async (req: Request, res: Response): Promise<void> => {
  try {
    const ticket = await ticketService.updateTicket(Number(req.params.id), req.body);
    res.json({ success: true, data: ticket });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const deleteTicket = async (req: Request, res: Response): Promise<void> => {
  try {
    await ticketService.deleteTicket(Number(req.params.id));
    res.json({ success: true, message: 'Ticket deleted' });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── Work logs ─────────────────────────────────────────────────────────────────

export const logTime = async (req: Request, res: Response): Promise<void> => {
  try {
    const log = await ticketService.logTime(Number(req.params.id), req.body);
    res.status(201).json({ success: true, data: log });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getWorkLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const logs = await ticketService.getWorkLogs(Number(req.params.id));
    res.json({ success: true, data: logs });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const updateWorkLog = async (req: Request, res: Response): Promise<void> => {
  try {
    const log = await ticketService.updateWorkLog(
      Number(req.params.id),
      Number(req.params.logId),
      req.body
    );
    res.json({ success: true, data: log });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const deleteWorkLog = async (req: Request, res: Response): Promise<void> => {
  try {
    await ticketService.deleteWorkLog(
      Number(req.params.id),
      Number(req.params.logId)
    );
    res.json({ success: true, message: 'Work log deleted' });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── Comments ──────────────────────────────────────────────────────────────────

export const addComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const comment = await ticketService.addComment(Number(req.params.id), req.body);
    res.status(201).json({ success: true, data: comment });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getComments = async (req: Request, res: Response): Promise<void> => {
  try {
    const comments = await ticketService.getComments(Number(req.params.id));
    res.json({ success: true, data: comments });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const updateComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const comment = await ticketService.updateComment(
      Number(req.params.id),
      Number(req.params.commentId),
      req.body.body
    );
    res.json({ success: true, data: comment });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const deleteComment = async (req: Request, res: Response): Promise<void> => {
  try {
    await ticketService.deleteComment(
      Number(req.params.id),
      Number(req.params.commentId)
    );
    res.json({ success: true, message: 'Comment deleted' });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};
