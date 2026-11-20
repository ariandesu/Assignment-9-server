import { ObjectId } from 'mongodb';
import { getDb } from '../lib/db.js';
import { formatEquipmentDoc } from './equipment.controller.js';

function parseEquipmentId(raw) {
  if (!raw) return null;
  const str = String(raw);
  if (ObjectId.isValid(str)) return new ObjectId(str);
  return null;
}

export async function listFavorites(req, res, next) {
  try {
    const db = await getDb();
    const favorites = await db
      .collection('favorites')
      .find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    const ids = favorites.map((f) => f.equipmentId).filter(Boolean);

    if (ids.length === 0) {
      return res.json({ items: [], total: 0, page: 1, pages: 0 });
    }

    const docs = await db
      .collection('equipment')
      .find({ _id: { $in: ids } })
      .toArray();

    // Preserve favorite insertion (newest first) order
    const docMap = new Map(docs.map((d) => [d._id.toString(), d]));
    const ordered = ids.map((id) => docMap.get(id.toString())).filter(Boolean);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(24, Math.max(1, parseInt(req.query.limit, 10) || 9));
    const total = ordered.length;
    const skip = (page - 1) * limit;

    const items = ordered.slice(skip, skip + limit).map(formatEquipmentDoc);

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

export async function getFavoriteIds(req, res, next) {
  try {
    const db = await getDb();
    const favorites = await db
      .collection('favorites')
      .find({ userId: req.user.id })
      .toArray();

    const data = favorites.map((f) => f.equipmentId.toString()).filter(Boolean);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function addFavorite(req, res, next) {
  try {
    const equipmentId = parseEquipmentId(req.body?.equipmentId);

    if (!equipmentId) {
      return res.status(400).json({ message: 'A valid equipmentId is required' });
    }

    const db = await getDb();
    const equipment = await db.collection('equipment').findOne({ _id: equipmentId });

    if (!equipment) {
      return res.status(404).json({ message: 'Equipment not found' });
    }

    // Idempotent upsert
    await db.collection('favorites').updateOne(
      { userId: req.user.id, equipmentId },
      { $setOnInsert: { userId: req.user.id, equipmentId, createdAt: new Date() } },
      { upsert: true }
    );

    res.json({ data: { equipmentId: equipmentId.toString(), favorited: true } });
  } catch (err) {
    next(err);
  }
}

export async function removeFavorite(req, res, next) {
  try {
    const equipmentId = parseEquipmentId(req.params.equipmentId);

    if (!equipmentId) {
      return res.status(400).json({ message: 'A valid equipmentId is required' });
    }

    const db = await getDb();
    await db.collection('favorites').deleteOne({
      userId: req.user.id,
      equipmentId,
    });

    res.json({ data: { equipmentId: equipmentId.toString(), favorited: false } });
  } catch (err) {
    next(err);
  }
}
