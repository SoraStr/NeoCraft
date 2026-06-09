import { buildApp } from './app.js';
import { loadListenConfig } from './config.js';

async function main() {
  const { server } = await buildApp();
  const { port, host } = loadListenConfig();

  await server.listen({ port, host });
  server.log.info(`NeoCraft API server listening on http://${host}:${port}`);
  server.log.info(`WebSocket endpoint: ws://${host}:${port}/ws`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
