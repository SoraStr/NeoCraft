import { type FastifyInstance, type FastifyPluginAsync } from 'fastify';
import {
  ModMarketService,
  parseModMarketLoader,
  parseModMarketProvider,
  type ModMarketLoader,
  type ModMarketProvider,
} from '../services/mod-market-service.js';
import { scanMods } from '../services/mod-service.js';
import { IpcClient } from '../services/ipc-client.js';
import { assertInstanceId, httpError, sendRouteError } from './http.js';

interface ModMarketRouteOptions {
  service: ModMarketService;
  ipc: IpcClient;
}

export const modMarketRoutes: FastifyPluginAsync<ModMarketRouteOptions> = async (
  app: FastifyInstance,
  opts: ModMarketRouteOptions,
) => {
  const { service, ipc } = opts;

  app.get('/api/mod-market/search', async (request, reply) => {
    try {
      const { loader, q, gameVersion, limit } = request.query as {
        loader?: string;
        q?: string;
        gameVersion?: string;
        limit?: string;
      };
      const results = await service.search(
        assertLoader(loader),
        assertQuery(q),
        optionalGameVersion(gameVersion),
        parseLimit(limit),
      );
      return results;
    } catch (error) {
      return sendModMarketError(reply, error);
    }
  });

  app.get('/api/mod-market/:provider/projects/:id', async (request, reply) => {
    try {
      const { provider, id } = request.params as { provider?: string; id?: string };
      assertProvider(provider);
      const details = await service.getDetails(assertProjectId(id));
      return details;
    } catch (error) {
      return sendModMarketError(reply, error);
    }
  });

  app.get('/api/mod-market/:provider/projects/:id/versions', async (request, reply) => {
    try {
      const { provider, id } = request.params as { provider?: string; id?: string };
      const { loader, gameVersion, limit } = request.query as {
        loader?: string;
        gameVersion?: string;
        limit?: string;
      };
      assertProvider(provider);
      const versions = await service.getVersions(
        assertProjectId(id),
        assertLoader(loader),
        optionalGameVersion(gameVersion),
        parseLimit(limit),
      );
      return versions;
    } catch (error) {
      return sendModMarketError(reply, error);
    }
  });

  app.post('/api/instances/:id/mod-market/install', async (request, reply) => {
    try {
      const { id } = request.params as { id?: string };
      const body = (request.body || {}) as {
        provider?: unknown;
        projectId?: unknown;
        versionId?: unknown;
        loader?: unknown;
        gameVersion?: unknown;
      };
      const instanceId = assertInstanceId(id || '');
      const installResult = await service.installMod(ipc, instanceId, {
        provider: assertProvider(body.provider),
        projectId: assertProjectId(body.projectId),
        versionId: assertVersionId(body.versionId),
        loader: assertLoader(body.loader),
        gameVersion: optionalGameVersion(body.gameVersion),
      });
      const mods = await scanMods(ipc, instanceId);
      return {
        ...installResult,
        mods,
      };
    } catch (error) {
      return sendModMarketError(reply, error);
    }
  });
};

function assertProvider(value: unknown): ModMarketProvider {
  try {
    return parseModMarketProvider(value);
  } catch {
    httpError(400, 'Invalid mod market provider.');
  }
}

function assertLoader(value: unknown): ModMarketLoader {
  try {
    return parseModMarketLoader(value);
  } catch {
    httpError(400, 'Invalid mod loader.');
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
    httpError(400, 'Invalid mod market project ID.');
  }
  return value.trim();
}

function assertVersionId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 160) {
    httpError(400, 'Invalid mod market version ID.');
  }
  return value.trim();
}

function optionalGameVersion(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.trim().length > 40) {
    httpError(400, 'Invalid game version.');
  }
  return extractMinecraftVersion(value.trim());
}

function parseLimit(value: unknown): number {
  if (value === undefined) return 20;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    httpError(400, 'Limit must be a positive integer.');
  }
  return Number.parseInt(value, 10);
}

function sendModMarketError(reply: Parameters<typeof sendRouteError>[0], error: unknown) {
  return sendRouteError(reply, error, 'Mod market unavailable');
}

function extractMinecraftVersion(version: string): string {
  return version.match(/\b\d+\.\d+(?:\.\d+)?\b/)?.[0] || version;
}
