// Web Crypto API utilities for client-side encryption

const RSA_ALGORITHM = {
  name: 'RSA-OAEP',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256'
};

const AES_ALGORITHM = {
  name: 'AES-GCM',
  length: 256
};

const PBKDF2_ITERATIONS = 100000;

// Helper: ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper: Base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Generate RSA key pair (extractable for password-based encryption)
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    RSA_ALGORITHM,
    true, // extractable so we can encrypt with password
    ['wrapKey', 'unwrapKey']
  );
}

// Derive a Key Encryption Key (KEK) from password using PBKDF2
export async function deriveKEK(password: string, salt: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    passwordKey,
    AES_ALGORITHM,
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt private key with KEK for server storage
export async function encryptPrivateKey(privateKey: CryptoKey, kek: CryptoKey): Promise<string> {
  // Export private key as JWK
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  const jwkString = JSON.stringify(jwk);
  const encoder = new TextEncoder();
  const data = encoder.encode(jwkString);

  // Encrypt with AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    kek,
    data
  );

  // Combine IV + encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return arrayBufferToBase64(combined.buffer);
}

// Decrypt private key with KEK
export async function decryptPrivateKey(encryptedKey: string, kek: CryptoKey): Promise<CryptoKey> {
  const combined = base64ToArrayBuffer(encryptedKey);
  const combinedArray = new Uint8Array(combined);

  const iv = combinedArray.slice(0, 12);
  const data = combinedArray.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    kek,
    data
  );

  const jwkString = new TextDecoder().decode(decrypted);
  const jwk = JSON.parse(jwkString);

  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    RSA_ALGORITHM,
    true,
    ['unwrapKey']
  );
}

// Import public key from JWK (for restoring from server)
export async function importPublicKeyFromJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    RSA_ALGORITHM,
    true,
    ['wrapKey']
  );
}

// Export public key as JWK
export async function exportPublicKeyAsJwk(publicKey: CryptoKey): Promise<JsonWebKey> {
  return await crypto.subtle.exportKey('jwk', publicKey);
}

// Export public key to base64 string
export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('spki', publicKey);
  return arrayBufferToBase64(exported);
}

// Import public key from base64 string
export async function importPublicKey(publicKeyStr: string): Promise<CryptoKey> {
  const keyData = base64ToArrayBuffer(publicKeyStr);
  return await crypto.subtle.importKey(
    'spki',
    keyData,
    RSA_ALGORITHM,
    true,
    ['wrapKey']
  );
}

// Generate AES data key
export async function generateDataKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    AES_ALGORITHM,
    true, // extractable for wrapping
    ['encrypt', 'decrypt']
  );
}

// Wrap data key with public key
export async function wrapDataKey(dataKey: CryptoKey, publicKey: CryptoKey): Promise<string> {
  const wrapped = await crypto.subtle.wrapKey(
    'raw',
    dataKey,
    publicKey,
    { name: 'RSA-OAEP' }
  );
  return arrayBufferToBase64(wrapped);
}

// Unwrap data key with private key
export async function unwrapDataKey(wrappedKey: string, privateKey: CryptoKey): Promise<CryptoKey> {
  const keyData = base64ToArrayBuffer(wrappedKey);
  return await crypto.subtle.unwrapKey(
    'raw',
    keyData,
    privateKey,
    { name: 'RSA-OAEP' },
    AES_ALGORITHM,
    true,
    ['encrypt', 'decrypt']
  );
}

// Encrypt data with AES-GCM
export async function encryptData(data: string, dataKey: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedData = new TextEncoder().encode(data);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    dataKey,
    encodedData
  );

  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return arrayBufferToBase64(combined.buffer);
}

// Decrypt data with AES-GCM
export async function decryptData(encryptedData: string, dataKey: CryptoKey): Promise<string> {
  const combined = base64ToArrayBuffer(encryptedData);
  const combinedArray = new Uint8Array(combined);

  const iv = combinedArray.slice(0, 12);
  const data = combinedArray.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    dataKey,
    data
  );

  return new TextDecoder().decode(decrypted);
}

// Store keys in IndexedDB for persistence across sessions
const DB_NAME = 'dcsdemo-keys';
const STORE_NAME = 'keystore';

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2); // Version 2 for KEK support
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

// Store KEK in IndexedDB for session persistence
export async function storeKEK(kek: CryptoKey): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(kek, 'kek');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Get stored KEK from IndexedDB
export async function getStoredKEK(): Promise<CryptoKey | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get('kek');
    tx.oncomplete = () => resolve(request.result || null);
    tx.onerror = () => reject(tx.error);
  });
}

// Clear KEK from IndexedDB (on logout)
export async function clearStoredKEK(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete('kek');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function storeKeyPair(keyPair: CryptoKeyPair): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(keyPair.privateKey, 'privateKey');
    store.put(keyPair.publicKey, 'publicKey');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getStoredKeyPair(): Promise<CryptoKeyPair | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const privateKeyReq = store.get('privateKey');
    const publicKeyReq = store.get('publicKey');

    tx.oncomplete = () => {
      if (privateKeyReq.result && publicKeyReq.result) {
        resolve({
          privateKey: privateKeyReq.result,
          publicKey: publicKeyReq.result
        });
      } else {
        resolve(null);
      }
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearStoredKeys(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
