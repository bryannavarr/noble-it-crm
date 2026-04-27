import { Request, Response } from 'express';
import * as meetingService from '../services/meeting.service';

export const createMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    const meeting = await meetingService.createMeeting(req.body);
    res.status(201).json({ success: true, data: meeting });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const listMeetings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { client_id, month } = req.query;
    const meetings = await meetingService.listMeetings({
      client_id: client_id ? Number(client_id) : undefined,
      month:     month     ? String(month)     : undefined,
    });
    res.json({ success: true, data: meetings });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const updateMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    const meeting = await meetingService.updateMeeting(Number(req.params.id), req.body);
    res.json({ success: true, data: meeting });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const deleteMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    await meetingService.deleteMeeting(Number(req.params.id));
    res.json({ success: true, message: 'Meeting deleted' });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};
