import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authenticate from './middleware/auth';
import { approveInvoice, sendInvoice } from './services/invoice.service';

import ticketRoutes  from './routes/ticket.routes';
import clientRoutes  from './routes/client.routes';
import invoiceRoutes from './routes/invoice.routes';
import meetingRoutes from './routes/meeting.routes';

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

// ── Invoice approval via email link (public, one-click) ───────────────────────
app.get('/api/invoices/:id/approve', async (req, res) => {
  try {
    await approveInvoice(Number(req.params.id));
    await sendInvoice(Number(req.params.id));
    res.send(`
      <html>
        <body style="font-family:sans-serif;text-align:center;padding:60px;">
          <h2 style="color:#4a5fa5;">✓ Invoice Approved</h2>
          <p>The invoice has been approved and sent to the client.</p>
        </body>
      </html>
    `);
  } catch (err: any) {
    res.status(500).send(`<p>Error: ${err.message}</p>`);
  }
});

// ── Authenticated API routes ──────────────────────────────────────────────────
app.use('/api/tickets',  authenticate, ticketRoutes);
app.use('/api/clients',  authenticate, clientRoutes);
app.use('/api/invoices', authenticate, invoiceRoutes);
app.use('/api/meetings', authenticate, meetingRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(port, () => {
  console.log(`noble-msp running on port ${port}`);
});

export default app;
