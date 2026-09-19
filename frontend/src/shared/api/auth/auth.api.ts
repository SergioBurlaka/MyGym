import { api } from '../../../api/client.js';
import type { AuthCredentials, AuthResponse, RefreshResponse } from './auth.types.js';

export const AuthApi = {
  async login(payload: AuthCredentials) {
    return api.post<AuthResponse>('/auth/login', payload);
  },
  async register(payload: AuthCredentials) {
    return api.post<AuthResponse>('/auth/register', payload);
  },
  async refresh() {
    return api.post<RefreshResponse>('/auth/refresh');
  },
  async logout() {
    return api.post('/auth/logout');
  },
};
