import express from 'express';
import cors from 'cors';
import session from 'express-session';
import path from 'path';
import { initDatabase } from './models/database.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import dataRoutes from './routes/data.js';
import keysRoutes from './routes/keys.js';
import auditRoutes from './routes/audit.js';
import membersRoutes from './routes/members.js';
import llmRoutes from './routes/llm.js';

const app = express();
// In dev mode, use 3334 (Vite runs on 3333 and proxies /api to 3334)
// In production, use 3333 (server serves static files directly)
const PORT = process.env.PORT || (process.env.NODE_ENV === 'production' ? 3333 : 3334);

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:3333',
  credentials: true
}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize database
initDatabase();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/keys', keysRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/members', membersRoutes);
app.use('/api/llm', llmRoutes);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
