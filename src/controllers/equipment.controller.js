import { ObjectId } from 'mongodb';
import { getDb } from '../lib/db.js';
import { byEquipmentId } from '../utils/equipmentQuery.js';
import { getAvailableQuantity } from '../utils/availability.js';
import { parseBookingDates } from '../utils/bookingValidation.js';

export const STANDARD_CATEGORIES = [
  'Construction Equipment',
  'Photography Equipment',
  'Vehicles & Transportation',
  'Agriculture Equipment',
  'Electronics',
  'Event Equipment',
];

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function formatEquipmentDoc(doc) {
  if (!doc) return null;
  return {
    id: doc._id.toString(),
    name: doc.name || '',
    description: doc.description || '',
    category: doc.category || '',
    location: doc.location || '',
    price: doc.price || 0,
    rentalType: doc.rentalType || 'daily',
    quantity: doc.quantity ?? 0,
    condition: doc.condition || '',
    brand: doc.brand || '',
    model: doc.model || '',
    image: doc.image || '',
    imagePosition: doc.imagePosition || undefined,
    terms: doc.terms || '',
    status: doc.status || 'pending',
    owner: doc.owner || {},
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

export async function listPublicEquipment(req, res, next) {
  try {
    const db = await getDb();
    const query = { status: 'approved' };

    // Search: regex-escaped, max 60 chars, case-insensitive
    const rawSearch = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 60) : '';
    if (rawSearch) {
      const pattern = new RegExp(escapeRegex(rawSearch), 'i');
      query.$or = [
        { name: { $regex: pattern } },
        { location: { $regex: pattern } },
        { category: { $regex: pattern } },
      ];
    }

    if (req.query.category) {
      query.category = req.query.category;
    }

    if (req.query.rentalType) {
      query.rentalType = req.query.rentalType;
    }

    if (req.query.minPrice !== undefined && req.query.minPrice !== '') {
      const min = Number(req.query.minPrice);
      if (!Number.isNaN(min)) {
        query.price = { ...(query.price || {}), $gte: min };
      }
    }

    if (req.query.maxPrice !== undefined && req.query.maxPrice !== '') {
      const max = Number(req.query.maxPrice);
      if (!Number.isNaN(max)) {
        query.price = { ...(query.price || {}), $lte: max };
      }
    }

    if (req.query.availability === 'available') {
      query.quantity = { $gt: 0 };
    } else if (req.query.availability === 'unavailable') {
      query.quantity = 0;
    }

    // Sort options: price_asc, price_desc, default newest
    let sort = { createdAt: -1 };
    if (req.query.sort === 'price_asc') {
      sort = { price: 1 };
    } else if (req.query.sort === 'price_desc') {
      sort = { price: -1 };
    }

    // Pagination: page >= 1, limit 1..24, default 9
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(24, Math.max(1, parseInt(req.query.limit, 10) || 9));
    const skip = (page - 1) * limit;

    const [total, docs] = await Promise.all([
      db.collection('equipment').countDocuments(query),
      db.collection('equipment').find(query).sort(sort).skip(skip).limit(limit).toArray(),
    ]);

    const items = docs.map(formatEquipmentDoc);

    res.json({
      items,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    next(err);
  }
}

export async function getFeaturedEquipment(req, res, next) {
  try {
    const db = await getDb();
    const docs = await db.collection('equipment').aggregate([
      { $match: { status: 'approved' } },
      { $sort: { createdAt: -1 } },
      { $limit: 6 },
    ]).toArray();

    const data = docs.map(formatEquipmentDoc);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getCategoryCounts(req, res, next) {
  try {
    const db = await getDb();
    const rows = await db.collection('equipment').aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]).toArray();

    const countsMap = {};
    for (const cat of STANDARD_CATEGORIES) {
      countsMap[cat] = 0;
    }
    for (const r of rows) {
      if (r._id) countsMap[r._id] = r.count;
    }

    const data = STANDARD_CATEGORIES.map((category) => ({
      category,
      count: countsMap[category] || 0,
    }));

    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getEquipmentAvailability(req, res, next) {
  try {
    if (!ObjectId.isValid(String(req.params.id))) {
      return res.status(400).json({ message: 'A valid equipment id is required' });
    }

    const dates = parseBookingDates(req.query.start, req.query.end);
    if (dates.error) {
      return res.status(400).json({ message: dates.error });
    }

    const db = await getDb();
    const doc = await db.collection('equipment').findOne(byEquipmentId(req.params.id));

    if (!doc) {
      return res.status(404).json({ message: 'Equipment not found' });
    }

    // Same visibility as getEquipmentById: approved -> anyone logged in;
    // pending/rejected -> only its owner or admin.
    if (doc.status !== 'approved') {
      const isOwner = doc.owner?.id === req.user?.id;
      const isAdmin = req.user?.role === 'admin';
      if (!isOwner && !isAdmin) {
        return res.status(404).json({ message: 'Equipment not found' });
      }
    }

    const available = await getAvailableQuantity(db, doc, dates.startDate, dates.endDate);
    res.json({ data: { available, total: Number(doc.quantity) || 0 } });
  } catch (err) {
    next(err);
  }
}
