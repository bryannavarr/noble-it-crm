import { Router } from 'express';
import * as invoiceController from '../controllers/invoice.controller';

const router = Router();

router.get('/preview',       invoiceController.previewInvoice);
router.post('/generate',     invoiceController.generateInvoice);
router.get('/',              invoiceController.listInvoices);
router.get('/:id',           invoiceController.getInvoice);
router.post('/:id/approve',  invoiceController.approveInvoice);
router.post('/:id/send',     invoiceController.sendInvoice);

export default router;
