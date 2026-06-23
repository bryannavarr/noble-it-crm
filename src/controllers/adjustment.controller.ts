import { Request, Response } from "express";
import * as adjustmentService from "../services/adjustment.service";

export const addPending = async (req: Request, res: Response): Promise<void> => {
  try {
    const { client_id, amount, label } = req.body;
    if (!client_id || typeof client_id !== "number") {
      res.status(400).json({ success: false, error: "client_id is required" });
      return;
    }
    const adj = await adjustmentService.addPending(client_id, Number(amount), label);
    res.status(201).json({ success: true, data: adj });
  } catch (err: any) {
    console.error("[addPending]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const listForClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const clientId = Number(req.params.clientId);
    const pendingOnly = String(req.query.pending ?? "").toLowerCase() !== "false";
    const list = pendingOnly
      ? await adjustmentService.listPendingForClient(clientId)
      : await adjustmentService.listAllForClient(clientId);
    res.json({ success: true, data: list });
  } catch (err: any) {
    console.error("[listForClient]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const remove = async (req: Request, res: Response): Promise<void> => {
  try {
    await adjustmentService.removeIfPending(Number(req.params.id));
    res.json({ success: true, message: "Adjustment removed" });
  } catch (err: any) {
    console.error("[remove]", err);
    const status = /attached/.test(err.message) ? 409 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
};
