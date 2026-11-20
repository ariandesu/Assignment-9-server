const MS_PER_DAY = 86400000;

// 01 §decision 1: days = (endDate - startDate) in days + 1, inclusive.
// Both dates are normalised to UTC calendar days so a timezone offset can
// never change the billable day count.
export function computeDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const startUtc = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate()
  );
  const endUtc = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate()
  );
  return Math.round((endUtc - startUtc) / MS_PER_DAY) + 1;
}

// weekly and monthly charge every started period.
export function computeUnits(days, rentalType) {
  if (rentalType === 'weekly') return Math.ceil(days / 7);
  if (rentalType === 'monthly') return Math.ceil(days / 30);
  return days;
}

export function computeTotal(price, units, quantity) {
  return units * price * quantity;
}

// The server is the source of truth: the price comes from the equipment
// document in the database, never from the request body.
export function quoteBooking({ startDate, endDate, rentalType, price, quantity }) {
  const days = computeDays(startDate, endDate);
  const units = computeUnits(days, rentalType);
  const totalAmount = computeTotal(price, units, quantity);
  return { days, units, totalAmount };
}
