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

export async function getAdminAnalytics(req, res, next) {
  try {
    const db = await getDb();
    const months = lastSixMonths();
    const windowStart = startOfMonthUTC(months[0]);

    const [counts, monthlyRows, revenueRows, totalUsers] = await Promise.all([
      db.collection('equipment').aggregate([
        {
          $facet: {
            equipment: [{ $count: 'n' }],
            pending: [{ $match: { status: 'pending' } }, { $count: 'n' }],
          },
        },
      ]).toArray(),
      db.collection('bookings').aggregate(monthlyPaidPipeline(
        { paymentStatus: 'paid', createdAt: { $gte: windowStart } },
        'revenue'
      )).toArray(),
      db.collection('bookings').aggregate([
        {
          $facet: {
            totalRevenue: [
              { $match: { paymentStatus: 'paid' } },
              { $group: { _id: null, total: { $sum: '$totalAmount' } } },
            ],
            completedRentals: [
              { $match: { status: 'completed' } },
              { $count: 'n' },
            ],
            totalBookings: [{ $count: 'n' }],
          },
        },
      ]).toArray(),
      db.collection('user').countDocuments(),
    ]);

    const facets = counts[0] || {};
    const revenueFacet = revenueRows[0] || {};

    const monthlyMap = new Map(months.map((month) => [month, { month, bookings: 0, revenue: 0 }]));
    for (const row of monthlyRows) {
      const target = monthlyMap.get(row._id);
      if (target) {
        target.bookings = row.bookings;
        target.revenue = row.revenue || 0;
      }
    }

    res.json({
      data: {
        totalUsers,
        totalEquipment: facets.equipment?.[0]?.n ?? 0,
        totalBookings: revenueFacet.totalBookings?.[0]?.n ?? 0,
        pendingApprovals: facets.pending?.[0]?.n ?? 0,
        completedRentals: revenueFacet.completedRentals?.[0]?.n ?? 0,
        totalRevenue: revenueFacet.totalRevenue?.[0]?.total ?? 0,
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

    const [equipmentFacet, bookingFacet, monthlyRows] = await Promise.all([
      db.collection('equipment').aggregate([
        { $match: { 'owner.id': ownerId } },
        {
          $facet: {
            listed: [{ $count: 'n' }],
            approved: [{ $match: { status: 'approved' } }, { $count: 'n' }],
            pending: [{ $match: { status: 'pending' } }, { $count: 'n' }],
            rejected: [{ $match: { status: 'rejected' } }, { $count: 'n' }],
          },
        },
      ]).toArray(),
      db.collection('bookings').aggregate([
        { $match: { 'owner.id': ownerId } },
        {
          $facet: {
            completedRentals: [{ $match: { status: 'completed' } }, { $count: 'n' }],
            paid: [
              { $match: { paymentStatus: 'paid' } },
              {
                $group: {
                  _id: null,
                  totalEarnings: { $sum: '$totalAmount' },
                  thisMonth: {
                    $sum: {
                      $cond: [{ $gte: ['$createdAt', thisMonthStart] }, '$totalAmount', 0],
                    },
                  },
                },
              },
            ],
            statusMix: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
            total: [{ $count: 'n' }],
          },
        },
      ]).toArray(),
      db.collection('bookings').aggregate(monthlyPaidPipeline(
        { 'owner.id': ownerId, paymentStatus: 'paid', createdAt: { $gte: windowStart } },
        'earnings'
      )).toArray(),
    ]);

    const eq = equipmentFacet[0] || {};
    const bk = bookingFacet[0] || {};
    const paid = bk.paid?.[0] || {};
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
    for (const row of monthlyRows) {
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
