// The only settings this service has: where the MyGym API is, which port
// to listen on and the public origin (for the OAuth hint in 401 answers).
// No tokens - every user brings their own with each request.
export const config = {
  apiUrl: process.env.MYGYM_API_URL ?? 'http://localhost:4000/api',
  port: Number(process.env.PORT ?? 8080),
  publicUrl: (process.env.PUBLIC_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),
};
