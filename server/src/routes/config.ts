import { type FastifyInstance, type FastifyPluginAsync } from 'fastify';
import { IpcClient } from '../services/ipc-client.js';
import { assertInstanceId, ipcCall, okObject, sendRouteError } from './http.js';

interface ConfigRouteOptions {
  ipc: IpcClient;
}

export const configRoutes: FastifyPluginAsync<ConfigRouteOptions> = async (
  app: FastifyInstance,
  opts: ConfigRouteOptions,
) => {
  const { ipc } = opts;

  app.get('/api/instances/:id/config', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      return await ipcCall(ipc, 'config.get', { instance_id: assertInstanceId(id) });
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });

  app.put('/api/instances/:id/config', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { properties } = (request.body || {}) as { properties?: unknown };

      if (
        !properties
        || typeof properties !== 'object'
        || Array.isArray(properties)
        || Object.keys(properties).length === 0
      ) {
        return reply.status(400).send({ error: 'Missing or empty properties object' });
      }

      const result = await ipcCall(ipc, 'config.set', {
        instance_id: assertInstanceId(id),
        properties: properties as Record<string, unknown>,
      });

      return okObject(result);
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });
};
