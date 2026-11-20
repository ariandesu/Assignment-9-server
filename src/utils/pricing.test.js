import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDays, computeUnits, computeTotal, quoteBooking } from './pricing.js';
import { overlapQuery } from './availability.js';

test('computeDays counts both the start and the end date', () => {
  assert.equal(computeDays('2026-11-21', '2026-11-21'), 1);
  assert.equal(computeDays('2026-11-21', '2026-11-23'), 3);
  assert.equal(computeDays('2026-11-21', '2026-11-27'), 7);
});

test('computeUnits charges every started week or month', () => {
  assert.equal(computeUnits(3, 'daily'), 3);
  assert.equal(computeUnits(7, 'weekly'), 1);
  assert.equal(computeUnits(8, 'weekly'), 2);
  assert.equal(computeUnits(14, 'weekly'), 2);
  assert.equal(computeUnits(30, 'monthly'), 1);
  assert.equal(computeUnits(31, 'monthly'), 2);
});

test('computeTotal is units x price x quantity', () => {
  assert.equal(computeTotal(18500, 3, 1), 55500);
  assert.equal(computeTotal(18500, 3, 2), 111000);
  assert.equal(computeTotal(6200, 2, 1), 12400);
});

test('quoteBooking mirrors the client formula exactly', () => {
  assert.deepEqual(
    quoteBooking({
      startDate: '2026-11-21',
      endDate: '2026-11-23',
      rentalType: 'daily',
      price: 18500,
      quantity: 1,
    }),
    { days: 3, units: 3, totalAmount: 55500 }
  );

  // 8 days on a weekly listing bills 2 started weeks.
  assert.deepEqual(
    quoteBooking({
      startDate: '2026-11-20',
      endDate: '2026-11-27',
      rentalType: 'weekly',
      price: 32000,
      quantity: 1,
    }),
    { days: 8, units: 2, totalAmount: 64000 }
  );
});

test('overlapQuery matches bookings that touch the requested range', () => {
  const start = new Date('2026-11-21T00:00:00.000Z');
  const end = new Date('2026-11-23T00:00:00.000Z');
  const query = overlapQuery(start, end);

  // A booking overlaps when it starts on or before our end and ends on or after our start.
  assert.deepEqual(query, {
    startDate: { $lte: end },
    endDate: { $gte: start },
  });

  const overlaps = (bStart, bEnd) =>
    new Date(bStart) <= end && new Date(bEnd) >= start;

  assert.equal(overlaps('2026-11-21T00:00:00.000Z', '2026-11-23T00:00:00.000Z'), true);
  assert.equal(overlaps('2026-11-20T00:00:00.000Z', '2026-11-21T00:00:00.000Z'), true);
  assert.equal(overlaps('2026-11-23T00:00:00.000Z', '2026-11-25T00:00:00.000Z'), true);
  assert.equal(overlaps('2026-11-24T00:00:00.000Z', '2026-11-26T00:00:00.000Z'), false);
  assert.equal(overlaps('2026-11-18T00:00:00.000Z', '2026-11-20T00:00:00.000Z'), false);
});
