import { getDb } from '../lib/db.js';
import { ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';

function getAuthConfig() {
  const secret = process.env.JWT_SECRET;
  const issuer = process.env.JWT_ISSUER;
  const audience = process.env.JWT_AUDIENCE;

  if (!secret || !issuer || !audience) {
    return null;
  }

  return { secret, issuer, audience };
}

export async function verifyToken(req, res, next) {
  const config = getAuthConfig();
  if (!config) {
    return res.status(503).json({
      message: 'Token verification is not configured',
      code: 'TOKEN_MISCONFIGURED',
    });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = authHeader.slice(7).trim();

  try {
    const decoded = jwt.verify(token, config.secret, {
      algorithms: ['HS256'],
      issuer: config.issuer,
      audience: config.audience,
    });

    const db = await getDb();
    const userId = decoded.sub;

    // Handle both ObjectId and string ids — check what BetterAuth stored
    let user;
    if (ObjectId.isValid(userId)) {
      user = await db.collection('user').findOne({ _id: new ObjectId(userId) });
    } else {
      user = await db.collection('user').findOne({ _id: userId });
    }

    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
      image: user.image,
    };

    next();
  } catch (err) {
    if (
      err.name === 'JsonWebTokenError' ||
      err.name === 'TokenExpiredError' ||
      err.name === 'NotBeforeError'
    ) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    next(err);
  }
}
