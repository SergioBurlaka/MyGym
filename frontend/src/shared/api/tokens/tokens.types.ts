// A personal access token as listed - metadata only, the raw token is never
// sent again after creation.
export type ApiToken = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
};

// The one response that carries the raw "mygym_pat_..." token.
export type CreatedApiToken = Omit<ApiToken, 'lastUsedAt'> & { token: string };
