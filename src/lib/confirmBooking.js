import { ObjectId } from 'mongodb';
import { getDb } from './db.js';
import { getStripe } from './stripe.js';
import { formatBookingDoc } from '../utils/bookingValidation.js';

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// 02 §5: shared by POST /payments/confirm and the webhook.
// Idempotent — the booking update only applies while paymentStatus is 'unpaid',
// and the payments insert tolerates a duplicate sessionId (unique index).
export async function confirmBooking(sessionId, callerId = null) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== 'paid') {
    throw httpError(409, 'Payment has not completed');
  }

  const db = await getDb();
  const bookingId = session.metadata?.bookingId;
  if (!bookingId || !ObjectId.isValid(String(bookingId))) {
    throw httpError(404, 'Booking not found');
  }

  const booking = await db.collection('bookings').findOne({ _id: new ObjectId(String(bookingId)) });
  if (!booking) {
    throw httpError(404, 'Booking not found');
  }
  if (callerId && booking.customer?.id !== callerId) {
    throw httpError(403, 'Forbidden');
  }
  if (session.amount_total !== booking.totalAmount * 100) {
    throw httpError(409, 'Payment amount does not match the booking total');
  }

  // Decision 2: the units must still be free when the payment lands.
  const equipment = await db.collection('equipment').findOne({ _id: booking.equipmentId });
  if (equipment) {
    const held = await db.collection('bookings').find({
      _id: { $ne: booking._id },
      equipmentId: booking.equipmentId,
      startDate: { $lte: booking.endDate },
      endDate: { $gte: booking.startDate },
      $or: [
        { paymentStatus: 'paid', status: 'confirmed' },
        { paymentStatus: 'unpaid', holdExpiresAt: { $gt: new Date() } },
      ],
    }).toArray();

    const heldUnits = held.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
    if (heldUnits + Number(booking.quantity) > Number(equipment.quantity)) {
      throw httpError(409, 'Those units were taken while the payment was in progress');
    }
  }

  await db.collection('bookings').updateOne(
    { _id: booking._id, paymentStatus: 'unpaid' },
    {
      $set: {
        paymentStatus: 'paid',
        status: 'confirmed',
        transactionId: session.payment_intent || null,
        checkoutSessionId: session.id,
        updatedAt: new Date(),
      },
      $unset: { holdExpiresAt: '' },
    }
  );

  try {
    await db.collection('payments').insertOne({
      bookingId: booking._id,
      sessionId: session.id,
      transactionId: session.payment_intent || null,
      amount: session.amount_total,
      currency: session.currency || 'bdt',
      customerEmail: booking.customer?.email || '',
      ownerEmail: booking.owner?.email || '',
      status: session.payment_status,
      createdAt: new Date(),
    });
  } catch (error) {
    // Duplicate sessionId: another caller (confirm or webhook) already stored it.
    if (error.code !== 11000) throw error;
  }

  const updated = await db.collection('bookings').findOne({ _id: booking._id });
  const payment = await db.collection('payments').findOne({ sessionId: session.id });
  return { booking: formatBookingDoc(updated), payment };
}
