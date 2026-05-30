import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { VersionService } from '../services/version-service';

interface VersionRouteOptions {
  versionService: VersionService;
}

export const versionRoutes: FastifyPluginAsync<VersionRouteOptions> = async (
  app: FastifyInstance,
  opts: VersionRouteOptions
) => {
  const { versionService } = opts;

  app.get('/api/versions', async (request, reply) => {
    try {
      const { type } = request.query as { type?: string };
      if (!type) {
        return reply.status(400).send({ error: 'Missing ?type= query parameter' });
      }
      const versions = await versionService.getVersions(type);
      return versions;
    } catch (err: any) {
      return reply.status(502).send({ error: `Failed to fetch versions: ${err.message}` });
    }
  });
};
