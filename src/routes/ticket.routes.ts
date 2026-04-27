import { Router } from 'express';
import * as ticketController from '../controllers/ticket.controller';

const router = Router();

router.post('/',                           ticketController.createTickets);
router.get('/',                            ticketController.listTickets);
router.get('/:id',                         ticketController.getTicket);
router.patch('/:id',                       ticketController.updateTicket);
router.delete('/:id',                      ticketController.deleteTicket);

router.post('/:id/log',                    ticketController.logTime);
router.get('/:id/logs',                    ticketController.getWorkLogs);
router.patch('/:id/logs/:logId',           ticketController.updateWorkLog);
router.delete('/:id/logs/:logId',          ticketController.deleteWorkLog);

router.post('/:id/comments',               ticketController.addComment);
router.get('/:id/comments',                ticketController.getComments);
router.patch('/:id/comments/:commentId',   ticketController.updateComment);
router.delete('/:id/comments/:commentId',  ticketController.deleteComment);

export default router;
