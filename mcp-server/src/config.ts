// The only settings this service has: where the MyGym API is and which port
// to listen on. No tokens - every user brings their own with each request.
export const config = {
  apiUrl: process.env.MYGYM_API_URL ?? 'http://localhost:4000/api',
  port: Number(process.env.PORT ?? 8080),
};
