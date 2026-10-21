// What the consent page shows about a pending "may <client> access?" request.
export type OAuthConsentInfo = {
  clientName: string;
  clientId: string;
  clientHost: string;
  redirectHost: string;
  scope: string;
};

// An app connected through OAuth (Claude, ChatGPT...), listed on Integrations.
export type OAuthGrant = {
  id: string;
  clientName: string;
  clientId: string;
  createdAt: string;
  lastUsedAt: string | null;
};
