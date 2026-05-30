import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { IpcClient } from '../services/ipc-client';

interface InstanceRouteOptions {
  ipc: IpcClient;
}

const VALID_TYPES = ['vanilla', 'paper', 'spigot', 'fabric'];

/** Wrap IPC calls to catch connection errors and return 503 */
async function ipcCall(
  ipc: IpcClient,
  method: string,
  params: Record<string, unknown>,
  timeoutMs?: number,
) {
  const response = await ipc.request(method, params, { timeout: timeoutMs ?? 30000 });
  if (response.error) {
    throw { statusCode: response.error.code === 'NOT_FOUND' ? 404 : 400, message: response.error.message };
  }
  return response;
}

export const instanceRoutes: FastifyPluginAsync<InstanceRouteOptions> = async (
  app: FastifyInstance,
  opts: InstanceRouteOptions
) => {
  const { ipc } = opts;

  // List all instances
  app.get('/api/instances', async (_request, reply) => {
    try {
      const response = await ipcCall(ipc, 'instance.list', {});
      return response.result ?? [];
    } catch (err: any) {
      if (err.statusCode) return reply.status(err.statusCode).send({ error: err.message });
      return reply.status(503).send({ error: `Daemon unavailable: ${err.message}` });
    }
  });

  // Create instance
  app.post('/api/instances', async (request, reply) => {
    try {
      const body = request.body as { name?: string; type?: string; version?: string; port?: number; downloadUrl?: string };
      const { name, type, version, port, downloadUrl } = body;

      if (!name || !type || !version) {
        return reply.status(400).send({ error: 'Missing required fields: name, type, version' });
      }
      if (!VALID_TYPES.includes(type)) {
        return reply.status(400).send({ error: `Invalid server type: ${type}. Must be one of: ${VALID_TYPES.join(', ')}` });
      }

      // Long timeout — daemon downloads the JAR during creation
      const response = await ipcCall(ipc, 'instance.create', { name, type, version, port: port || 25565, download_url: downloadUrl || '' }, 300000);
      return reply.status(201).send(response.result);
    } catch (err: any) {
      if (err.statusCode) return reply.status(err.statusCode).send({ error: err.message });
      return reply.status(503).send({ error: `Daemon unavailable: ${err.message}` });
    }
  });

  // Get instance by ID
  app.get('/api/instances/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const response = await ipcCall(ipc, 'instance.get', { id });
      return response.result;
    } catch (err: any) {
      if (err.statusCode) return reply.status(err.statusCode).send({ error: err.message });
      return reply.status(503).send({ error: `Daemon unavailable: ${err.message}` });
    }
  });

  // Delete instance
  app.delete('/api/instances/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const response = await ipcCall(ipc, 'instance.delete', { id });
      return reply.status(204).send();
    } catch (err: any) {
      if (err.statusCode) return reply.status(err.statusCode).send({ error: err.message });
      return reply.status(503).send({ error: `Daemon unavailable: ${err.message}` });
    }
  });

  // Start instance
  app.post('/api/instances/:id/start', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const response = await ipcCall(ipc, 'instance.start', { id });
      return { ok: true, ...(response.result as Record<string, unknown> || {}) };
    } catch (err: any) {
      if (err.statusCode) return reply.status(err.statusCode).send({ error: err.message });
      return reply.status(503).send({ error: `Daemon unavailable: ${err.message}` });
    }
  });

  // Stop instance
  app.post('/api/instances/:id/stop', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const response = await ipcCall(ipc, 'instance.stop', { id });
      return { ok: true, ...(response.result as Record<string, unknown> || {}) };
    } catch (err: any) {
      if (err.statusCode) return reply.status(err.statusCode).send({ error: err.message });
      return reply.status(503).send({ error: `Daemon unavailable: ${err.message}` });
    }
  });

  // Restart instance
  app.post('/api/instances/:id/restart', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const response = await ipcCall(ipc, 'instance.restart', { id });
      return { ok: true, ...(response.result as Record<string, unknown> || {}) };
    } catch (err: any) {
      if (err.statusCode) return reply.status(err.statusCode).send({ error: err.message });
      return reply.status(503).send({ error: `Daemon unavailable: ${err.message}` });
    }
  });
};
