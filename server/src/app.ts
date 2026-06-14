import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { IpcClient } from './services/ipc-client.js';
import { WebSocketHub } from './websocket/hub.js';
import { instanceRoutes } from './routes/instances.js';
import { configRoutes } from './routes/config.js';
import { versionRoutes } from './routes/versions.js';
import { pluginMarketRoutes } from './routes/plugin-market.js';
import { modMarketRoutes } from './routes/mod-market.js';
import { VersionService } from './services/version-service.js';
import { PluginMarketService } from './services/plugin-market-service.js';
import { ModMarketService } from './services/mod-market-service.js';
import { ModpackService } from './services/modpack-service.js';
import { ModpackMarketService } from './services/modpack-market-service.js';
import { modpackMarketRoutes } from './routes/modpack-market.js';
import { loadPanelSettings, initPanelSettings } from './services/panel-settings.js';
import { loadRuntimeConfig, loadAuthToken, type RuntimeOptions } from './config.js';
import { DaemonRuntime } from './services/daemon-runtime.js';

export interface AppOptions extends RuntimeOptions {
  mockIpc?: boolean;
}

export interface AppInstance {
  server: FastifyInstance;
  ipc: IpcClient;
  wsHub: WebSocketHub;
  daemon: DaemonRuntime | null;
}

export async function buildApp(options: AppOptions = {}): Promise<AppInstance> {
  const runtimeConfig = loadRuntimeConfig({
    ...options,
    autoStartDaemon: options.mockIpc ? false : options.autoStartDaemon,
  });

  initPanelSettings(loadPanelSettings(runtimeConfig.dataDir));

  const server = Fastify({
    logger: true,
    bodyLimit: 400 * 1024 * 1024,
    genReqId: () => `nc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  });

  await server.register(cors, { origin: runtimeConfig.corsOrigins });
  await server.register(websocket);

  // ── Rate Limiter (MAJOR-3) ──────────────────────────────────────
  const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
  const RATE_MAX = 100;
  const RATE_WINDOW = 60_000;
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of rateLimitMap) {
      if (now > v.resetTime) rateLimitMap.delete(k);
    }
  }, 60_000);
  server.addHook('onClose', () => clearInterval(cleanupTimer));

  server.addHook('onRequest', async (request, reply) => {
    const ip = request.ip;
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetTime) {
      rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    } else if (entry.count >= RATE_MAX) {
      return reply.status(429).send({ error: 'Too many requests. Please try again later.' });
    } else {
      entry.count++;
    }
  });

  // ── API Authentication (MAJOR-4) ────────────────────────────────
  // Re-read the token file on each request so tokens written after startup
  // (e.g. by an auto-started daemon) are picked up without restart.
  server.addHook('onRequest', async (request, reply) => {
    if (request.url === '/api/health' || request.url === '/api/auth-token' || request.url === '/ws') return;
    if (!request.url.startsWith('/api')) return;

    const currentToken = loadAuthToken(runtimeConfig.dataDir);
    if (!currentToken) return; // auth disabled when no token

    const auth = request.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing authorization token' });
    }
    if (auth.slice(7) !== currentToken) {
      return reply.status(401).send({ error: 'Invalid authorization token' });
    }
  });

  const ipc = new IpcClient(runtimeConfig.ipcSocketPath, runtimeConfig.authToken);
  const wsHub = new WebSocketHub();
  const daemon = options.mockIpc
    ? null
    : new DaemonRuntime({
        ipc,
        wsHub,
        config: runtimeConfig,
        logger: server.log,
      });

  if (daemon) {
    await daemon.start();
    server.addHook('onClose', async () => {
      await daemon.close();
    });
  }

  await server.register(async function realtime(scope) {
    scope.get('/ws', { websocket: true }, (socket) => {
      wsHub.addClient(socket);
      socket.send(JSON.stringify({
        event: 'daemon.status',
        data: daemon?.status ?? { connected: false, version: '0.1.0' },
      }));
    });
  });

  server.get('/api/health', async () => ({
    status: 'ok',
    daemon_connected: daemon?.status.connected ?? false,
  }));

  // Provide the auth token to the frontend so it can authenticate API calls.
  // Re-reads the token file each time so it picks up tokens written after startup
  // (e.g. when the daemon is auto-started and generates a new token).
  server.get('/api/auth-token', async () => ({
    token: loadAuthToken(runtimeConfig.dataDir),
  }));

  const versionService = new VersionService();
  const pluginMarketService = new PluginMarketService();
  const modMarketService = new ModMarketService();
  const modpackService = new ModpackService(versionService);
  const modpackMarketService = new ModpackMarketService();
  await server.register(instanceRoutes, { ipc, modpackService, versionService, wsHub });
  await server.register(configRoutes, { ipc });
  await server.register(versionRoutes, { versionService });
  await server.register(pluginMarketRoutes, { service: pluginMarketService, ipc });
  await server.register(modMarketRoutes, { service: modMarketService, ipc });
  await server.register(modpackMarketRoutes, { service: modpackMarketService });

  if (existsSync(runtimeConfig.frontendDist)) {
    await server.register(fastifyStatic, {
      root: runtimeConfig.frontendDist,
      prefix: '/',
    });
    server.setNotFoundHandler(async (request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api') && !request.url.startsWith('/ws')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not found' });
    });
  }

  return { server, ipc, wsHub, daemon };
}
