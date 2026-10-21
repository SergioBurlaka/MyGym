import { api } from '../../../api/client.js';
import type { AuthCredentials, AuthProviders, AuthResponse } from './auth.types.js';

export const AuthApi = {
  async login(payload: AuthCredentials) {
    return api.post<AuthResponse>('/auth/login', payload);
  },
  async register(payload: AuthCredentials) {
    return api.post<AuthResponse>('/auth/register', payload);
  },
  async logout() {
    return api.post('/auth/logout');
  },
  async providers() {
    return api.get<AuthProviders>('/auth/providers');
  },
  // Not an XHR: the browser itself has to go to Google and come back, so
  // the button is a plain link to this backend route.
  googleSignInUrl(next?: string | null) {
    const query = next ? `?next=${encodeURIComponent(next)}` : '';
    return `${api.defaults.baseURL}/auth/google${query}`;
  },
};
