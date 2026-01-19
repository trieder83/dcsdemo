import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi } from '../utils/api';
import { deriveKEK } from '../utils/crypto';

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
      // Note: KEK will be null on page refresh - user needs to re-login for crypto
      // This is a security feature - KEK is only in memory during active session
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(username: string, password: string) {
    const { user } = await authApi.login(username, password);
    setUser(user);

    // Derive KEK from password (using username as salt)
    // KEK is stored in memory only - never persisted
    if (username !== 'seed') {
      const derivedKek = await deriveKEK(password, `dcsdemo-kek-${username}`);
      setKek(derivedKek);
    }
  }

  async function logout() {
    await authApi.logout();
    setUser(null);
    setKek(null); // Clear KEK on logout
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
