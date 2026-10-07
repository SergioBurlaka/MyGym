import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { refreshAccessToken, setAccessToken, setOnSessionLost } from '../api/client.js';
import { useLoginMutation, useLogoutMutation, useRegisterMutation } from '../shared/api/auth/index.js';

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

  const loginMutation = useLoginMutation();
  const registerMutation = useRegisterMutation();
  const logoutMutation = useLogoutMutation();

  // On first load, try to silently refresh using the httpOnly cookie so a
  // page reload doesn't force a fresh login.
  // Goes through the shared single-flight refresh, so StrictMode's double
  // effect run can't send the same rotating refresh token twice.
  useEffect(() => {
    setOnSessionLost(() => setUser(null));
    (async () => {
      const accessToken = await refreshAccessToken();
      if (accessToken) {
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        setUser({ id: payload.sub, email: payload.email });
      }
      setLoading(false);
    })();
    return () => setOnSessionLost(null);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await loginMutation.mutateAsync({ email, password });
      setAccessToken(res.accessToken);
      setUser(res.user);
    },
    [loginMutation],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      const res = await registerMutation.mutateAsync({ email, password });
      setAccessToken(res.accessToken);
      setUser(res.user);
    },
    [registerMutation],
  );

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
    setAccessToken(null);
    setUser(null);
  }, [logoutMutation]);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
