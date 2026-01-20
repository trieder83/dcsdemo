import { Router } from 'express';
import { db, logAudit } from '../models/database.js';
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
  const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = db.prepare(
      'SELECT id, username, password_hash, is_active FROM users WHERE username = ?'
    ).get(username) as { id: number; username: string; password_hash: string; is_active: number } | undefined;

    if (!user || !user.is_active) {
      logAudit({
        action: 'LOGIN_FAILED',
        details: `Failed login attempt for username: ${username} (user not found or inactive)`,
        ipAddress,
        success: false
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      logAudit({
        action: 'LOGIN_FAILED',
        userId: user.id,
        details: `Failed login attempt for username: ${username} (wrong password)`,
        ipAddress,
        success: false
      });
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

    logAudit({
      action: 'LOGIN',
      userId: user.id,
      details: `User ${username} logged in successfully`,
      ipAddress,
      success: true
    });

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
  const userId = req.session.userId;
  const username = req.session.username;
  const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }

    if (userId) {
      logAudit({
        action: 'LOGOUT',
        userId,
        details: `User ${username} logged out`,
        ipAddress,
        success: true
      });
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

// POST /api/auth/change-password
router.post('/change-password', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { currentPassword, newPassword, newEncryptedPrivateKey } = req.body;

    if (!currentPassword || !newPassword || !newEncryptedPrivateKey) {
      return res.status(400).json({ error: 'currentPassword, newPassword, and newEncryptedPrivateKey required' });
    }

    // Verify current password
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(req.session.userId) as { password_hash: string } | undefined;

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password and update
    const newPasswordHash = await hashPassword(newPassword);

    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(newPasswordHash, req.session.userId);

    // Update encrypted private key with new KEK encryption
    db.prepare('UPDATE key_management SET encrypted_private_key = ? WHERE user_id = ?')
      .run(newEncryptedPrivateKey, req.session.userId);

    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    logAudit({
      action: 'PASSWORD_CHANGE',
      userId: req.session.userId,
      details: `User ${req.session.username} changed their password`,
      ipAddress,
      success: true
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
