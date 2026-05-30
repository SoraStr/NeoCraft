import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';

const server = Fastify({ logger: true });

async function main() {
  await server.register(cors);
  await server.register(websocket);

  server.get('/api/health', async () => ({ status: 'ok' }));

  const port = 3001;
  await server.listen({ port, host: '127.0.0.1' });
  server.log.info(`NeoCraft API server listening on :${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
