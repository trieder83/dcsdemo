# PII Encryption

Zero trust encryption architecture for protecting personally identifiable information.

## Overview
- We use a wrapped data key to encrypt and decrypt the data
- The data key is encrypted with the user's public key
- The data key can only be unwrapped with the private key
- Private keys are encrypted with a password-derived Key Encryption Key (KEK) and stored on the server
- Users can access encrypted data from any device using their password

## Password-Derived Keys (Multi-Device Support)
The private key is encrypted with a KEK derived from the user's password using PBKDF2. This enables:
- **Multi-device access**: Same password = same KEK = can decrypt private key on any device
- **Server-stored encrypted keys**: Private key is encrypted and stored on server (zero-knowledge)
- **Session security**: KEK exists only in memory during active session (lost on page refresh)

## Cryptographic Algorithms (Web Crypto API)

| Purpose | Algorithm | Key Size | Notes |
|---------|-----------|----------|-------|
| Key Pair (wrap/unwrap) | RSA-OAEP | 2048-bit | Extractable for password encryption |
| Data Encryption | AES-GCM | 256-bit | Requires unique 12-byte IV per encryption |
| KEK Derivation | PBKDF2-SHA256 | 256-bit | 100,000 iterations, username as salt |
| Private Key Encryption | AES-GCM | 256-bit | Encrypted with KEK for server storage |
| Password Hashing (auth) | PBKDF2-SHA256 | - | 100,000+ iterations |

## Encrypting Data Workflow
1. User enters data in the UI
2. Browser unwraps the data key using the user's private key
3. Browser encrypts the data with the unwrapped data key
4. Encrypted data is sent to and stored on the server
5. Data key is never transmitted or stored in plain text

## Decrypting Data (View Layer)
1. Browser fetches encrypted data from server
2. Browser unwraps the data key using user's private key
3. Browser decrypts data just before rendering in the UI
4. Decrypted data exists only in memory, never persisted
