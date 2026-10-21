import { buildApp } from './app.js';
import { config } from './config.js';

const app = buildApp({ apiUrl: config.apiUrl });

app.listen({ host: '0.0.0.0', port: config.port }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
