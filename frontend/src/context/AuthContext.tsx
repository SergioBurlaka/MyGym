import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setAccessToken } from '../api/client.js';

type User = { id: string; email: string };

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On first load, try to silently refresh using the httpOnly cookie so a
  // page reload doesn't force a fresh login.
  useEffect(() => {
    (async () => {
      try {
        const res = await api.post<{ accessToken: string }>('/auth/refresh');
        setAccessToken(res.data.accessToken);
        const payload = JSON.parse(atob(res.data.accessToken.split('.')[1]));
        setUser({ id: payload.sub, email: payload.email });
      } catch {
        setAccessToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    setAccessToken(res.data.accessToken);
    setUser(res.data.user);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const res = await api.post('/auth/register', { email, password });
    setAccessToken(res.data.accessToken);
    setUser(res.data.user);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
