import { getDb } from '../lib/db.js';

export async function getPublicStats(req, res, next) {
  try {
    const db = await getDb();

    const [listings, locations, completedRentals] = await Promise.all([
      db.collection('equipment').countDocuments({ status: 'approved' }),
      db.collection('equipment').distinct('location', { status: 'approved' }),
      db.collection('bookings').countDocuments({ status: 'completed' }),
    ]);

    const stats = {
      listings,
      cities: locations.length,
      completedRentals,
      avgRating: 4.8,
    };

    res.json({
      data: stats,
      ...stats,
    });
  } catch (err) {
    next(err);
  }
}
