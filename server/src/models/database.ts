import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data.db');
export const db = new Database(dbPath);

export function initDatabase() {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create roles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);

  // Create users table (PII fields are encrypted)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT,
      surname TEXT,
      birthdate TEXT,
      email TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create data table (weight measurements linked to members)
  db.exec(`
    CREATE TABLE IF NOT EXISTS data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      weight REAL NOT NULL,
      date TEXT NOT NULL,
      deleted TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_id) REFERENCES members(id)
    )
  `);

  // Create members table (PII fields are encrypted)
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      surname TEXT,
      birthdate TEXT,
      email TEXT,
      gender TEXT,
      deleted TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create key_management table
  db.exec(`
    CREATE TABLE IF NOT EXISTS key_management (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      role_id INTEGER NOT NULL,
      public_key TEXT NOT NULL,
      encrypted_private_key TEXT,
      wrapped_data_key TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (role_id) REFERENCES roles(id)
    )
  `);

  // Create audit_log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      user_id INTEGER,
      target_user_id INTEGER,
      details TEXT,
      ip_address TEXT,
      success INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (target_user_id) REFERENCES users(id)
    )
  `);

  // Create llm_settings table (stores encrypted API keys per user)
  db.exec(`
    CREATE TABLE IF NOT EXISTS llm_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      provider TEXT NOT NULL DEFAULT 'gemini',
      endpoint TEXT,
      encrypted_api_key TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Migration: add encrypted_private_key column if it doesn't exist
  try {
    db.exec(`ALTER TABLE key_management ADD COLUMN encrypted_private_key TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Migration: add new columns to data table if upgrading from old schema
  try {
    db.exec(`ALTER TABLE data ADD COLUMN member_id INTEGER`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    db.exec(`ALTER TABLE data ADD COLUMN weight REAL`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    db.exec(`ALTER TABLE data ADD COLUMN date TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    db.exec(`ALTER TABLE data ADD COLUMN deleted TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Migration: add gender column to members table
  try {
    db.exec(`ALTER TABLE members ADD COLUMN gender TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Seed default roles if not exist
  const roles = ['admin-role', 'user-role', 'view-role'];
  const insertRole = db.prepare('INSERT OR IGNORE INTO roles (name) VALUES (?)');
  for (const role of roles) {
    insertRole.run(role);
  }

  console.log('Database initialized');
}

// Audit logging helper
export type AuditAction =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_CHANGE'
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'USER_DEACTIVATE'
  | 'KEY_SETUP'
  | 'KEY_RESET'
  | 'ACCESS_GRANT'
  | 'WEIGHT_CREATE'
  | 'WEIGHT_DELETE'
  | 'MEMBER_CREATE'
  | 'MEMBER_DELETE'
  | 'LLM_SETTINGS_UPDATE'
  | 'LLM_ASK';

interface AuditEntry {
  action: AuditAction;
  userId?: number;
  targetUserId?: number;
  details?: string;
  ipAddress?: string;
  success?: boolean;
}

export function logAudit(entry: AuditEntry): void {
  const stmt = db.prepare(`
    INSERT INTO audit_log (action, user_id, target_user_id, details, ip_address, success)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    entry.action,
    entry.userId || null,
    entry.targetUserId || null,
    entry.details || null,
    entry.ipAddress || null,
    entry.success !== false ? 1 : 0
  );
}
