import express from 'express';
import cors from 'cors';
import { corsOptions } from './lib/cors.js';
import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';
import usersRoutes from './routes/users.routes.js';
import equipmentRoutes from './routes/equipment.routes.js';
import statsRoutes from './routes/stats.routes.js';
import adminEquipmentRoutes from './routes/adminEquipment.routes.js';

const app = express();

// The Stripe webhook must read the raw body, so it mounts before express.json().
// Route added in S-10; keep this ordering intact.

app.use(cors(corsOptions));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/users', usersRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminEquipmentRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
