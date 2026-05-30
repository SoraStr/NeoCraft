import { buildApp } from './app.js';

async function main() {
  const { server } = await buildApp();

  const port = parseInt(process.env.PORT || '3001', 10);
  const host = process.env.HOST || '127.0.0.1';

  await server.listen({ port, host });
  server.log.info(`NeoCraft API server listening on http://${host}:${port}`);
  server.log.info(`WebSocket endpoint: ws://${host}:${port}/ws`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
