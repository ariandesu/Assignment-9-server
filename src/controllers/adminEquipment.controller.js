import { getDb } from '../lib/db.js';
import { byEquipmentId } from '../utils/equipmentQuery.js';
import { formatEquipmentDoc } from './equipment.controller.js';

const ALLOWED_STATUS_FILTERS = ['pending', 'approved', 'rejected'];
const ALLOWED_STATUS_UPDATES = ['approved', 'rejected'];

export async function listAdminEquipment(req, res, next) {
  try {
    const db = await getDb();
    const query = {};

    if (req.query.status) {
      if (!ALLOWED_STATUS_FILTERS.includes(req.query.status)) {
        return res.status(400).json({
          message: `status filter must be one of: ${ALLOWED_STATUS_FILTERS.join(', ')}`,
        });
      }
      query.status = req.query.status;
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(24, Math.max(1, parseInt(req.query.limit, 10) || 9));
    const skip = (page - 1) * limit;

    const [total, docs] = await Promise.all([
      db.collection('equipment').countDocuments(query),
      db.collection('equipment').find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
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

export async function updateAdminEquipmentStatus(req, res, next) {
  try {
    const { status } = req.body || {};

    if (!ALLOWED_STATUS_UPDATES.includes(status)) {
      return res.status(400).json({
        message: `status must be one of: ${ALLOWED_STATUS_UPDATES.join(', ')}`,
      });
    }

    const db = await getDb();
    const doc = await db.collection('equipment').findOne(byEquipmentId(req.params.id));

    if (!doc) {
      return res.status(404).json({ message: 'Equipment not found' });
    }

    await db.collection('equipment').updateOne(
      { _id: doc._id },
      { $set: { status, updatedAt: new Date() } }
    );

    const updated = await db.collection('equipment').findOne({ _id: doc._id });
    res.json({ data: formatEquipmentDoc(updated) });
  } catch (err) {
    next(err);
  }
}
