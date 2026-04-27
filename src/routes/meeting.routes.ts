import { Router } from 'express';
import * as meetingController from '../controllers/meeting.controller';

const router = Router();

router.post('/',      meetingController.createMeeting);
router.get('/',       meetingController.listMeetings);
router.patch('/:id',  meetingController.updateMeeting);
router.delete('/:id', meetingController.deleteMeeting);

export default router;
