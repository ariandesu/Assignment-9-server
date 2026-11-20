import { getDb } from '../lib/db.js';
import { byUserId } from '../lib/userQuery.js';

const ALLOWED_ROLES = ['customer', 'owner', 'admin'];

// BetterAuth default (singular) collection names: user, session, account.
// Never project credential fields — password hashes live on `account`.
const USER_PROJECTION = {
  password: 0,
  passwordHash: 0,
  accessToken: 0,
  refreshToken: 0,
  idToken: 0,
};

export function formatUserDoc(doc) {
  if (!doc) return null;
  return {
    id: doc._id.toString(),
    name: doc.name || '',
    email: doc.email || '',
    image: doc.image || null,
    role: doc.role || 'customer',
    phone: doc.phone || '',
    address: doc.address || '',
    createdAt: doc.createdAt || null,
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listUsers(req, res, next) {
  try {
    const db = await getDb();
    const query = {};

    const search =
      typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 60) : '';
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      query.$or = [{ name: { $regex: pattern } }, { email: { $regex: pattern } }];
    }

    if (req.query.role) {
      if (!ALLOWED_ROLES.includes(req.query.role)) {
        return res.status(400).json({
          message: `role must be one of: ${ALLOWED_ROLES.join(', ')}`,
        });
      }
      query.role = req.query.role;
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(24, Math.max(1, parseInt(req.query.limit, 10) || 9));
    const skip = (page - 1) * limit;

    const [total, docs] = await Promise.all([
      db.collection('user').countDocuments(query),
      db
        .collection('user')
        .find(query, { projection: USER_PROJECTION })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
    ]);

    res.json({
      items: docs.map(formatUserDoc),
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateUserRole(req, res, next) {
  try {
    const { role } = req.body || {};
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({
        message: `role must be one of: ${ALLOWED_ROLES.join(', ')}`,
      });
    }

    if (String(req.params.id) === String(req.user.id)) {
      return res.status(403).json({ message: 'You cannot change your own role' });
    }

    const db = await getDb();
    const result = await db
      .collection('user')
      .updateOne(byUserId(req.params.id), { $set: { role, updatedAt: new Date() } });

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updated = await db
      .collection('user')
      .findOne(byUserId(req.params.id), { projection: USER_PROJECTION });

    res.json({ data: formatUserDoc(updated) });
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req, res, next) {
  try {
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(403).json({ message: 'You cannot delete your own account' });
    }

    const db = await getDb();
    const filter = byUserId(req.params.id);
    const user = await db.collection('user').findOne(filter, { projection: USER_PROJECTION });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // BetterAuth stores sessions and credentials in their own collections, so
    // they must be removed with the user or they linger as orphaned rows.
    const idVariants = [user._id];
    if (user.id) idVariants.push(user.id);
    const idStrings = idVariants.map((value) => String(value));

    await Promise.all([
      db.collection('session').deleteMany({ userId: { $in: [...idVariants, ...idStrings] } }),
      db.collection('account').deleteMany({ userId: { $in: [...idVariants, ...idStrings] } }),
      db.collection('favorites').deleteMany({ userId: { $in: idStrings } }),
      db.collection('user').deleteOne({ _id: user._id }),
    ]);

    res.json({ data: { id: String(req.params.id) } });
  } catch (err) {
    next(err);
  }
}
