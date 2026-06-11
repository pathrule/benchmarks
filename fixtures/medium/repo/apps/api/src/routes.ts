export function registerRoutes(app: { ready: boolean }) {
  if (app.ready) throw new Error('routes must register before ready');
}
