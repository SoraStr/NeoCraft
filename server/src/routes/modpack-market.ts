import { type FastifyInstance, type FastifyPluginAsync } from 'fastify';
import { ModpackMarketService } from '../services/modpack-market-service.js';
import { httpError, sendRouteError } from './http.js';

interface ModpackMarketRouteOptions {
  service: ModpackMarketService;
}

export const modpackMarketRoutes: FastifyPluginAsync<ModpackMarketRouteOptions> = async (
  app: FastifyInstance,
  opts: ModpackMarketRouteOptions,
) => {
  const { service } = opts;

  app.get('/api/modpack-market/search', async (request, reply) => {
    try {
      const { q, limit } = request.query as { q?: string; limit?: string };
      const results = await service.search(
        assertQuery(q),
        parseLimit(limit),
      );
      return results;
    } catch (error) {
      return sendModpackMarketError(reply, error);
    }
  });

  app.get('/api/modpack-market/projects/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id?: string };
      const details = await service.getDetails(assertProjectId(id));
      return details;
    } catch (error) {
      return sendModpackMarketError(reply, error);
    }
  });

  app.get('/api/modpack-market/projects/:id/versions', async (request, reply) => {
    try {
      const { id } = request.params as { id?: string };
      const { limit } = request.query as { limit?: string };
      const versions = await service.getVersions(
        assertProjectId(id),
        parseLimit(limit),
      );
      return versions;
    } catch (error) {
      return sendModpackMarketError(reply, error);
    }
  });
};

function assertQuery(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 2 || value.length > 80) {
    httpError(400, 'Search query must be 2-80 characters.');
  }
  return value.trim();
}

function assertProjectId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 160) {
    httpError(400, 'Invalid modpack project ID.');
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

function sendModpackMarketError(
  reply: Parameters<typeof sendRouteError>[0],
  error: unknown,
) {
  return sendRouteError(reply, error, 'Modpack market unavailable');
}
