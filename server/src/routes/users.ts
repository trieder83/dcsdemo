import { Router } from 'express';
import { db, logAudit } from '../models/database.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { hashPassword } from '../utils/crypto.js';

const router = Router();

// GET /api/users - List all users (encrypted PII)
router.get('/', requireAuth, (req, res) => {
  try {
    const users = db.prepare(`
      SELECT u.id, u.username, u.name, u.surname, u.birthdate, u.email, u.is_active, u.created_at,
             r.name as role_name
      FROM users u
      LEFT JOIN key_management km ON u.id = km.user_id
      LEFT JOIN roles r ON km.role_id = r.id
    `).all();

    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users - Create new user
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password, name, surname, birthdate, email, roleId, publicKey } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const passwordHash = await hashPassword(password);

    const result = db.prepare(`
      INSERT INTO users (username, password_hash, name, surname, birthdate, email)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(username, passwordHash, name, surname, birthdate, email);

    const userId = result.lastInsertRowid;

    // Role defaults to view-role if not specified
    const role = db.prepare('SELECT id FROM roles WHERE name = ?')
      .get(roleId ? roleId : 'view-role') as { id: number };

    db.prepare(`
      INSERT INTO key_management (user_id, role_id, public_key)
      VALUES (?, ?, ?)
    `).run(userId, role.id, publicKey || '');

    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    logAudit({
      action: 'USER_CREATE',
      userId: req.session.userId,
      targetUserId: userId as number,
      details: `Created user ${username} with role ${roleId || 'view-role'}`,
      ipAddress,
      success: true
    });

    res.status(201).json({
      message: 'User created',
      userId
    });
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
