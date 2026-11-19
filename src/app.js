import express from 'express';

const app = express();

// The Stripe webhook must read the raw body, so it mounts before express.json().
// Route added in S-10; keep this ordering intact.

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

export default app;
