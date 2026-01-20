import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi } from '../utils/api';
import { deriveKEK, storeKEK, getStoredKEK, clearStoredKEK } from '../utils/crypto';

interface User {
  id: number;
  username: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  kek: CryptoKey | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [kek, setKek] = useState<CryptoKey | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const { user } = await authApi.me();
      setUser(user);

      // Try to restore KEK from IndexedDB (survives page refresh)
      if (user && user.username !== 'seed') {
        const storedKek = await getStoredKEK();
        if (storedKek) {
          setKek(storedKek);
        }
      }
    } catch {
      setUser(null);
      // Clear any stale KEK
      await clearStoredKEK().catch(() => {});
    } finally {
      setLoading(false);
    }
  }

  async function login(username: string, password: string) {
    const { user } = await authApi.login(username, password);
    setUser(user);

    // Derive KEK from password (using username as salt)
    if (username !== 'seed') {
      const derivedKek = await deriveKEK(password, `dcsdemo-kek-${username}`);
      setKek(derivedKek);
      // Store KEK in IndexedDB for session persistence (survives page refresh)
      await storeKEK(derivedKek);
    }
  }

  async function logout() {
    await authApi.logout();
    setUser(null);
    setKek(null);
    // Clear KEK from IndexedDB on logout
    await clearStoredKEK().catch(() => {});
  }

  return (
    <AuthContext.Provider value={{ user, kek, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
