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

  app.get('/api/versions', async (request) => {
    const { type } = request.query as { type?: string };
    if (type === 'paper') {
      return versionService.getPaperVersions();
    }
    return versionService.getVanillaVersions();
  });
};
