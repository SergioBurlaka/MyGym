import { api } from '../../../api/client.js';
import type { OAuthConsentInfo, OAuthGrant } from './oauth.types.js';

export const OAuthApi = {
  async getRequest(id: string) {
    return api.get<OAuthConsentInfo>(`/oauth/requests/${id}`);
  },
  async decide(id: string, approve: boolean) {
    return api.post<{ redirectTo: string }>(`/oauth/requests/${id}/decision`, { approve });
  },
  async listGrants() {
    return api.get<OAuthGrant[]>('/oauth/grants');
  },
  async revokeGrant(id: string) {
    return api.delete(`/oauth/grants/${id}`);
  },
};
