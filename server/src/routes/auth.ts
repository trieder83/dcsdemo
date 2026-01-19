import { Router } from 'express';
import { db } from '../models/database.js';
import { hashPassword, verifyPassword } from '../utils/crypto.js';

const router = Router();

// Extend session type
declare module 'express-session' {
  interface SessionData {
    userId: number;
    username: string;
  }
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = db.prepare(
      'SELECT id, username, password_hash, is_active FROM users WHERE username = ?'
    ).get(username) as { id: number; username: string; password_hash: string; is_active: number } | undefined;

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Get user's role
    const keyInfo = db.prepare(`
      SELECT r.name as role_name
      FROM key_management km
      JOIN roles r ON km.role_id = r.id
      WHERE km.user_id = ?
    `).get(user.id) as { role_name: string } | undefined;

    req.session.userId = user.id;
    req.session.username = user.username;

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        role: keyInfo?.role_name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logout successful' });
  });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const keyInfo = db.prepare(`
    SELECT r.name as role_name
    FROM key_management km
    JOIN roles r ON km.role_id = r.id
    WHERE km.user_id = ?
  `).get(req.session.userId) as { role_name: string } | undefined;

  res.json({
    user: {
      id: req.session.userId,
      username: req.session.username,
      role: keyInfo?.role_name
    }
  });
});

export default router;
