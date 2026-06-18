import { Router } from 'express';
import * as invoiceController from '../controllers/invoice.controller';

const router = Router();

router.get('/preview',       invoiceController.previewInvoice);
router.post('/generate',     invoiceController.generateInvoice);
router.get('/',              invoiceController.listInvoices);
router.get('/:id',           invoiceController.getInvoice);
router.post('/:id/save',     invoiceController.saveInvoiceToS3);
router.post('/:id/adjust',   invoiceController.addAdjustment);

export default router;
