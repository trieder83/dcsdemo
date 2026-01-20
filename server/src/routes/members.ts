import { Router } from 'express';
import { db, logAudit } from '../models/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/members - Get all members (encrypted PII), sorted with deleted at end
router.get('/', requireAuth, (req, res) => {
  try {
    const members = db.prepare(`
      SELECT * FROM members
      ORDER BY
        CASE WHEN deleted IS NULL THEN 0 ELSE 1 END,
        created_at DESC
    `).all();
    res.json(members);
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/members - Add new member record
router.post('/', requireAuth, requireRole(['admin-role', 'user-role']), (req, res) => {
  try {
    const { name, surname, birthdate, email, gender } = req.body;

    const result = db.prepare(`
      INSERT INTO members (name, surname, birthdate, email, gender)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, surname, birthdate, email, gender);

    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    logAudit({
      action: 'MEMBER_CREATE',
      userId: req.session.userId,
      details: `User ${req.session.username} created member record id: ${result.lastInsertRowid}`,
      ipAddress,
      success: true
    });

    res.status(201).json({
      message: 'Member created',
      id: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Create member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/members/:id - Soft delete a member record
router.delete('/:id', requireAuth, requireRole(['admin-role', 'user-role']), (req, res) => {
  try {
    const { id } = req.params;
    const deletedAt = new Date().toISOString();

    const result = db.prepare('UPDATE members SET deleted = ? WHERE id = ? AND deleted IS NULL')
      .run(deletedAt, id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Member not found or already deleted' });
    }

    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    logAudit({
      action: 'MEMBER_DELETE',
      userId: req.session.userId,
      details: `User ${req.session.username} deleted member id: ${id}`,
      ipAddress,
      success: true
    });

    res.json({ message: 'Member deleted', deletedAt });
  } catch (error) {
    console.error('Delete member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
