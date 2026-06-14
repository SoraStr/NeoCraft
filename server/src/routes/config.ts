import { type FastifyInstance, type FastifyPluginAsync } from 'fastify';
import { IpcClient } from '../services/ipc-client.js';
import { assertInstanceId, ipcCall, okObject, sendRouteError, httpError } from './http.js';
import { getPanelSettings, updatePanelSettings } from '../services/panel-settings.js';

interface ConfigRouteOptions {
  ipc: IpcClient;
}

export const configRoutes: FastifyPluginAsync<ConfigRouteOptions> = async (
  app: FastifyInstance,
  opts: ConfigRouteOptions,
) => {
  const { ipc } = opts;

  app.get('/api/java-versions', async (_request, reply) => {
    try {
      const versions = await ipcCall(ipc, 'java.detect', {});
      return versions ?? [];
    } catch (error) {
      return sendRouteError(reply, error, 'Java detection failed');
    }
  });

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

  app.get('/api/panel-settings', async (_request, reply) => {
    try {
      const settings = getPanelSettings();
      // Only return safe fields (strip internal data)
      return {
        host: settings.host,
        port: settings.port,
        allowedHosts: settings.allowedHosts,
      };
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });

  app.put('/api/panel-settings', async (request, reply) => {
    try {
      const body = (request.body || {}) as { host?: string; port?: number; allowedHosts?: string[] };
      const partial: Record<string, unknown> = {};

      if (typeof body.host === 'string' && body.host.trim()) {
        partial.host = body.host.trim();
      }
      if (typeof body.port === 'number' && body.port > 0 && body.port <= 65535) {
        partial.port = body.port;
      }
      if (Array.isArray(body.allowedHosts)) {
        partial.allowedHosts = body.allowedHosts
          .filter((h): h is string => typeof h === 'string')
          .map((h) => h.trim())
          .filter(Boolean);
      }

      const updated = updatePanelSettings(partial as Partial<{ host: string; port: number; allowedHosts: string[] }>);
      return {
        host: updated.host,
        port: updated.port,
        allowedHosts: updated.allowedHosts,
      };
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });
};
