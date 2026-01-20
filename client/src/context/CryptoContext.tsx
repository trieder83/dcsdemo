import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  generateKeyPair,
  exportPublicKey,
  storeKeyPair,
  clearStoredKeys,
  unwrapDataKey,
  encryptData,
  decryptData,
  generateDataKey,
  wrapDataKey,
  importPublicKey,
  encryptPrivateKey,
  decryptPrivateKey
} from '../utils/crypto';
import { keysApi } from '../utils/api';
import { useAuth } from './AuthContext';

interface CryptoContextType {
  publicKey: string | null;
  hasDataKey: boolean;
  needsKeySetup: boolean;
  needsRelogin: boolean;
  loading: boolean;
  setupKeys: () => Promise<void>;
  encrypt: (data: string) => Promise<string>;
  decrypt: (encryptedData: string) => Promise<string>;
  wrapKeyForUser: (userPublicKey: string) => Promise<string>;
  clearKeys: () => Promise<void>;
  reloadKeys: () => Promise<void>;
}

const CryptoContext = createContext<CryptoContextType | null>(null);

export function CryptoProvider({ children }: { children: ReactNode }) {
  const { user, kek } = useAuth();
  const [keyPair, setKeyPair] = useState<CryptoKeyPair | null>(null);
  const [dataKey, setDataKey] = useState<CryptoKey | null>(null);
  const [publicKeyString, setPublicKeyString] = useState<string | null>(null);
  const [needsKeySetup, setNeedsKeySetup] = useState(false);
  const [needsRelogin, setNeedsRelogin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadKeys();
  }, [user, kek]);

  // Auto-refresh every 10 seconds when waiting for access (has keys but no data key)
  useEffect(() => {
    if (!user || user.username === 'seed' || needsKeySetup || needsRelogin || loading) {
      return;
    }

    // If we have keys but no data key, poll for updates
    if (keyPair && !dataKey) {
      const interval = setInterval(() => {
        loadKeys();
      }, 10000); // 10 seconds

      return () => clearInterval(interval);
    }
  }, [user, keyPair, dataKey, needsKeySetup, needsRelogin, loading]);

  async function loadKeys() {
    if (!user) {
      setKeyPair(null);
      setDataKey(null);
      setPublicKeyString(null);
      setNeedsKeySetup(false);
      setNeedsRelogin(false);
      setLoading(false);
      return;
    }

    // Seed user cannot use crypto
    if (user.username === 'seed') {
      setNeedsKeySetup(false);
      setNeedsRelogin(false);
      setLoading(false);
      return;
    }

    // If we don't have KEK (page refresh), user needs to re-login
    if (!kek) {
      setNeedsRelogin(true);
      setNeedsKeySetup(false);
      setLoading(false);
      return;
    }

    try {
      // Try to get key info from server
      const keyInfo = await keysApi.get(user.id);

      // Check if server has encrypted private key
      if (keyInfo.encrypted_private_key && keyInfo.encrypted_private_key !== '') {
        // User has keys on server - decrypt with KEK
        try {
          const privateKey = await decryptPrivateKey(keyInfo.encrypted_private_key, kek);

          // Import public key
          const publicKey = await importPublicKey(keyInfo.public_key);

          setKeyPair({ privateKey, publicKey });
          setPublicKeyString(keyInfo.public_key);

          // Try to unwrap data key if available
          if (keyInfo.wrapped_data_key &&
              keyInfo.wrapped_data_key !== 'SEED_WRAPPED_KEY_PLACEHOLDER' &&
              keyInfo.wrapped_data_key !== '') {
            const unwrapped = await unwrapDataKey(keyInfo.wrapped_data_key, privateKey);
            setDataKey(unwrapped);
          }

          setNeedsKeySetup(false);
          setNeedsRelogin(false);
        } catch (e) {
          console.error('Failed to decrypt private key - wrong password?', e);
          // Password might be wrong or keys corrupted
          setNeedsKeySetup(true);
          setNeedsRelogin(false);
        }
      } else {
        // No encrypted private key on server - new user needs setup
        setNeedsKeySetup(true);
        setNeedsRelogin(false);
      }
    } catch (e) {
      console.log('Error loading keys:', e);
      setNeedsKeySetup(true);
    } finally {
      setLoading(false);
    }
  }

  async function setupKeys(): Promise<void> {
    if (!user || user.username === 'seed') {
      throw new Error('Cannot set up keys for seed user');
    }

    if (!kek) {
      throw new Error('No KEK available - please re-login');
    }

    // Generate new key pair
    const newKeyPair = await generateKeyPair();
    setKeyPair(newKeyPair);

    const pubKey = await exportPublicKey(newKeyPair.publicKey);
    setPublicKeyString(pubKey);

    // Encrypt private key with KEK for server storage
    const encryptedPrivateKey = await encryptPrivateKey(newKeyPair.privateKey, kek);

    // Check if system already has a data key
    const { hasDataKey: systemHasKey } = await keysApi.systemHasDataKey();

    let wrappedKey: string | undefined;
    if (!systemHasKey) {
      // This is the first real user - generate the system data key
      const newDataKey = await generateDataKey();
      setDataKey(newDataKey);

      // Wrap it with our own public key
      wrappedKey = await wrapDataKey(newDataKey, newKeyPair.publicKey);
    }

    // Send keys to server
    const result = await keysApi.setup(pubKey, encryptedPrivateKey, wrappedKey);

    if (result.existing) {
      // Server already had keys - use those instead
      // This happens when user already set up on another device
      try {
        const privateKey = await decryptPrivateKey(result.encrypted_private_key!, kek);
        const publicKey = await importPublicKey(result.public_key!);

        setKeyPair({ privateKey, publicKey });
        setPublicKeyString(result.public_key!);

        if (result.wrapped_data_key) {
          const unwrapped = await unwrapDataKey(result.wrapped_data_key, privateKey);
          setDataKey(unwrapped);
        }
      } catch (e) {
        throw new Error('Failed to decrypt existing keys. Password may have changed since initial setup.');
      }
    }

    // Store in IndexedDB for session persistence (optional, for convenience)
    await storeKeyPair(newKeyPair);

    setNeedsKeySetup(false);
    setNeedsRelogin(false);
  }

  async function encrypt(data: string): Promise<string> {
    if (!dataKey) {
      throw new Error('No data key available');
    }
    return encryptData(data, dataKey);
  }

  async function decrypt(encryptedData: string): Promise<string> {
    if (!dataKey) {
      throw new Error('No data key available');
    }
    try {
      return await decryptData(encryptedData, dataKey);
    } catch {
      return encryptedData; // Return as-is if decryption fails
    }
  }

  async function wrapKeyForUser(userPublicKey: string): Promise<string> {
    if (!dataKey) {
      throw new Error('No data key available - cannot grant access');
    }

    const importedPubKey = await importPublicKey(userPublicKey);
    return wrapDataKey(dataKey, importedPubKey);
  }

  async function clearKeys(): Promise<void> {
    await clearStoredKeys();
    setKeyPair(null);
    setDataKey(null);
    setPublicKeyString(null);
    setNeedsKeySetup(false);
  }

  async function reloadKeys(): Promise<void> {
    await loadKeys();
  }

  return (
    <CryptoContext.Provider
      value={{
        publicKey: publicKeyString,
        hasDataKey: !!dataKey,
        needsKeySetup,
        needsRelogin,
        loading,
        setupKeys,
        encrypt,
        decrypt,
        wrapKeyForUser,
        clearKeys,
        reloadKeys
      }}
    >
      {children}
    </CryptoContext.Provider>
  );
}

export function useCrypto() {
  const context = useContext(CryptoContext);
  if (!context) {
    throw new Error('useCrypto must be used within CryptoProvider');
  }
  return context;
}
