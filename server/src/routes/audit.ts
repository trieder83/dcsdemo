import { Router } from 'express';
import { db } from '../models/database.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// GET /api/audit - Get audit logs (admin only)
router.get('/', requireAuth, requireAdmin, (req, res) => {
  try {
    const { limit = 100, offset = 0, action, userId } = req.query;

    let query = `
      SELECT
        al.id,
        al.action,
        al.user_id,
        al.target_user_id,
        al.details,
        al.ip_address,
        al.success,
        al.created_at,
        u1.username as actor_username,
        u2.username as target_username
      FROM audit_log al
      LEFT JOIN users u1 ON al.user_id = u1.id
      LEFT JOIN users u2 ON al.target_user_id = u2.id
    `;

    const params: any[] = [];
    const conditions: string[] = [];

    if (action) {
      conditions.push('al.action = ?');
      params.push(action);
    }

    if (userId) {
      conditions.push('(al.user_id = ? OR al.target_user_id = ?)');
      params.push(userId, userId);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const logs = db.prepare(query).all(...params);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM audit_log al';
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }
    const countParams = params.slice(0, -2); // Remove limit and offset
    const { total } = db.prepare(countQuery).get(...countParams) as { total: number };

    res.json({
      logs,
      total,
      limit: Number(limit),
      offset: Number(offset)
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/audit/actions - Get list of distinct actions
router.get('/actions', requireAuth, requireAdmin, (req, res) => {
  try {
    const actions = db.prepare('SELECT DISTINCT action FROM audit_log ORDER BY action').all();
    res.json(actions.map((a: any) => a.action));
  } catch (error) {
    console.error('Get audit actions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
