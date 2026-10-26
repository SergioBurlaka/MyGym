import { buildApp } from './app.js';
import { env } from './config/env.js';
import { startAutoFinishSweep } from './modules/workouts/autoFinish.js';
import { startDemoResetSweep } from './modules/template/demo.service.js';

const app = buildApp();
// Here, not in buildApp: tests build many apps and shouldn't start timers.
startAutoFinishSweep(app);
startDemoResetSweep(app);

app
  .listen({ port: env.PORT, host: '0.0.0.0' })
  .then((address) => {
    app.log.info(`MyGym backend listening on ${address}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
