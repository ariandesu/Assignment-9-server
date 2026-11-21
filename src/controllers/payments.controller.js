import { ObjectId } from 'mongodb';
import { getDb } from '../lib/db.js';
import { getStripe, getWebhookSecret, getClientUrl, StripeNotConfiguredError } from '../lib/stripe.js';
import { confirmBooking } from '../lib/confirmBooking.js';

const SESSION_MINUTES = 30;

function notConfigured(res) {
  return res.status(503).json({ message: 'Payments are not configured' });
}

export async function createCheckoutSession(req, res, next) {
  try {
    const { bookingId } = req.body || {};
    if (!bookingId || !ObjectId.isValid(String(bookingId))) {
      return res.status(400).json({ message: 'A valid bookingId is required' });
    }

    const db = await getDb();
    const booking = await db
      .collection('bookings')
      .findOne({ _id: new ObjectId(String(bookingId)) });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Must belong to the caller and still be an open unpaid reservation.
    if (booking.customer?.id !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (booking.paymentStatus === 'paid') {
      return res.status(409).json({ message: 'This booking is already paid' });
    }
    if (!booking.holdExpiresAt || new Date(booking.holdExpiresAt) <= new Date()) {
      await db.collection('bookings').updateOne(
        { _id: booking._id },
        { $set: { status: 'cancelled', updatedAt: new Date() } }
      );
      return res.status(409).json({ message: 'This reservation has expired' });
    }

    let stripe;
    try {
      stripe = getStripe();
    } catch (error) {
      if (error instanceof StripeNotConfiguredError) return notConfigured(res);
      throw error;
    }

    const clientUrl = getClientUrl();
    // 01 decision 4: BDT, amount taken from the booking in the database.
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // Payment methods come from the Stripe Dashboard; the API rejects
      // payment_method_types on Checkout Sessions.
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'bdt',
            unit_amount: booking.totalAmount * 100,
            product_data: {
              name: booking.equipment?.name || 'Equipment rental',
              description: `${booking.quantity} unit(s) · ${booking.days} day(s)`,
            },
          },
        },
      ],
      metadata: { bookingId: booking._id.toString() },
      customer_email: booking.customer?.email || undefined,
      expires_at: Math.floor(Date.now() / 1000) + SESSION_MINUTES * 60,
      success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/payment/cancel?booking=${booking._id.toString()}`,
    });

    await db.collection('bookings').updateOne(
      { _id: booking._id },
      { $set: { checkoutSessionId: session.id, updatedAt: new Date() } }
    );

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
}

export async function confirmPayment(req, res, next) {
  try {
    const { sessionId } = req.body || {};
    if (!sessionId) {
      return res.status(400).json({ message: 'A sessionId is required' });
    }

    try {
      const result = await confirmBooking(String(sessionId), req.user.id);
      res.json({ data: result });
    } catch (error) {
      if (error instanceof StripeNotConfiguredError) return notConfigured(res);
      if (error.status) return res.status(error.status).json({ message: error.message });
      throw error;
    }
  } catch (err) {
    next(err);
  }
}

export async function stripeWebhook(req, res, next) {
  try {
    let stripe;
    let secret;
    try {
      stripe = getStripe();
      secret = getWebhookSecret();
    } catch (error) {
      if (error instanceof StripeNotConfiguredError) return notConfigured(res);
      throw error;
    }

    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ message: 'Missing Stripe signature' });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, secret);
    } catch {
      return res.status(400).json({ message: 'Invalid Stripe signature' });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      try {
        await confirmBooking(session.id);
      } catch (error) {
        // Only terminal client errors are swallowed so Stripe stops retrying.
        if (!error.status || error.status >= 500) throw error;
      }
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
}
