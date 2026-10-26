export type AuthCredentials = { email: string; password: string };

export type AuthResponse = {
  accessToken: string;
  user: { id: string; email: string; isDemo?: boolean };
};

// Sign-in methods the backend has configured (Google needs OAuth credentials,
// the demo a template account).
export type AuthProviders = { google: boolean; demo: boolean };
