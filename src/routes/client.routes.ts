import { Router } from 'express';
import * as clientController from '../controllers/client.controller';

const router = Router();

router.post('/',                              clientController.createClient);
router.get('/',                               clientController.listClients);
router.get('/:id',                            clientController.getClient);
router.patch('/:id',                          clientController.updateClient);
router.post('/:id/ticket-sequence/reset',     clientController.resetTicketSequence);

export default router;
