import Fastify, { FastifyInstance } from 'fastify';
import { spawn, ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { IpcClient } from './services/ipc-client';
import { WebSocketHub } from './websocket/hub';
import { instanceRoutes } from './routes/instances';
import { configRoutes } from './routes/config';
import { versionRoutes } from './routes/versions';
import { VersionService } from './services/version-service';

export interface AppOptions {
  ipcSocketPath?: string;
  mockIpc?: boolean;
}

export interface AppInstance {
  server: FastifyInstance;
  ipc: IpcClient;
  wsHub: WebSocketHub;
}

function findDaemonBinary(): string | null {
  // Check common locations
  const candidates = [
    join(process.cwd(), '..', 'daemon', 'target', 'release', 'neocraft-daemon'),
    join(process.cwd(), '..', 'daemon', 'target', 'debug', 'neocraft-daemon'),
    join(process.cwd(), 'daemon', 'target', 'release', 'neocraft-daemon'),
    join(process.cwd(), 'daemon', 'target', 'debug', 'neocraft-daemon'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

function spawnDaemon(socketPath: string): ChildProcess | null {
  const bin = findDaemonBinary();
  if (!bin) {
    console.warn('[app] Daemon binary not found. Build it with: cd daemon && cargo build');
    return null;
  }
  console.log(`[app] Auto-starting daemon: ${bin}`);
  const child = spawn(bin, [
    '--socket', socketPath,
    '--data-dir', join(process.env.HOME || '/tmp', '.neocraft'),
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (d) => process.stdout.write(`[daemon] ${d}`));
  child.stderr?.on('data', (d) => process.stderr.write(`[daemon] ${d}`));
  child.on('exit', (code) => console.log(`[app] Daemon exited with code ${code}`));
  return child;
}

export async function buildApp(options: AppOptions = {}): Promise<AppInstance> {
  const server = Fastify({
    logger: true,
    genReqId: () => `nc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  });

  await server.register(cors, {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'],
  });
  await server.register(websocket);

  const socketPath = options.ipcSocketPath ||
    join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.neocraft', 'daemon.sock');

  const ipc = new IpcClient(socketPath);
  const wsHub = new WebSocketHub();

  // Track daemon connection state
  let daemonConnected = false;

  // Try to connect, auto-spawn daemon if needed
  if (!options.mockIpc) {
    try {
      await ipc.connect();
      daemonConnected = true;
      server.log.info(`Connected to daemon at ${socketPath}`);
    } catch {
      server.log.warn(`Daemon not running at ${socketPath}, attempting auto-start...`);
      const child = spawnDaemon(socketPath);
      if (child) {
        // Wait for daemon to start up
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 500));
          try {
            await ipc.connect();
            daemonConnected = true;
            server.log.info('Daemon auto-started and connected');
            break;
          } catch (err: any) {
            if (i === 19) {
              server.log.warn(`Daemon still unreachable after 20 retries: ${err.message}`);
            }
          }
        }
      }
      if (!daemonConnected) {
        server.log.warn('Could not connect to daemon. Start it manually:');
        server.log.warn('  cd daemon && cargo run');
      }
    }

    // Monitor connection — if it drops, update status
    ipc.onEvent((event) => {
      wsHub.broadcast(event);
    });

    // Periodic health ping to detect disconnects
    const healthTimer = setInterval(async () => {
      try {
        await ipc.request('instance.list', {}, { timeout: 2000 });
        if (!daemonConnected) {
          daemonConnected = true;
          wsHub.broadcast({ event: 'daemon.status', data: { connected: true, version: '0.1.0' } });
        }
      } catch {
        if (daemonConnected) {
          daemonConnected = false;
          wsHub.broadcast({ event: 'daemon.status', data: { connected: false } });
        }
      }
    }, 5000);

    server.addHook('onClose', async () => {
      clearInterval(healthTimer);
      await ipc.disconnect();
    });
  }

  // WebSocket endpoint
  server.register(async function (scope) {
    scope.get('/ws', { websocket: true }, (socket, _req) => {
      wsHub.addClient(socket);
      socket.send(JSON.stringify({
        event: 'daemon.status',
        data: { connected: daemonConnected, version: '0.1.0' },
      }));
      socket.on('close', () => wsHub.removeClient(socket));
    });
  });

  // Health check that actually probes the daemon
  server.get('/api/health', async () => ({
    status: 'ok',
    daemon_connected: daemonConnected,
  }));

  const versionService = new VersionService();
  await server.register(instanceRoutes, { ipc });
  await server.register(configRoutes, { ipc });
  await server.register(versionRoutes, { versionService });

  return { server, ipc, wsHub };
}
