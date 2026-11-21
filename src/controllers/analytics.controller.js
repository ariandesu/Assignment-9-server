import { getDb } from '../lib/db.js';

// Last six calendar months, oldest first, as 'YYYY-MM' labels (UTC).
export function lastSixMonths(now = new Date()) {
  const months = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

function startOfMonthUTC(monthLabel) {
  const [year, month] = monthLabel.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

// Aggregation that buckets paid bookings into 'YYYY-MM' by createdAt.
function monthlyPaidPipeline(match, sumField) {
  return [
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'UTC' } },
        bookings: { $sum: 1 },
        [sumField]: { $sum: '$totalAmount' },
      },
    },
  ];
}

// Shared month bucket for the payments collection. Stripe stores minor units,
// so the summed field comes back in BDT. Handlers supply their own $match
// chain (admin: window only; owner: window plus a booking join on owner id,
// never ownerEmail) and read the summed field off each row.
export function monthlyPaymentsPipeline(stages, sumField) {
  return [
    ...stages,
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'UTC' } },
        [sumField]: { $sum: { $divide: ['$amount', 100] } },
      },
    },
  ];
}

// Scopes payments to one owner through their bookings. Emails can change,
// so the join matches the immutable booking owner id.
export function ownerPaymentScope(ownerId) {
  return [
    { $lookup: { from: 'bookings', localField: 'bookingId', foreignField: '_id', as: 'booking' } },
    { $unwind: '$booking' },
    { $match: { 'booking.owner.id': ownerId } },
  ];
}

export async function getAdminAnalytics(req, res, next) {
  try {
    const db = await getDb();
    const months = lastSixMonths();
    const windowStart = startOfMonthUTC(months[0]);

    const [counts, monthlyBookingRows, bookingStats, revenueData, totalUsers] = await Promise.all([
      db.collection('equipment').aggregate([
        { $facet: {
            equipment: [{ $count: 'n' }],
            pending: [{ $match: { status: 'pending' } }, { $count: 'n' }],
        } },
      ]).toArray(),
      db.collection('bookings').aggregate(monthlyPaidPipeline(
        { paymentStatus: 'paid', createdAt: { $gte: windowStart } }, 'revenue')).toArray(),
      db.collection('bookings').aggregate([
        { $facet: {
            completedRentals: [{ $match: { status: 'completed' } }, { $count: 'n' }],
            totalBookings: [{ $count: 'n' }],
        } },
      ]).toArray(),
      db.collection('payments').aggregate([
        { $match: { status: 'paid' } },
        { $facet: {
            total: [{ $group: { _id: null, total: { $sum: { $divide: ['$amount', 100] } } } }],
            rows: [{ $match: { createdAt: { $gte: windowStart } } }, ...monthlyPaymentsPipeline([], 'revenue')],
        } },
      ]).toArray(),
      db.collection('user').countDocuments(),
    ]);

    const facets = counts[0] || {};
    const bookingFacet = bookingStats[0] || {};
    const revenue = revenueData[0] || {};

    const monthlyMap = new Map(months.map((month) => [month, { month, bookings: 0, revenue: 0 }]));
    for (const row of monthlyBookingRows) {
      const target = monthlyMap.get(row._id);
      if (target) target.bookings = row.bookings;
    }
    for (const row of revenue.rows || []) {
      const target = monthlyMap.get(row._id);
      if (target) target.revenue = row.revenue || 0;
    }

    res.json({
      data: {
        totalUsers,
        totalEquipment: facets.equipment?.[0]?.n ?? 0,
        totalBookings: bookingFacet.totalBookings?.[0]?.n ?? 0,
        pendingApprovals: facets.pending?.[0]?.n ?? 0,
        completedRentals: bookingFacet.completedRentals?.[0]?.n ?? 0,
        totalRevenue: revenue.total?.[0]?.total ?? 0,
        monthly: months.map((month) => monthlyMap.get(month)),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getOwnerAnalytics(req, res, next) {
  try {
    const db = await getDb();
    const ownerId = req.user.id;
    const months = lastSixMonths();
    const windowStart = startOfMonthUTC(months[0]);
    const thisMonthStart = startOfMonthUTC(months[months.length - 1]);

    const [equipmentFacet, bookingFacet, paymentData] = await Promise.all([
      db.collection('equipment').aggregate([
        { $match: { 'owner.id': ownerId } },
        { $facet: {
            listed: [{ $count: 'n' }],
            approved: [{ $match: { status: 'approved' } }, { $count: 'n' }],
            pending: [{ $match: { status: 'pending' } }, { $count: 'n' }],
            rejected: [{ $match: { status: 'rejected' } }, { $count: 'n' }],
        } },
      ]).toArray(),
      db.collection('bookings').aggregate([
        { $match: { 'owner.id': ownerId } },
        { $facet: {
            completedRentals: [{ $match: { status: 'completed' } }, { $count: 'n' }],
            statusMix: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
            total: [{ $count: 'n' }],
        } },
      ]).toArray(),
      db.collection('payments').aggregate([
        { $match: { status: 'paid' } },
        ...ownerPaymentScope(ownerId),
        { $facet: {
            totals: [{ $group: { _id: null, totalEarnings: { $sum: { $divide: ['$amount', 100] } }, thisMonth: { $sum: { $cond: [{ $gte: ['$createdAt', thisMonthStart] }, { $divide: ['$amount', 100] }, 0] } } } }],
            rows: [{ $match: { createdAt: { $gte: windowStart } } }, ...monthlyPaymentsPipeline([], 'earnings')],
        } },
      ]).toArray(),
    ]);

    const eq = equipmentFacet[0] || {};
    const bk = bookingFacet[0] || {};
    const paid = (paymentData[0] || {}).totals?.[0] || {};
    const totalBookings = bk.total?.[0]?.n ?? 0;

    const mixMap = new Map((bk.statusMix || []).map((row) => [row._id, row.count]));
    const statusMix = ['completed', 'confirmed', 'pending'].map((status) => {
      const count = mixMap.get(status) || 0;
      return {
        status,
        count,
        percent: totalBookings > 0 ? Math.round((count / totalBookings) * 100) : 0,
      };
    });

    const monthlyMap = new Map(months.map((month) => [month, { month, earnings: 0 }]));
    for (const row of (paymentData[0] || {}).rows || []) {
      const target = monthlyMap.get(row._id);
      if (target) target.earnings = row.earnings || 0;
    }

    res.json({
      data: {
        listed: eq.listed?.[0]?.n ?? 0,
        approved: eq.approved?.[0]?.n ?? 0,
        pending: eq.pending?.[0]?.n ?? 0,
        rejected: eq.rejected?.[0]?.n ?? 0,
        completedRentals: bk.completedRentals?.[0]?.n ?? 0,
        totalEarnings: paid.totalEarnings ?? 0,
        thisMonth: paid.thisMonth ?? 0,
        statusMix,
        monthly: months.map((month) => monthlyMap.get(month)),
      },
    });
  } catch (err) {
    next(err);
  }
}
