import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { IpcClient } from '../services/ipc-client';

interface InstanceRouteOptions {
  ipc: IpcClient;
}

const VALID_TYPES = ['vanilla', 'paper', 'spigot', 'fabric'];

export const instanceRoutes: FastifyPluginAsync<InstanceRouteOptions> = async (
  app: FastifyInstance,
  opts: InstanceRouteOptions
) => {
  const { ipc } = opts;

  // List all instances
  app.get('/api/instances', async () => {
    const response = await ipc.request('instance.list', {});
    return response.result ?? [];
  });

  // Create instance
  app.post('/api/instances', async (request, reply) => {
    const body = request.body as { name?: string; type?: string; version?: string; port?: number };
    const { name, type, version, port } = body;

    // Validate
    if (!name || !type || !version) {
      return reply.status(400).send({ error: 'Missing required fields: name, type, version' });
    }

    if (!VALID_TYPES.includes(type)) {
      return reply.status(400).send({
        error: `Invalid server type: ${type}. Must be one of: ${VALID_TYPES.join(', ')}`,
      });
    }

    const response = await ipc.request('instance.create', {
      name,
      type,
      version,
      port: port || 25565,
    });

    if (response.error) {
      return reply.status(400).send({ error: response.error.message });
    }

    return reply.status(201).send(response.result);
  });

  // Get instance by ID
  app.get('/api/instances/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const response = await ipc.request('instance.get', { id });

    if (response.error) {
      return reply.status(404).send({ error: response.error.message });
    }

    return response.result;
  });

  // Delete instance
  app.delete('/api/instances/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const response = await ipc.request('instance.delete', { id });

    if (response.error) {
      const status = response.error.code === 'NOT_FOUND' ? 404 : 409;
      return reply.status(status).send({ error: response.error.message });
    }

    return reply.status(204).send();
  });

  // Start instance
  app.post('/api/instances/:id/start', async (request, reply) => {
    const { id } = request.params as { id: string };
    const response = await ipc.request('instance.start', { id });

    if (response.error) {
      const status = response.error.code === 'NOT_FOUND' ? 404 : 409;
      return reply.status(status).send({ error: response.error.message });
    }

    return { ok: true, ...(response.result as Record<string, unknown> || {}) };
  });

  // Stop instance
  app.post('/api/instances/:id/stop', async (request, reply) => {
    const { id } = request.params as { id: string };
    const response = await ipc.request('instance.stop', { id });

    if (response.error) {
      return reply.status(404).send({ error: response.error.message });
    }

    return { ok: true, ...(response.result as Record<string, unknown> || {}) };
  });

  // Restart instance
  app.post('/api/instances/:id/restart', async (request, reply) => {
    const { id } = request.params as { id: string };
    const response = await ipc.request('instance.restart', { id });

    if (response.error) {
      return reply.status(404).send({ error: response.error.message });
    }

    return { ok: true, ...(response.result as Record<string, unknown> || {}) };
  });
};
