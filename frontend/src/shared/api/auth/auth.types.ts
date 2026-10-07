export type AuthCredentials = { email: string; password: string };

export type AuthResponse = {
  accessToken: string;
  user: { id: string; email: string };
};

