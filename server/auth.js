import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-quiet-diary-key-2026';

export function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Admin authentication required.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired session token.' });
  }
}

export function loginUser(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return { success: false, error: 'Invalid credentials.' };
  }

  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) {
    return { success: false, error: 'Invalid credentials.' };
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: 'admin' },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  return {
    success: true,
    token,
    user: { id: user.id, username: user.username }
  };
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}
