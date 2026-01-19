import { Router } from 'express';
import { db } from '../models/database.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// GET /api/keys/:userId - Get wrapped data key for user
router.get('/:userId', requireAuth, (req, res) => {
  try {
    const { userId } = req.params;

    // Users can only get their own key, unless admin
    const keyInfo = db.prepare(`
      SELECT r.name as role_name
      FROM key_management km
      JOIN roles r ON km.role_id = r.id
      WHERE km.user_id = ?
    `).get(req.session.userId) as { role_name: string } | undefined;

    if (keyInfo?.role_name !== 'admin-role' && Number(userId) !== req.session.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const key = db.prepare(`
      SELECT km.id, km.user_id, km.role_id, km.public_key, km.encrypted_private_key,
             km.wrapped_data_key, r.name as role_name
      FROM key_management km
      JOIN roles r ON km.role_id = r.id
      WHERE km.user_id = ?
    `).get(userId);

    if (!key) {
      return res.status(404).json({ error: 'Key not found' });
    }

    res.json(key);
  } catch (error) {
    console.error('Get key error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/keys/grant - Grant access (wrap data key for new user)
router.post('/grant', requireAuth, requireAdmin, (req, res) => {
  try {
    const { userId, wrappedDataKey } = req.body;

    if (!userId || !wrappedDataKey) {
      return res.status(400).json({ error: 'userId and wrappedDataKey required' });
    }

    db.prepare('UPDATE key_management SET wrapped_data_key = ? WHERE user_id = ?')
      .run(wrappedDataKey, userId);

    res.json({ message: 'Access granted' });
  } catch (error) {
    console.error('Grant access error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/keys/roles/list - Get all roles
router.get('/roles/list', requireAuth, (req, res) => {
  try {
    const roles = db.prepare('SELECT * FROM roles').all();
    res.json(roles);
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/keys/system/has-data-key - Check if system has a valid data key
router.get('/system/has-data-key', requireAuth, (req, res) => {
  try {
    // Check if any user has a real wrapped data key (not placeholder)
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM key_management
      WHERE wrapped_data_key IS NOT NULL
      AND wrapped_data_key != 'SEED_WRAPPED_KEY_PLACEHOLDER'
      AND wrapped_data_key != ''
    `).get() as { count: number };

    res.json({ hasDataKey: result.count > 0 });
  } catch (error) {
    console.error('Check data key error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/keys/reset/:userId - Admin resets a user's keys (for lost keys recovery)
router.delete('/reset/:userId', requireAuth, requireAdmin, (req, res) => {
  try {
    const { userId } = req.params;

    // Clear the user's public key and wrapped data key
    db.prepare(`
      UPDATE key_management
      SET public_key = '', wrapped_data_key = ''
      WHERE user_id = ?
    `).run(userId);

    res.json({ message: 'User keys reset. User must set up keys again.' });
  } catch (error) {
    console.error('Reset keys error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/keys/setup - Set up user's own keys (first login or new device)
router.put('/setup', requireAuth, (req, res) => {
  try {
    const { publicKey, encryptedPrivateKey, wrappedDataKey } = req.body;
    const userId = req.session.userId;

    if (!publicKey || !encryptedPrivateKey) {
      return res.status(400).json({ error: 'publicKey and encryptedPrivateKey required' });
    }

    // Check if user already has keys
    const existing = db.prepare(`
      SELECT public_key, encrypted_private_key, wrapped_data_key FROM key_management WHERE user_id = ?
    `).get(userId) as { public_key: string; encrypted_private_key: string; wrapped_data_key: string } | undefined;

    const hasExistingKeys = existing &&
        existing.encrypted_private_key &&
        existing.encrypted_private_key !== '';

    // If user already has encrypted_private_key, they're setting up on a new device
    // This is allowed - same password will decrypt the same private key on any device
    // But we should NOT overwrite their keys - instead, return what's already there
    if (hasExistingKeys) {
      // User has existing keys - return them so client can use password to decrypt
      return res.json({
        message: 'Keys already exist',
        existing: true,
        encrypted_private_key: existing.encrypted_private_key,
        public_key: existing.public_key,
        wrapped_data_key: existing.wrapped_data_key
      });
    }

    // New user - store their keys
    if (wrappedDataKey) {
      // User is setting up with data key (first admin)
      db.prepare(`
        UPDATE key_management
        SET public_key = ?, encrypted_private_key = ?, wrapped_data_key = ?
        WHERE user_id = ?
      `).run(publicKey, encryptedPrivateKey, wrappedDataKey, userId);
    } else {
      // User is just setting up keys (waiting for access grant)
      db.prepare(`
        UPDATE key_management
        SET public_key = ?, encrypted_private_key = ?
        WHERE user_id = ?
      `).run(publicKey, encryptedPrivateKey, userId);
    }

    res.json({ message: 'Keys set up successfully', existing: false });
  } catch (error) {
    console.error('Setup keys error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
