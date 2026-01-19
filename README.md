# DCS Demo - Zero Trust Application

A demonstration application implementing zero-trust architecture with client-side encryption. All sensitive PII data is encrypted in the browser before being sent to the server, and can only be decrypted by authorized users with the proper keys.

## Purpose

This application demonstrates:
- **Client-side encryption**: Data is encrypted in the browser using Web Crypto API before transmission
- **Zero-trust architecture**: The server never sees plaintext PII data
- **Key management**: RSA key pairs for wrapping/unwrapping AES data keys
- **Role-based access control**: Admin, User, and View-only roles

## Technology Stack

- **Frontend**: TypeScript, React, Vite
- **Backend**: TypeScript, Node.js, Express
- **Database**: SQLite
- **Encryption**: Web Crypto API (RSA-OAEP 2048-bit, AES-GCM 256-bit)
- **Deployment**: Docker

## Quick Start

### Prerequisites
- Node.js 20+
- npm 9+
- SQLite3 (for viewing database directly)

### Setup

```bash
# Install dependencies
npm install

# Seed the database with initial admin user
npm run seed

# Start development server
npm run dev
```

The application will be available at http://localhost:3333

### Initial Login

Use the seed admin account:
- **Username**: `seed`
- **Password**: `init`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both frontend and backend in development mode |
| `npm run dev:server` | Start only the backend server |
| `npm run dev:client` | Start only the frontend |
| `npm run build` | Build both frontend and backend for production |
| `npm run start` | Start production server |
| `npm run seed` | Seed database with initial admin user |
| `npm run test` | Run Playwright tests |
| `npm run test:ui` | Run Playwright tests with UI |
| `npm run clean` | Remove all node_modules and build artifacts |
| `npm run reset` | Clean, reinstall, and re-seed (full reset) |

## Viewing Encrypted Data

To see that data is actually encrypted in the database, run:

```bash
./scripts/show-users.sh
```

This will display the raw database contents, showing encrypted PII fields as base64-encoded ciphertext.

## Docker

### Build

```bash
npm run docker:build
```

### Run

```bash
npm run docker:run
```

The application will be available at http://localhost:3333

## Reset / Cleanup

### Full Reset (recommended)

```bash
npm run reset
```

This will:
1. Remove all `node_modules` directories
2. Remove all build artifacts (`dist/`)
3. Delete the SQLite database
4. Reinstall dependencies
5. Re-seed the database

### Manual Cleanup

```bash
# Remove database only
rm server/data.db

# Re-seed
npm run seed

# Or clean everything
npm run clean
```

### Clear Browser Keys

If you need to clear the cryptographic keys stored in the browser:
1. Open browser DevTools (F12)
2. Go to Application > IndexedDB
3. Delete the `dcsdemo-keys` database

## Project Structure

```
dcsdemo/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── context/        # React context (Auth, Crypto)
│   │   ├── pages/          # Page components
│   │   ├── utils/          # API client, crypto utilities
│   │   └── main.tsx        # Entry point
│   └── index.html
├── server/                 # Express backend
│   ├── src/
│   │   ├── middleware/     # Auth middleware
│   │   ├── models/         # Database schema
│   │   ├── routes/         # API routes
│   │   ├── utils/          # Server-side crypto (password hashing)
│   │   ├── index.ts        # Server entry point
│   │   └── seed.ts         # Database seeding script
│   └── data.db             # SQLite database (created on seed)
├── tests/                  # Playwright e2e tests
├── scripts/                # Utility scripts
├── Dockerfile
├── CLAUDE.md               # Project documentation
└── README.md
```

## Security Notes

- Private keys are stored in browser IndexedDB and marked as **non-extractable**
- The server never receives or stores plaintext PII data
- Data keys are wrapped (encrypted) with each user's public key
- Password hashing uses PBKDF2-SHA256 with 100,000+ iterations
- All data encryption uses AES-GCM with unique 12-byte IVs

## Testing

Run the test suite:

```bash
npm run test
```

Tests cover:
- Seed user authentication
- User creation with encrypted data
- Data storage verification
- Role-based access control
- Key management
