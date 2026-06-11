import { registerRoutes } from './routes.js';

export async function boot() {
  const app = { ready: false };
  registerRoutes(app);
  app.ready = true;
  return app;
}
