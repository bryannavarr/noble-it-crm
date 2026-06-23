import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authenticate from './middleware/auth';
import { saveInvoiceToS3 } from './services/invoice.service';

import ticketRoutes     from './routes/ticket.routes';
import clientRoutes     from './routes/client.routes';
import invoiceRoutes    from './routes/invoice.routes';
import meetingRoutes    from './routes/meeting.routes';
import adjustmentRoutes from './routes/adjustment.routes';

const app  = express();
const port = Number(process.env.PORT ?? 3100);

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());

// ── Health check (public) ─────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'noble-msp', ts: new Date().toISOString() });
});

// ── Save invoice to S3 via email link (public, one-click, idempotent) ────────
// The approval email's "Save Invoice" button hits this; uploads the PDF to
// S3, flips status -> APPROVED and is_in_cloud -> 1, and deletes the local
// copy. Clicking again on an already-saved invoice is a no-op.
app.get('/api/invoices/:id/save', async (req, res) => {
  try {
    const invoice: any = await saveInvoiceToS3(Number(req.params.id));
    res.send(`
      <html>
        <body style="font-family:sans-serif;text-align:center;padding:60px;">
          <h2 style="color:#4a5fa5;">✓ Invoice Saved</h2>
          <p>${invoice?.invoice_number ?? 'Invoice'} has been uploaded to S3.</p>
          <p style="color:#888;font-size:13px;">You can close this tab.</p>
        </body>
      </html>
    `);
  } catch (err: any) {
    res.status(500).send(`<p>Error: ${err.message}</p>`);
  }
});

// ── Authenticated API routes ──────────────────────────────────────────────────
app.use('/api/tickets',     authenticate, ticketRoutes);
app.use('/api/clients',     authenticate, clientRoutes);
app.use('/api/invoices',    authenticate, invoiceRoutes);
app.use('/api/meetings',    authenticate, meetingRoutes);
app.use('/api/adjustments', authenticate, adjustmentRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(port, () => {
  console.log(`noble-msp running on port ${port}`);
});

export default app;
