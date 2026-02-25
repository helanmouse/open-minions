import Fastify from 'fastify';
import { taskRoutes } from './routes/tasks.js';
import { webhookRoutes } from './routes/webhook.js';
import { loadConfig } from '../config/index.js';

export interface ServerOptions {
  skipDispatch?: boolean;
}

export async function buildServer(opts?: ServerOptions) {
  const app = Fastify({ logger: !opts?.skipDispatch });

  (app as any).skipDispatch = opts?.skipDispatch ?? false;

  app.get('/health', async () => ({ status: 'ok' }));

  await app.register(taskRoutes);
  await app.register(webhookRoutes);

  return app;
}

// Start server when run directly
const isMain = process.argv[1]?.endsWith('server/index.ts')
  || process.argv[1]?.endsWith('server/index.js');

if (isMain) {
  const config = loadConfig();
  const server = await buildServer();
  await server.listen({ port: config.server.port, host: config.server.host });
}
