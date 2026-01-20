# DCS Demo

This app implements a full-stack application with zero trust architecture.

## Technology Stack
- **Frontend:** TypeScript, React
- **Backend:** TypeScript, Node.js
- **Database:** SQLite (for demo purposes)
- **Deployment:** Docker
- **Port:** 3333

## Functions
- Login (with password-derived key encryption for multi-device support)
- A public/private key pair is generated at the frontend with the Web Crypto API
- Multi-device access: same password derives same encryption key on any device
- Add new user
- Grant permission to new user
- Show the data of all tables in a table view (tabbed), encrypted data is only decrypted at the view layer before displaying the variables in the browser
- Add records (immediately encrypted on input, before stored anywhere)

## Security

See detailed specs:
- [PII Encryption](spec/security-dcs-pii-encription.md) - Cryptographic algorithms, key wrapping, encrypt/decrypt workflows
- [Masking for LLM](spec/security-dcs-masking.md) - PII masking when sending data to LLMs
- [User Onboarding](spec/security-dcs-onboarding.md) - Seeding, first admin setup, adding new users

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
 - members
    - id
    - name (encrypted)
    - surname (encrypted)
    - birthdate (encrypted)
    - email (encrypted)
    - gender (encrypted)
    - deleted (soft delete timestamp)
 - data (weight measurements)
    - id
    - member_id (FK to members)
    - weight (plaintext - not encrypted)
    - date (measurement date)
    - deleted (soft delete timestamp)
 - llm_settings
    - id
    - user_id (FK to users)
    - provider (e.g., 'gemini')
    - endpoint (API endpoint URL)
    - encrypted_api_key (API key encrypted with user's data key)
 - key_management
    - id
    - user_id (FK to users)
    - role_id (FK to roles)
    - public_key (user's public key)
    - encrypted_private_key (private key encrypted with password-derived KEK)
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

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Authenticate user |
| POST | `/api/auth/logout` | End user session |
| GET | `/api/auth/me` | Get current user info |
| GET | `/api/users` | List all users (encrypted) |
| POST | `/api/users` | Create new user |
| GET | `/api/data` | Get all weight records with member info, deleted at end |
| POST | `/api/data` | Add new weight record (memberId, weight, date) |
| DELETE | `/api/data/:id` | Soft delete weight record |
| GET | `/api/members` | Get all members (encrypted, deleted at end) |
| POST | `/api/members` | Add new member |
| DELETE | `/api/members/:id` | Soft delete member |
| GET | `/api/keys/:userId` | Get wrapped data key for user |
| POST | `/api/keys/grant` | Grant access (wrap data key for new user) |
| GET | `/api/keys/roles/list` | List all roles |
| GET | `/api/keys/system/has-data-key` | Check if system has a data key |
| PUT | `/api/keys/setup` | User sets up keys (publicKey, encryptedPrivateKey, wrappedDataKey?) |
| DELETE | `/api/keys/reset/:userId` | Admin resets user's keys |
| GET | `/api/llm/settings` | Get user's LLM settings (with encrypted API key) |
| PUT | `/api/llm/settings` | Update user's LLM settings (provider, endpoint, encrypted key) |
| POST | `/api/llm/ask/log` | Log LLM ask action for audit trail |
| GET | `/api/audit` | Get audit logs (with filtering) |
| GET | `/api/audit/actions` | List available audit action types |

## Pages

| Page | Route | Description | Access |
|------|-------|-------------|--------|
| Login | `/login` | User authentication | Public |
| Dashboard | `/` | Key setup (if needed), tabbed view of users/data tables with decryption | All roles |
| Admin | `/admin` | User management, view pending access requests, grant/reset keys | admin-role only |
