export type AuthCredentials = { email: string; password: string };

export type AuthResponse = {
  accessToken: string;
  user: { id: string; email: string };
};

// Sign-in methods the backend has configured (Google needs OAuth credentials).
export type AuthProviders = { google: boolean };
