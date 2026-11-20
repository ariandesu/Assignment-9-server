import { getDb } from '../lib/db.js';
import { byEquipmentId } from '../utils/equipmentQuery.js';
import { validateEquipmentBody } from '../utils/equipmentValidation.js';
import { formatEquipmentDoc } from './equipment.controller.js';

export async function createEquipment(req, res, next) {
  try {
    const error = validateEquipmentBody(req.body, false);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const db = await getDb();
    const now = new Date();

    const doc = {
      name: req.body.name.trim(),
      description: req.body.description.trim(),
      category: req.body.category,
      location: req.body.location.trim(),
      price: Number(req.body.price),
      rentalType: req.body.rentalType,
      quantity: Number(req.body.quantity),
      condition: req.body.condition.trim(),
      brand: req.body.brand.trim(),
      model: req.body.model.trim(),
      image: req.body.image.trim(),
      imagePosition: typeof req.body.imagePosition === 'string' ? req.body.imagePosition.trim() : undefined,
      terms: req.body.terms.trim(),
      status: 'pending',
      owner: {
        id: req.user.id,
        name: req.user.name || '',
        email: req.user.email || '',
        image: req.user.image || null,
      },
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('equipment').insertOne(doc);
    doc._id = result.insertedId;

    res.status(201).json({ data: formatEquipmentDoc(doc) });
  } catch (err) {
    next(err);
  }
}

export async function getMyEquipmentList(req, res, next) {
  try {
    const db = await getDb();
    const query = { 'owner.id': req.user.id };

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

export async function getEquipmentById(req, res, next) {
  try {
    const db = await getDb();
    const doc = await db.collection('equipment').findOne(byEquipmentId(req.params.id));

    if (!doc) {
      return res.status(404).json({ message: 'Equipment not found' });
    }

    // Visibility rules: approved -> anyone logged in; pending/rejected -> only owner or admin
    if (doc.status !== 'approved') {
      const isOwner = doc.owner?.id === req.user?.id;
      const isAdmin = req.user?.role === 'admin';
      if (!isOwner && !isAdmin) {
        return res.status(404).json({ message: 'Equipment not found' });
      }
    }

    res.json({ data: formatEquipmentDoc(doc) });
  } catch (err) {
    next(err);
  }
}

export async function updateEquipment(req, res, next) {
  try {
    const error = validateEquipmentBody(req.body, true);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const db = await getDb();
    const doc = await db.collection('equipment').findOne(byEquipmentId(req.params.id));

    if (!doc) {
      return res.status(404).json({ message: 'Equipment not found' });
    }

    // Ownership check: owner can only edit their own equipment
    if (req.user.role !== 'admin' && doc.owner?.id !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const whitelist = [
      'name', 'description', 'category', 'location', 'price',
      'rentalType', 'quantity', 'condition', 'brand', 'model',
      'image', 'imagePosition', 'terms',
    ];

    const updates = {};
    for (const f of whitelist) {
      if (req.body[f] !== undefined) {
        if (f === 'price' || f === 'quantity') {
          updates[f] = Number(req.body[f]);
        } else if (typeof req.body[f] === 'string') {
          updates[f] = req.body[f].trim();
        } else {
          updates[f] = req.body[f];
        }
      }
    }

    // Owner edits reset status to pending per 02 §5
    if (req.user.role !== 'admin') {
      updates.status = 'pending';
    }

    updates.updatedAt = new Date();

    await db.collection('equipment').updateOne({ _id: doc._id }, { $set: updates });
    const updated = await db.collection('equipment').findOne({ _id: doc._id });

    res.json({ data: formatEquipmentDoc(updated) });
  } catch (err) {
    next(err);
  }
}

export async function deleteEquipment(req, res, next) {
  try {
    const db = await getDb();
    const doc = await db.collection('equipment').findOne(byEquipmentId(req.params.id));

    if (!doc) {
      return res.status(404).json({ message: 'Equipment not found' });
    }

    if (req.user.role !== 'admin' && doc.owner?.id !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // 02 §5: Refuse (409) if it has upcoming paid bookings
    const eqIdStr = doc._id.toString();
    const hasUpcomingPaidBooking = await db.collection('bookings').findOne({
      $or: [{ equipmentId: doc._id }, { equipmentId: eqIdStr }],
      paymentStatus: 'paid',
      status: { $in: ['pending', 'confirmed'] },
      endDate: { $gte: new Date().toISOString().slice(0, 10) },
    });

    if (hasUpcomingPaidBooking) {
      return res.status(409).json({ message: 'This equipment has upcoming paid bookings' });
    }

    await db.collection('equipment').deleteOne({ _id: doc._id });
    res.json({ data: { id: req.params.id } });
  } catch (err) {
    next(err);
  }
}
