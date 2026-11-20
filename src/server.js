import 'dotenv/config';
import cron from 'node-cron';
import app from './app.js';
import { completeBookings } from './jobs/completeBookings.js';

const port = Number(process.env.PORT) || 5000;

app.listen(port, () => {
  console.log(`equipra-server listening on http://localhost:${port}`);
});

// Vercel kills timers between invocations, so the scheduled sweep only runs on a
// long-lived host. On Vercel the /api/cron/complete-bookings route does the work.
if (!process.env.VERCEL) {
  cron.schedule('0 * * * *', async () => {
    try {
      const result = await completeBookings();
      console.log(
        `cron complete-bookings: completed ${result.completed}, cancelled ${result.cancelled}`
      );
    } catch (error) {
      console.error('cron complete-bookings failed:', error.message);
    }
  });
}
