const BD_PHONE_REGEX = /^(?:\+?880|0)1[3-9]\d{8}$/;

export function startOfTodayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Booking dates are stored as UTC midnight so calendar-day maths is stable.
export function parseDateOnly(value) {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function normalisePhone(value) {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/[\s-]/g, '');
  if (!BD_PHONE_REGEX.test(digits)) return null;
  return `+880${digits.slice(-10)}`;
}

export function formatBookingDoc(doc) {
  if (!doc) return null;
  return {
    id: doc._id.toString(),
    equipmentId: doc.equipmentId ? doc.equipmentId.toString() : null,
    equipment: doc.equipment || {},
    owner: doc.owner || {},
    customer: doc.customer || {},
    startDate: doc.startDate,
    endDate: doc.endDate,
    quantity: doc.quantity,
    days: doc.days,
    units: doc.units,
    totalAmount: doc.totalAmount,
    phone: doc.phone || '',
    address: doc.address || '',
    notes: doc.notes || '',
    status: doc.status,
    paymentStatus: doc.paymentStatus,
    holdExpiresAt: doc.holdExpiresAt || null,
    checkoutSessionId: doc.checkoutSessionId || null,
    transactionId: doc.transactionId || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function paginate(rows, params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(24, Math.max(1, parseInt(params.limit, 10) || 9));
  return {
    items: rows.slice((page - 1) * limit, (page - 1) * limit + limit),
    total: rows.length,
    page,
    pages: Math.ceil(rows.length / limit) || 1,
  };
}

// Validates the booking body exactly like the mock source and 02 §5:
// start >= today (UTC), end >= start, quantity is an integer, BD phone, address.
// Returns { error } with the first failure, or the parsed values.
export function validateBookingInput(body = {}) {
  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { error: 'Quantity must be a whole number of at least 1' };
  }

  const startDate = parseDateOnly(body.startDate);
  const endDate = parseDateOnly(body.endDate);
  if (!startDate || !endDate) {
    return { error: 'Start and end dates are required' };
  }
  if (startDate < startOfTodayUTC()) {
    return { error: 'Start date must not be in the past' };
  }
  if (endDate < startDate) {
    return { error: 'End date must not be before the start date' };
  }

  const phone = normalisePhone(body.phone);
  if (!phone) {
    return { error: 'A valid phone number is required' };
  }

  const address = typeof body.address === 'string' ? body.address.trim() : '';
  if (!address) {
    return { error: 'A delivery address is required' };
  }

  return { quantity, startDate, endDate, phone, address };
}
