// 01 §decision 2: a booking occupies units when
//   (paid AND status = confirmed) OR (unpaid AND holdExpiresAt > now).
// [start,end] overlap is inclusive on both ends.

const ACTIVE_PAID_STATUSES = ['confirmed'];

export function overlapQuery(startDate, endDate) {
  return {
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  };
}

export async function getBookedQuantity(db, equipmentId, startDate, endDate, now = new Date()) {
  const rows = await db
    .collection('bookings')
    .find({
      equipmentId,
      ...overlapQuery(startDate, endDate),
      $or: [
        { paymentStatus: 'paid', status: { $in: ACTIVE_PAID_STATUSES } },
        { paymentStatus: 'unpaid', holdExpiresAt: { $gt: now } },
      ],
    })
    .toArray();

  return rows.reduce((sum, booking) => sum + (Number(booking.quantity) || 0), 0);
}

export async function getAvailableQuantity(db, equipment, startDate, endDate, now = new Date()) {
  const booked = await getBookedQuantity(db, equipment._id, startDate, endDate, now);
  return Math.max(0, (Number(equipment.quantity) || 0) - booked);
}

// Returns true when the requested quantity fits in the free units.
export async function isAvailable(db, equipment, startDate, endDate, quantity, now = new Date()) {
  const available = await getAvailableQuantity(db, equipment, startDate, endDate, now);
  return quantity <= available;
}
