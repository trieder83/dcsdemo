import { Router } from 'express';
import { db } from '../models/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/data - Get all data records (encrypted)
router.get('/', requireAuth, (req, res) => {
  try {
    const data = db.prepare('SELECT * FROM data ORDER BY created_at DESC').all();
    res.json(data);
  } catch (error) {
    console.error('Get data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/data - Add new data record
router.post('/', requireAuth, requireRole(['admin-role', 'user-role']), (req, res) => {
  try {
    const { key, value } = req.body;

    if (!key) {
      return res.status(400).json({ error: 'Key is required' });
    }

    const result = db.prepare('INSERT INTO data (key, value) VALUES (?, ?)').run(key, value);

    res.status(201).json({
      message: 'Data created',
      id: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Create data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
