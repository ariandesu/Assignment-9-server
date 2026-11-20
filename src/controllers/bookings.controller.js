import { ObjectId } from 'mongodb';
import { getDb } from '../lib/db.js';
import { quoteBooking } from '../utils/pricing.js';
import { isAvailable, getAvailableQuantity } from '../utils/availability.js';
import {
  validateBookingInput,
  formatBookingDoc,
  paginate,
} from '../utils/bookingValidation.js';

const HOLD_MINUTES = 30;
const ALLOWED_STATUS_FILTERS = ['pending', 'confirmed', 'completed', 'cancelled'];
const ALLOWED_STATUS_UPDATES = ['confirmed', 'completed', 'cancelled'];

export async function createBooking(req, res, next) {
  try {
    const body = req.body || {};

    if (!body.equipmentId || !ObjectId.isValid(String(body.equipmentId))) {
      return res.status(400).json({ message: 'A valid equipmentId is required' });
    }

    const parsed = validateBookingInput(body);
    if (parsed.error) {
      return res.status(400).json({ message: parsed.error });
    }

    const { quantity, startDate, endDate, phone, address } = parsed;

    const db = await getDb();
    const equipment = await db
      .collection('equipment')
      .findOne({ _id: new ObjectId(String(body.equipmentId)) });

    if (!equipment || equipment.status !== 'approved') {
      return res.status(404).json({ message: 'Equipment not found' });
    }

    if (quantity > equipment.quantity) {
      return res.status(409).json({ message: 'Requested quantity exceeds the available units' });
    }

    // Decision 2: availability is re-checked against paid + unexpired holds.
    if (!(await isAvailable(db, equipment, startDate, endDate, quantity))) {
      const free = await getAvailableQuantity(db, equipment, startDate, endDate);
      return res.status(409).json({
        message: free > 0
          ? `Only ${free} unit(s) available for these dates`
          : 'No units available for these dates',
      });
    }

    // Decisions 1 + 3: pricing is server-side only, the client price is ignored.
    const { days, units, totalAmount } = quoteBooking({
      startDate,
      endDate,
      rentalType: equipment.rentalType,
      price: equipment.price,
      quantity,
    });

    const now = new Date();
    const booking = {
      equipmentId: equipment._id,
      equipment: {
        name: equipment.name,
        image: equipment.image,
        category: equipment.category,
        rentalType: equipment.rentalType,
        price: equipment.price,
      },
      owner: {
        id: equipment.owner?.id,
        name: equipment.owner?.name,
        email: equipment.owner?.email,
      },
      customer: {
        id: req.user.id,
        name: req.user.name || '',
        email: req.user.email || '',
        image: req.user.image || null,
      },
      startDate,
      endDate,
      quantity,
      days,
      units,
      totalAmount,
      phone,
      address,
      notes: typeof body.notes === 'string' ? body.notes.trim() : '',
      status: 'pending',
      paymentStatus: 'unpaid',
      holdExpiresAt: new Date(now.getTime() + HOLD_MINUTES * 60 * 1000),
      checkoutSessionId: null,
      transactionId: null,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('bookings').insertOne(booking);
    booking._id = result.insertedId;

    res.status(201).json({ data: formatBookingDoc(booking) });
  } catch (err) {
    next(err);
  }
}

export async function listMyBookings(req, res, next) {
  try {
    const db = await getDb();
    const rows = await db
      .collection('bookings')
      .find({ 'customer.id': req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    const page = paginate(rows, req.query);
    res.json({ ...page, items: page.items.map(formatBookingDoc) });
  } catch (err) {
    next(err);
  }
}

export async function listOwnerBookings(req, res, next) {
  try {
    const db = await getDb();
    const rows = await db
      .collection('bookings')
      .find({ 'owner.id': req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    const page = paginate(rows, req.query);
    res.json({ ...page, items: page.items.map(formatBookingDoc) });
  } catch (err) {
    next(err);
  }
}

export async function listAdminBookings(req, res, next) {
  try {
    const query = {};
    if (req.query.status) {
      if (!ALLOWED_STATUS_FILTERS.includes(req.query.status)) {
        return res.status(400).json({
          message: `status must be one of: ${ALLOWED_STATUS_FILTERS.join(', ')}`,
        });
      }
      query.status = req.query.status;
    }

    const db = await getDb();
    const rows = await db
      .collection('bookings')
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    const page = paginate(rows, req.query);
    res.json({ ...page, items: page.items.map(formatBookingDoc) });
  } catch (err) {
    next(err);
  }
}

export async function updateBookingStatus(req, res, next) {
  try {
    const { status } = req.body || {};
    if (!ALLOWED_STATUS_UPDATES.includes(status)) {
      return res.status(400).json({
        message: `status must be one of: ${ALLOWED_STATUS_UPDATES.join(', ')}`,
      });
    }

    if (!ObjectId.isValid(String(req.params.id))) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const db = await getDb();
    const id = new ObjectId(String(req.params.id));
    const result = await db
      .collection('bookings')
      .updateOne({ _id: id }, { $set: { status, updatedAt: new Date() } });

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const updated = await db.collection('bookings').findOne({ _id: id });
    res.json({ data: formatBookingDoc(updated) });
  } catch (err) {
    next(err);
  }
}
