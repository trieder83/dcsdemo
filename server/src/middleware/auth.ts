import { Request, Response, NextFunction } from 'express';
import { db } from '../models/database.js';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const keyInfo = db.prepare(`
    SELECT r.name as role_name
    FROM key_management km
    JOIN roles r ON km.role_id = r.id
    WHERE km.user_id = ?
  `).get(req.session.userId) as { role_name: string } | undefined;

  if (keyInfo?.role_name !== 'admin-role') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const keyInfo = db.prepare(`
      SELECT r.name as role_name
      FROM key_management km
      JOIN roles r ON km.role_id = r.id
      WHERE km.user_id = ?
    `).get(req.session.userId) as { role_name: string } | undefined;

    if (!keyInfo || !allowedRoles.includes(keyInfo.role_name)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
}
