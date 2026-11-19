import { MongoClient } from 'mongodb';

const DB_NAME = process.env.DB_NAME || 'equipra';

const EQUIPMENT_INDEXES = [
  { key: { status: 1, createdAt: -1 } },
  { key: { status: 1, category: 1 } },
  { key: { status: 1, price: 1 } },
  { key: { 'owner.id': 1 } },
];

const BOOKING_INDEXES = [
  { key: { equipmentId: 1, startDate: 1, endDate: 1 } },
  { key: { 'customer.id': 1, createdAt: -1 } },
  { key: { 'owner.id': 1, createdAt: -1 } },
  { key: { status: 1, endDate: 1 } },
];

export async function ensureIndexes(db) {
  await Promise.all([
    ...EQUIPMENT_INDEXES.map((index) => db.collection('equipment').createIndex(index.key)),
    ...BOOKING_INDEXES.map((index) => db.collection('bookings').createIndex(index.key)),
    db.collection('favorites').createIndex({ userId: 1, equipmentId: 1 }, { unique: true }),
    db.collection('payments').createIndex({ sessionId: 1 }, { unique: true }),
  ]);
}

async function connect() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set');
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();

  const db = client.db(DB_NAME);
  await ensureIndexes(db);

  return client;
}

// Vercel reuses warm invocations, so the connection is cached on globalThis
// instead of per-module state that would open a new pool on every request.
export function getClient() {
  if (!globalThis._mongo) {
    globalThis._mongo = connect().catch((error) => {
      globalThis._mongo = undefined;
      throw error;
    });
  }

  return globalThis._mongo;
}

export async function getDb() {
  const client = await getClient();
  return client.db(DB_NAME);
}
