# User Onboarding & Key Setup

## Seeding
The initial setup uses a seed-admin user with the username "seed" and password "init". The seed user has placeholder keys and cannot encrypt/decrypt data. After another admin user is created, this user gets disabled.

## First Admin Setup (Initial Data Key Generation)
1. Seed admin creates the first real admin user in the Admin page
2. First real admin logs in for the first time
3. Browser derives KEK from password using PBKDF2
4. Browser generates RSA key pair
5. Browser generates the initial AES-256 data key
6. Browser wraps the data key with the user's own public key
7. Browser encrypts private key with KEK
8. Browser sends public key, encrypted private key, and wrapped data key to server
9. Server stores in `key_management` table
10. First admin can now encrypt/decrypt data

## Multi-Device Login (Returning User)
1. User logs in with username and password
2. Browser derives KEK from password using PBKDF2 (same password = same KEK)
3. Browser fetches encrypted private key from server
4. Browser decrypts private key using KEK
5. Browser fetches wrapped data key from server
6. Browser unwraps data key using private key
7. User can now encrypt/decrypt data (no setup needed!)

## Adding a New User
1. Admin creates new user (username, password, role only - no PII yet)
2. Server creates user with empty key_management entry
3. New user logs in for the first time
4. New user sees "Key Setup Required" prompt
5. New user clicks to set up keys:
   - Browser derives KEK from password
   - Browser generates RSA key pair
   - Browser encrypts private key with KEK
   - Browser checks if system has a data key (it does)
   - Browser sends public key and encrypted private key to server
6. New user status: "Waiting for access" (has keys, no wrapped data key)
7. Admin logs in (with data key access)
8. Admin clicks "Grant Access" for the new user:
   - Admin's browser unwraps data key using admin's private key
   - Admin's browser re-wraps the SAME data key with new user's public key
   - Server stores new user's wrapped data key
9. New user refreshes/logs in → can now decrypt data (from any device!)
