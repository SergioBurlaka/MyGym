import { api } from '../../../api/client.js';
import type { ApiToken, CreatedApiToken } from './tokens.types.js';

export const TokensApi = {
  async list() {
    return api.get<ApiToken[]>('/tokens');
  },
  async create(name: string) {
    return api.post<CreatedApiToken>('/tokens', { name });
  },
  async revoke(id: string) {
    return api.delete(`/tokens/${id}`);
  },
};
