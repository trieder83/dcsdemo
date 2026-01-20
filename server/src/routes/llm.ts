import { Router } from 'express';
import { db, logAudit } from '../models/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

interface LlmSettings {
  id: number;
  user_id: number;
  provider: string;
  endpoint: string | null;
  encrypted_api_key: string | null;
}

// GET /api/llm/settings - Get user's LLM settings
router.get('/settings', requireAuth, (req, res) => {
  try {
    const settings = db.prepare(`
      SELECT id, user_id, provider, endpoint, encrypted_api_key
      FROM llm_settings
      WHERE user_id = ?
    `).get(req.session.userId) as LlmSettings | undefined;

    if (!settings) {
      return res.json({
        provider: 'gemini',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        hasApiKey: false
      });
    }

    res.json({
      provider: settings.provider,
      endpoint: settings.endpoint || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      hasApiKey: !!settings.encrypted_api_key,
      encryptedApiKey: settings.encrypted_api_key
    });
  } catch (error) {
    console.error('Get LLM settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/llm/settings - Update user's LLM settings
router.put('/settings', requireAuth, (req, res) => {
  try {
    const { provider, endpoint, encryptedApiKey } = req.body;

    if (!encryptedApiKey) {
      return res.status(400).json({ error: 'encryptedApiKey is required' });
    }

    // Check if settings exist
    const existing = db.prepare('SELECT id FROM llm_settings WHERE user_id = ?')
      .get(req.session.userId);

    if (existing) {
      db.prepare(`
        UPDATE llm_settings
        SET provider = ?, endpoint = ?, encrypted_api_key = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(provider || 'gemini', endpoint || null, encryptedApiKey, req.session.userId);
    } else {
      db.prepare(`
        INSERT INTO llm_settings (user_id, provider, endpoint, encrypted_api_key)
        VALUES (?, ?, ?, ?)
      `).run(req.session.userId, provider || 'gemini', endpoint || null, encryptedApiKey);
    }

    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    logAudit({
      action: 'LLM_SETTINGS_UPDATE',
      userId: req.session.userId,
      details: `User ${req.session.username} updated LLM settings`,
      ipAddress,
      success: true
    });

    res.json({ message: 'LLM settings updated' });
  } catch (error) {
    console.error('Update LLM settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/llm/ask - Proxy call to LLM (API key is sent encrypted from client, decrypted there)
// The actual LLM call happens client-side to keep the decrypted API key in the browser
// This endpoint just logs the action for audit purposes
router.post('/ask/log', requireAuth, (req, res) => {
  try {
    const { dataType, recordId } = req.body;

    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    logAudit({
      action: 'LLM_ASK',
      userId: req.session.userId,
      details: `User ${req.session.username} asked LLM about ${dataType} record ${recordId}`,
      ipAddress,
      success: true
    });

    res.json({ message: 'Logged' });
  } catch (error) {
    console.error('Log LLM ask error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
