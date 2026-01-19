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

  // Create data table
  db.exec(`
    CREATE TABLE IF NOT EXISTS data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL,
      value TEXT,
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

  // Migration: add encrypted_private_key column if it doesn't exist
  try {
    db.exec(`ALTER TABLE key_management ADD COLUMN encrypted_private_key TEXT`);
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
