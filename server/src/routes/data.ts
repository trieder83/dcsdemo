import { Router } from 'express';
import { db, logAudit } from '../models/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/data - Get all weight records with member info, sorted with deleted at end
router.get('/', requireAuth, (req, res) => {
  try {
    const data = db.prepare(`
      SELECT
        d.id,
        d.member_id,
        d.weight,
        d.date,
        d.deleted,
        d.created_at,
        m.name as member_name,
        m.surname as member_surname
      FROM data d
      LEFT JOIN members m ON d.member_id = m.id
      ORDER BY
        CASE WHEN d.deleted IS NULL THEN 0 ELSE 1 END,
        d.date DESC,
        d.created_at DESC
    `).all();
    res.json(data);
  } catch (error) {
    console.error('Get data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/data - Add new weight record
router.post('/', requireAuth, requireRole(['admin-role', 'user-role']), (req, res) => {
  try {
    const { memberId, weight, date } = req.body;

    if (!memberId) {
      return res.status(400).json({ error: 'Member ID is required' });
    }
    if (weight === undefined || weight === null) {
      return res.status(400).json({ error: 'Weight is required' });
    }
    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }

    // Verify member exists
    const member = db.prepare('SELECT id FROM members WHERE id = ? AND deleted IS NULL').get(memberId);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const result = db.prepare('INSERT INTO data (member_id, weight, date) VALUES (?, ?, ?)')
      .run(memberId, weight, date);

    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    logAudit({
      action: 'WEIGHT_CREATE',
      userId: req.session.userId,
      details: `User ${req.session.username} created weight record for member ${memberId}: ${weight}kg on ${date}`,
      ipAddress,
      success: true
    });

    res.status(201).json({
      message: 'Weight record created',
      id: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Create data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/data/:id - Soft delete a weight record
router.delete('/:id', requireAuth, requireRole(['admin-role', 'user-role']), (req, res) => {
  try {
    const { id } = req.params;
    const deletedAt = new Date().toISOString();

    const result = db.prepare('UPDATE data SET deleted = ? WHERE id = ? AND deleted IS NULL')
      .run(deletedAt, id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Weight record not found or already deleted' });
    }

    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    logAudit({
      action: 'WEIGHT_DELETE',
      userId: req.session.userId,
      details: `User ${req.session.username} deleted weight record id: ${id}`,
      ipAddress,
      success: true
    });

    res.json({ message: 'Weight record deleted', deletedAt });
  } catch (error) {
    console.error('Delete data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
