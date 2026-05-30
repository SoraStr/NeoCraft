import Fastify, { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { IpcClient } from './services/ipc-client';
import { WebSocketHub } from './websocket/hub';
import { instanceRoutes } from './routes/instances';
import { configRoutes } from './routes/config';

export interface AppOptions {
  ipcSocketPath?: string;
  mockIpc?: boolean;
}

export interface AppInstance {
  server: FastifyInstance;
  ipc: IpcClient;
  wsHub: WebSocketHub;
}

export async function buildApp(options: AppOptions = {}): Promise<AppInstance> {
  const server = Fastify({ logger: true });

  // Register plugins
  await server.register(cors);
  await server.register(websocket);

  // Create IPC client
  const socketPath = options.ipcSocketPath ||
    (process.env.HOME || process.env.USERPROFILE || '/tmp') + '/.neocraft/daemon.sock';
  const ipc = new IpcClient(socketPath);

  // Create WebSocket hub
  const wsHub = new WebSocketHub();

  // Connect to daemon (non-blocking in dev, will retry)
  if (!options.mockIpc) {
    ipc.connect().catch((err) => {
      server.log.warn(`Failed to connect to daemon at ${socketPath}: ${err.message}`);
      server.log.warn('Daemon connection will be retried automatically');
    });
  }
  // In mock mode, connect silently succeeds (tests provide their own mock)

  // Bridge IPC events to WebSocket
  ipc.onEvent((event) => {
    wsHub.broadcast(event);
  });

  // Register WebSocket endpoint
  server.register(async function (scope) {
    scope.get('/ws', { websocket: true }, (socket, req) => {
      wsHub.addClient(socket);

      // Send initial daemon status
      socket.send(JSON.stringify({
        event: 'daemon.status',
        data: { version: '0.1.0', uptime_secs: 0 },
      }));

      socket.on('close', () => {
        wsHub.removeClient(socket);
      });
    });
  });

  // Health check
  server.get('/api/health', async () => ({
    status: 'ok',
    daemon_connected: wsHub.getConnectedCount() >= 0,
  }));

  // Register API routes
  await server.register(instanceRoutes, { ipc });
  await server.register(configRoutes, { ipc });

  return { server, ipc, wsHub };
}
