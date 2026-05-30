import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { IpcClient } from '../services/ipc-client';

interface ConfigRouteOptions {
  ipc: IpcClient;
}

export const configRoutes: FastifyPluginAsync<ConfigRouteOptions> = async (
  app: FastifyInstance,
  opts: ConfigRouteOptions
) => {
  const { ipc } = opts;

  // Get server.properties
  app.get('/api/instances/:id/config', async (request, reply) => {
    const { id } = request.params as { id: string };

    const response = await ipc.request('config.get', { instance_id: id });

    if (response.error) {
      if (response.error.code === 'NOT_FOUND') {
        return reply.status(404).send({ error: response.error.message });
      }
      return reply.status(500).send({ error: response.error.message });
    }

    return response.result;
  });

  // Update server.properties
  app.put('/api/instances/:id/config', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { properties } = request.body as any;

    if (!properties || typeof properties !== 'object' || Object.keys(properties).length === 0) {
      return reply.status(400).send({ error: 'Missing or empty properties object' });
    }

    const response = await ipc.request('config.set', {
      instance_id: id,
      properties,
    });

    if (response.error) {
      return reply.status(404).send({ error: response.error.message });
    }

    return { ok: true, ...(response.result as Record<string, unknown> || {}) };
  });
};
