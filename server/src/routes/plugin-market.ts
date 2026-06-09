import { type FastifyInstance, type FastifyPluginAsync } from 'fastify';
import {
  parsePluginMarketProvider,
  PluginMarketService,
  type PluginMarketProvider,
} from '../services/plugin-market-service.js';
import { scanMods } from '../services/mod-service.js';
import { IpcClient } from '../services/ipc-client.js';
import { assertInstanceId, httpError, sendRouteError } from './http.js';

interface PluginMarketRouteOptions {
  service: PluginMarketService;
  ipc: IpcClient;
}

export const pluginMarketRoutes: FastifyPluginAsync<PluginMarketRouteOptions> = async (
  app: FastifyInstance,
  opts: PluginMarketRouteOptions,
) => {
  const { service, ipc } = opts;

  app.get('/api/plugin-market/search', async (request, reply) => {
    try {
      const { provider, q, limit } = request.query as { provider?: string; q?: string; limit?: string };
      const parsedProvider = assertProvider(provider);
      const query = assertQuery(q);
      const results = await service.search(parsedProvider, query, parseLimit(limit));
      return results;
    } catch (error) {
      return sendPluginMarketError(reply, error);
    }
  });

  app.get('/api/plugin-market/:provider/projects/:id', async (request, reply) => {
    try {
      const { provider, id } = request.params as { provider?: string; id?: string };
      const details = await service.getDetails(assertProvider(provider), assertProjectId(id));
      return details;
    } catch (error) {
      return sendPluginMarketError(reply, error);
    }
  });

  app.get('/api/plugin-market/:provider/projects/:id/versions', async (request, reply) => {
    try {
      const { provider, id } = request.params as { provider?: string; id?: string };
      const { limit } = request.query as { limit?: string };
      const versions = await service.getVersions(assertProvider(provider), assertProjectId(id), parseLimit(limit));
      return versions;
    } catch (error) {
      return sendPluginMarketError(reply, error);
    }
  });

  app.post('/api/instances/:id/plugin-market/install', async (request, reply) => {
    try {
      const { id } = request.params as { id?: string };
      const body = (request.body || {}) as { provider?: unknown; projectId?: unknown; versionId?: unknown };
      const instanceId = assertInstanceId(id || '');
      const installResult = await service.installPlugin(ipc, instanceId, {
        provider: assertProvider(body.provider),
        projectId: assertProjectId(body.projectId),
        versionId: assertVersionId(body.versionId),
      });
      const mods = await scanMods(ipc, instanceId);
      return {
        ...installResult,
        mods,
      };
    } catch (error) {
      return sendPluginMarketError(reply, error);
    }
  });
};

function assertProvider(value: unknown): PluginMarketProvider {
  try {
    return parsePluginMarketProvider(value);
  } catch {
    httpError(400, 'Invalid plugin market provider.');
  }
}

function assertQuery(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 2 || value.length > 80) {
    httpError(400, 'Search query must be 2-80 characters.');
  }
  return value.trim();
}

function assertProjectId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 160) {
    httpError(400, 'Invalid plugin market project ID.');
  }
  return value.trim();
}

function assertVersionId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 160) {
    httpError(400, 'Invalid plugin market version ID.');
  }
  return value.trim();
}

function parseLimit(value: unknown): number {
  if (value === undefined) return 20;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    httpError(400, 'Limit must be a positive integer.');
  }
  return Number.parseInt(value, 10);
}

function sendPluginMarketError(reply: Parameters<typeof sendRouteError>[0], error: unknown) {
  return sendRouteError(reply, error, 'Plugin market unavailable');
}
