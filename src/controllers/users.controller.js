import { getDb } from '../lib/db.js';
import { byUserId } from '../lib/userQuery.js';
import { ObjectId } from 'mongodb';

function validateUpdate(body) {
  if (body.name !== undefined) {
    if (typeof body.name !== 'string') {
      return 'name must be a string';
    }
    const trimmed = body.name.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      return 'name must be between 2 and 80 characters';
    }
  }

  if (body.image !== undefined) {
    if (typeof body.image !== 'string') {
      return 'image must be a string';
    }
    const image = body.image.trim();
    if (image !== '') {
      let url;
      try {
        url = new URL(image);
      } catch {
        return 'image must be a valid URL';
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return 'image must use http: or https: protocol';
      }
      if (image.length > 500) {
        return 'image must be at most 500 characters';
      }
    }
  }

  if (body.phone !== undefined) {
    if (typeof body.phone !== 'string') {
      return 'phone must be a string';
    }
    const phone = body.phone.replace(/[\s-]/g, '');
    if (phone !== '') {
      if (!/^(?:\+?880|0)1[3-9]\d{8}$/.test(phone)) {
        return 'phone must be a valid Bangladesh number';
      }
    }
  }

  if (body.address !== undefined) {
    if (typeof body.address !== 'string') {
      return 'address must be a string';
    }
    if (body.address.trim().length > 200) {
      return 'address must be at most 200 characters';
    }
  }

  return null;
}

export async function getMe(req, res) {
  const db = await getDb();
  const user = await db.collection('user').findOne(
    byUserId(req.user.id),
    { projection: { password: 0 } }
  );

  if (!user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  res.json({
    data: {
      id: user._id.toString(),
      name: user.name || '',
      email: user.email || '',
      image: user.image || null,
      role: user.role || '',
      phone: user.phone || '',
      address: user.address || '',
      createdAt: user.createdAt || null,
    },
  });
}

export async function updateMe(req, res) {
  const error = validateUpdate(req.body);
  if (error) {
    return res.status(400).json({ message: error });
  }

  const db = await getDb();
  const userId = new ObjectId(byUserId(req.user.id)._id);

  const updates = {};
  for (const field of ['name', 'image', 'phone', 'address']) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field].trim();
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'No valid fields to update' });
  }

  if (updates.phone && typeof updates.phone === 'string') {
    const stripped = updates.phone.replace(/[\s-]/g, '');
    const match = stripped.match(/^(?:\+?880|0)1[3-9]\d{8}$/);
    if (match) {
      updates.phone = `+880${stripped.slice(-10)}`;
    }
  }

  updates.updatedAt = new Date();
  await db.collection('user').updateOne({ _id: userId }, { $set: updates });

  const updated = await db.collection('user').findOne({ _id: userId }, { projection: { password: 0 } });
  res.json({
    data: {
      id: updated._id.toString(),
      email: updated.email || '',
      role: updated.role || '',
      name: updated.name || '',
      image: updated.image || null,
      phone: updated.phone || '',
      address: updated.address || '',
      createdAt: updated.createdAt || null,
    },
  });
}
