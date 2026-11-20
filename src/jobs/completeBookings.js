import { getDb } from '../lib/db.js';
import { startOfTodayUTC } from '../utils/bookingValidation.js';

// 02 §6: two housekeeping sweeps, both keyed off UTC calendar days.
//   1. confirmed + paid bookings whose endDate has passed -> completed
//   2. unpaid holds whose holdExpiresAt has passed       -> cancelled
export async function completeBookings(now = new Date()) {
  const db = await getDb();
  const today = startOfTodayUTC();

  const completed = await db.collection('bookings').updateMany(
    {
      status: 'confirmed',
      paymentStatus: 'paid',
      endDate: { $lt: today },
    },
    { $set: { status: 'completed', updatedAt: now } }
  );

  const cancelled = await db.collection('bookings').updateMany(
    {
      paymentStatus: 'unpaid',
      status: 'pending',
      holdExpiresAt: { $lt: now },
    },
    { $set: { status: 'cancelled', updatedAt: now } }
  );

  return {
    completed: completed.modifiedCount,
    cancelled: cancelled.modifiedCount,
  };
}

// Route handler: protected by `Authorization: Bearer CRON_SECRET`.
export async function runCompleteBookings(req, res, next) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return res.status(503).json({ message: 'Cron is not configured' });
    }

    const header = req.headers.authorization || '';
    if (header !== `Bearer ${secret}`) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const result = await completeBookings();
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}
