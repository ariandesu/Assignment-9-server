import test from 'node:test';
import assert from 'node:assert/strict';
import { getAvailableQuantity } from './availability.js';

const NOW = new Date('2026-11-21T12:00:00.000Z');
const START = new Date('2026-11-24T00:00:00.000Z');
const END = new Date('2026-11-27T00:00:00.000Z');

function fakeDb(bookings) {
  return {
    collection(name) {
      assert.equal(name, 'bookings');
      return {
        find(query) {
          const rows = bookings.filter((doc) => matchQuery(doc, query));
          return { toArray: async () => rows };
        },
      };
    },
  };
}

function matchValue(value, cond) {
  if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
    return Object.entries(cond).every(([op, operand]) => {
      if (op === '$lte') return value <= operand;
      if (op === '$gte') return value >= operand;
      if (op === '$gt') return value > operand;
      if (op === '$in') return operand.includes(value);
      throw new Error(`unsupported operator ${op}`);
    });
  }
  return value === cond;
}

function matchQuery(doc, query) {
  return Object.entries(query).every(([key, cond]) => {
    if (key === '$or') return cond.some((sub) => matchQuery(doc, sub));
    return matchValue(doc[key], cond);
  });
}

function equipment(quantity = 5) {
  return { _id: 'eq-001', quantity };
}

test('an overlapping paid confirmed booking reduces availability', async () => {
  const db = fakeDb([
    {
      equipmentId: 'eq-001',
      startDate: new Date('2026-11-24T00:00:00.000Z'),
      endDate: new Date('2026-11-26T00:00:00.000Z'),
      quantity: 2,
      paymentStatus: 'paid',
      status: 'confirmed',
    },
  ]);
  assert.equal(await getAvailableQuantity(db, equipment(), START, END, NOW), 3);
});

test('an unpaid booking with an expired hold does not count', async () => {
  const db = fakeDb([
    {
      equipmentId: 'eq-001',
      startDate: START,
      endDate: END,
      quantity: 2,
      paymentStatus: 'unpaid',
      status: 'pending',
      holdExpiresAt: new Date('2026-11-21T11:00:00.000Z'),
    },
  ]);
  assert.equal(await getAvailableQuantity(db, equipment(), START, END, NOW), 5);
});

test('an unpaid booking with an unexpired hold counts', async () => {
  const db = fakeDb([
    {
      equipmentId: 'eq-001',
      startDate: START,
      endDate: END,
      quantity: 2,
      paymentStatus: 'unpaid',
      status: 'pending',
      holdExpiresAt: new Date('2026-11-21T13:00:00.000Z'),
    },
  ]);
  assert.equal(await getAvailableQuantity(db, equipment(), START, END, NOW), 3);
});

test('a booking that only touches the range on the same end day counts', async () => {
  const db = fakeDb([
    {
      equipmentId: 'eq-001',
      startDate: new Date('2026-11-20T00:00:00.000Z'),
      endDate: new Date('2026-11-24T00:00:00.000Z'),
      quantity: 1,
      paymentStatus: 'paid',
      status: 'confirmed',
    },
  ]);
  assert.equal(await getAvailableQuantity(db, equipment(), START, END, NOW), 4);
});

test('a cancelled booking does not count', async () => {
  const db = fakeDb([
    {
      equipmentId: 'eq-001',
      startDate: START,
      endDate: END,
      quantity: 4,
      paymentStatus: 'paid',
      status: 'cancelled',
    },
  ]);
  assert.equal(await getAvailableQuantity(db, equipment(), START, END, NOW), 5);
});
