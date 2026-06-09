import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { VersionService } from '../services/version-service.js';

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

  // Fabric loader versions
  app.get('/api/versions/fabric/loader', async (_request, reply) => {
    try {
      const loaders = await versionService.getFabricLoaderVersions();
      return loaders;
    } catch (err: any) {
      return reply.status(502).send({ error: `Failed to fetch Fabric loaders: ${err.message}` });
    }
  });

  // Fabric installer versions
  app.get('/api/versions/fabric/installer', async (_request, reply) => {
    try {
      const installers = await versionService.getFabricInstallerVersions();
      return installers;
    } catch (err: any) {
      return reply.status(502).send({ error: `Failed to fetch Fabric installers: ${err.message}` });
    }
  });

  // Resolve download URL for a specific version (fast — 1-2 API calls)
  app.get('/api/versions/resolve', async (request, reply) => {
    try {
      const { type, version, loader, installer } = request.query as {
        type?: string; version?: string; loader?: string; installer?: string;
      };
      if (!type || !version) {
        return reply.status(400).send({ error: 'Missing ?type= and ?version= parameters' });
      }
      const downloadUrl = await versionService.resolveDownloadUrl(type, version, loader, installer);
      return { downloadUrl };
    } catch (err: any) {
      return reply.status(502).send({ error: `Failed to resolve download: ${err.message}` });
    }
  });
};
