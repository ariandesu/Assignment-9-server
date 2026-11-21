import express from 'express';
import cors from 'cors';
import { corsOptions } from './lib/cors.js';
import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';
import usersRoutes from './routes/users.routes.js';
import equipmentRoutes from './routes/equipment.routes.js';
import statsRoutes from './routes/stats.routes.js';
import adminRoutes from './routes/admin.routes.js';
import favoritesRoutes from './routes/favorites.routes.js';
import bookingsRoutes from './routes/bookings.routes.js';
import paymentsRoutes from './routes/payments.routes.js';
import cronRoutes from './routes/cron.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import { stripeWebhook } from './controllers/payments.controller.js';

const app = express();

// The Stripe webhook must read the raw body, so it mounts before express.json().
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

app.use(cors(corsOptions));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

const apiInfo = {
  data: { name: 'Equipra API', status: 'ok', docs: 'see README' },
};

app.get('/', (_req, res) => {
  res.status(200).json(apiInfo);
});

app.get('/api', (_req, res) => {
  res.status(200).json(apiInfo);
});

app.use('/api/users', usersRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/analytics', analyticsRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
