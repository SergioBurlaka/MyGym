import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { setAccessToken } from '../api/client.js';
import { useLoginMutation, useLogoutMutation, useRefreshMutation, useRegisterMutation } from '../shared/api/auth/index.js';

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

  const refreshMutation = useRefreshMutation();
  const loginMutation = useLoginMutation();
  const registerMutation = useRegisterMutation();
  const logoutMutation = useLogoutMutation();

  // On first load, try to silently refresh using the httpOnly cookie so a
  // page reload doesn't force a fresh login.
  useEffect(() => {
    (async () => {
      try {
        const { accessToken } = await refreshMutation.mutateAsync();
        setAccessToken(accessToken);
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        setUser({ id: payload.sub, email: payload.email });
      } catch {
        setAccessToken(null);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
