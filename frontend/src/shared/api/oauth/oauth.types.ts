// What the consent page shows about a pending "may <client> access?" request.
export type OAuthConsentInfo = {
  clientName: string;
  clientId: string;
  // false = the client registered itself (DCR): its name proves nothing.
  verified: boolean;
  clientHost: string | null;
  redirectHost: string;
  scope: string;
};

// An app connected through OAuth (Claude, ChatGPT...), listed on Integrations.
export type OAuthGrant = {
  id: string;
  clientName: string;
  clientId: string;
  // https logo from the client's metadata document, if it published one.
  logoUri: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};
