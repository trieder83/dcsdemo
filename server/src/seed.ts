import { db, initDatabase } from './models/database.js';
import { hashPassword } from './utils/crypto.js';

async function seed() {
  console.log('Initializing database...');
  initDatabase();

  console.log('Creating seed admin user...');

  // Check if seed user already exists
  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get('seed');

  if (existingUser) {
    console.log('Seed user already exists, skipping...');
    return;
  }

  const passwordHash = await hashPassword('init');

  // Create seed admin user
  const result = db.prepare(`
    INSERT INTO users (username, password_hash, name, surname, email, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('seed', passwordHash, 'Seed', 'Admin', 'seed@example.com', 1);

  const userId = result.lastInsertRowid;

  // Get admin role
  const adminRole = db.prepare('SELECT id FROM roles WHERE name = ?').get('admin-role') as { id: number };

  // Create key_management entry with placeholder public key
  // In real scenario, the seed user would need to generate keys on first login
  db.prepare(`
    INSERT INTO key_management (user_id, role_id, public_key, wrapped_data_key)
    VALUES (?, ?, ?, ?)
  `).run(userId, adminRole.id, 'SEED_PUBLIC_KEY_PLACEHOLDER', 'SEED_WRAPPED_KEY_PLACEHOLDER');

  console.log('Seed completed successfully!');
  console.log('Login with username: seed, password: init');
}

seed().catch(console.error);
