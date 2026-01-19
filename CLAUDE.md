# DCS Demo

This app implements a full-stack application with zero trust architecture.

## Technology Stack
- **Frontend:** TypeScript, React
- **Backend:** TypeScript, Node.js
- **Database:** SQLite (for demo purposes)
- **Deployment:** Docker
- **Port:** 3333

## Functions
- Login
- A public/private key pair is generated at the frontend with the Web Crypto API (non-extractable)
- Add new user
- Grant permission to new user
- Show the data of all tables in a table view (tabbed), encrypted data is only decrypted at the view layer before displaying the variables in the browser
- Add records (immediately encrypted on input, before stored anywhere)


## Security
- We use a wrapped data key to encrypt and decrypt the data
- The data key is encrypted with the user's public key
- The data key can only be unwrapped with the private key in the browser

### Cryptographic Algorithms (Web Crypto API)

| Purpose | Algorithm | Key Size | Notes |
|---------|-----------|----------|-------|
| Key Pair (wrap/unwrap) | RSA-OAEP | 2048-bit | Non-extractable private key |
| Data Encryption | AES-GCM | 256-bit | Requires unique 12-byte IV per encryption |
| Password Hashing | PBKDF2-SHA256 | - | 100,000+ iterations |


## Database
We use a SQLite database (for demo purposes).
The users table contains PII data and must always be encrypted. The values are only decrypted on the visualization layer at the web browser (client-side).
The PII data is encrypted with the data key.

Tables:
 - users
    - id
    - name (encrypted)
    - surname (encrypted)
    - birthdate (encrypted)
    - email (encrypted)
 - data
    - id
    - key
    - value (encrypted)
 - key_management
    - id
    - user_id (FK to users)
    - role_id (FK to roles)
    - public_key (user's public key)
    - wrapped_data_key (data key encrypted with user's public key)
 - roles
    - id
    - name (admin-role | user-role | view-role)

### Role Permissions
| Role | View Data | Add Records | Manage Users |
|------|-----------|-------------|--------------|
| admin-role | yes | yes | yes |
| user-role | yes | yes | no |
| view-role | yes | no | no |


## Seeding
The initial setup uses a seed-admin user with the username "seed" and password "init". The seed user has placeholder keys and cannot encrypt/decrypt data. After another admin user is created, this user gets disabled.


## Workflows

### First Admin Setup (Initial Data Key Generation)
1. Seed admin creates the first real admin user in the Admin page
2. First real admin logs in for the first time
3. Browser generates RSA key pair (non-extractable private key) and stores in IndexedDB
4. Browser generates the initial AES-256 data key
5. Browser wraps the data key with the user's own public key
6. Browser sends public key and wrapped data key to server
7. Server stores in `key_management` table
8. First admin can now encrypt/decrypt data

### Adding a New User
1. Admin creates new user (username, password, role only - no PII yet)
2. Server creates user with empty key_management entry
3. New user logs in for the first time
4. New user sees "Key Setup Required" prompt
5. New user clicks to set up keys:
   - Browser generates RSA key pair and stores in IndexedDB
   - Browser checks if system has a data key (it does)
   - Browser sends only public key to server
6. New user status: "Waiting for access" (has public key, no wrapped data key)
7. Admin logs in (with data key access)
8. Admin clicks "Grant Access" for the new user:
   - Admin's browser unwraps data key using admin's private key
   - Admin's browser re-wraps the SAME data key with new user's public key
   - Server stores new user's wrapped data key
9. New user refreshes/logs in → can now decrypt data

### Encrypting Data
1. User enters data in the UI
2. Browser unwraps the data key using the user's private key
3. Browser encrypts the data with the unwrapped data key
4. Encrypted data is sent to and stored on the server
5. Data key is never transmitted or stored in plain text

### Decrypting Data (View Layer)
1. Browser fetches encrypted data from server
2. Browser unwraps the data key using user's private key
3. Browser decrypts data just before rendering in the UI
4. Decrypted data exists only in memory, never persisted


## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Authenticate user |
| POST | `/api/auth/logout` | End user session |
| GET | `/api/auth/me` | Get current user info |
| GET | `/api/users` | List all users (encrypted) |
| POST | `/api/users` | Create new user |
| GET | `/api/data` | Get all data records (encrypted) |
| POST | `/api/data` | Add new data record |
| GET | `/api/keys/:userId` | Get wrapped data key for user |
| POST | `/api/keys/grant` | Grant access (wrap data key for new user) |
| GET | `/api/keys/roles/list` | List all roles |
| GET | `/api/keys/system/has-data-key` | Check if system has a data key |
| PUT | `/api/keys/setup` | User sets up their own keys |
| DELETE | `/api/keys/reset/:userId` | Admin resets user's keys |


## Pages

| Page | Route | Description | Access |
|------|-------|-------------|--------|
| Login | `/login` | User authentication | Public |
| Dashboard | `/` | Key setup (if needed), tabbed view of users/data tables with decryption | All roles |
| Admin | `/admin` | User management, view pending access requests, grant/reset keys | admin-role only |
