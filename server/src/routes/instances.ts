import { type FastifyInstance, type FastifyPluginAsync } from 'fastify';
import { IpcClient } from '../services/ipc-client.js';
import { RconClient } from '../services/rcon-client.js';
import { getMods, scanMods } from '../services/mod-service.js';
import {
  assertCommand,
  assertInstanceId,
  assertSafeSubpath,
  httpError,
  ipcCall,
  okObject,
  optionalPort,
  sendRouteError,
} from './http.js';

interface InstanceRouteOptions {
  ipc: IpcClient;
}

type ServerType = 'vanilla' | 'paper' | 'spigot' | 'fabric' | 'forge' | 'custom';

interface CreateInstanceBody {
  name?: string;
  type?: string;
  version?: string;
  port?: number;
  downloadUrl?: string;
  javaPath?: string;
}

interface ImportInstanceBody {
  name?: string;
  sourceDir?: string;
  port?: number;
  javaArgs?: string;
  javaPath?: string;
}

interface FileWriteBody {
  path?: string;
  data?: string;
}

interface FileRenameBody {
  oldPath?: string;
  newPath?: string;
}

const VALID_TYPES = new Set<ServerType>(['vanilla', 'paper', 'spigot', 'fabric', 'forge', 'custom']);
const SERVER_NAME_PATTERN = /^[a-zA-Z0-9一-鿿 _-]+$/;
const INSTANCE_IMPORT_TIMEOUT_MS = 1_800_000;

export const instanceRoutes: FastifyPluginAsync<InstanceRouteOptions> = async (
  app: FastifyInstance,
  opts: InstanceRouteOptions,
) => {
  const { ipc } = opts;

  app.get('/api/instances', async (_request, reply) => {
    try {
      const list = await ipcCall<unknown[]>(ipc, 'instance.list', {});
      return Array.isArray(list) ? list : [];
    } catch (error) {
      app.log.error({ error }, 'instance.list failed');
      return sendRouteError(reply, error);
    }
  });

  app.post('/api/instances', async (request, reply) => {
    try {
      const body = (request.body || {}) as CreateInstanceBody;
      const name = assertServerName(body.name);
      const type = assertServerType(body.type);
      const version = assertText(body.version, 'Missing required fields: name, type, version');
      const port = optionalPort(body.port, 25565);

      if (body.downloadUrl && !body.downloadUrl.startsWith('https://')) {
        httpError(400, 'Download URL must use HTTPS.');
      }

      const instance = await ipcCall(ipc, 'instance.create', {
        name,
        type,
        version,
        port,
        download_url: body.downloadUrl || '',
        java_path: body.javaPath || null,
      }, 300000);

      return reply.status(201).send(instance);
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });

  app.post('/api/instances/import', async (request, reply) => {
    try {
      const body = (request.body || {}) as ImportInstanceBody;
      const name = assertServerName(body.name, 'Missing required fields: name, sourceDir');
      const sourceDir = assertText(body.sourceDir, 'Missing required fields: name, sourceDir');

      const instance = await ipcCall(ipc, 'instance.import', {
        name,
        source_dir: sourceDir,
        port: optionalPort(body.port, 25565),
        java_args: body.javaArgs || null,
        java_path: body.javaPath || null,
      }, INSTANCE_IMPORT_TIMEOUT_MS);

      return reply.status(201).send(instance);
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });

  app.get('/api/instances/:id', async (request, reply) => {
    try {
      const id = routeId(request.params);
      return await ipcCall(ipc, 'instance.get', { id });
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });

  app.delete('/api/instances/:id', async (request, reply) => {
    try {
      const id = routeId(request.params);
      await ipcCall(ipc, 'instance.delete', { id });
      return reply.status(204).send();
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });

  app.post('/api/instances/:id/start', async (request, reply) => {
    try {
      const id = routeId(request.params);
      const result = await ipcCall(ipc, 'instance.start', { id });
      return okObject(result);
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });

  app.post('/api/instances/:id/stop', async (request, reply) => {
    try {
      const id = routeId(request.params);
      const result = await ipcCall(ipc, 'instance.stop', { id });
      return okObject(result);
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });

  app.post('/api/instances/:id/restart', async (request, reply) => {
    try {
      const id = routeId(request.params);
      const result = await ipcCall(ipc, 'instance.restart', { id });
      return okObject(result);
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });

  app.post('/api/instances/:id/command', async (request, reply) => {
    try {
      const id = routeId(request.params);
      const command = assertCommand((request.body as { command?: unknown } | undefined)?.command);
      const result = await ipcCall(ipc, 'instance.command', { id, command });
      return okObject(result);
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });

  app.post('/api/instances/:id/rcon', async (request, reply) => {
    try {
      const id = routeId(request.params);
      const command = assertCommand((request.body as { command?: unknown } | undefined)?.command);
      const props = await ipcCall<Record<string, string>>(ipc, 'config.get', { instance_id: id });
      const rconPort = Number.parseInt(props?.['rcon.port'] || '', 10);
      const rconPassword = props?.['rcon.password'] || '';

      if (!rconPort || !rconPassword) {
        httpError(
          400,
          'RCON is not enabled. Set enable-rcon=true, rcon.port, and rcon.password in server.properties.',
        );
      }

      const result = await new RconClient('localhost', rconPort).execute(rconPassword, command);
      return { result };
    } catch (error) {
      return sendRouteError(reply, error, 'RCON error');
    }
  });

  app.get('/api/instances/:id/files', async (request, reply) => {
    try {
      const id = routeId(request.params);
      const { path } = request.query as { path?: string };
      const subpath = path ? assertSafeSubpath(path) : 'mods';
      const files = await ipcCall(ipc, 'files.list', { instance_id: id, path: subpath });
      return files ?? [];
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });

  app.delete('/api/instances/:id/files', async (request, reply) => {
    try {
      const id = routeId(request.params);
      const { path } = request.query as { path?: string };
      return await ipcCall(ipc, 'files.delete', {
        instance_id: id,
        path: assertSafeSubpath(path, 'file path'),
      });
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });

  app.patch('/api/instances/:id/files', async (request, reply) => {
    try {
      const id = routeId(request.params);
      const { oldPath, newPath } = (request.body || {}) as FileRenameBody;
      return await ipcCall(ipc, 'files.rename', {
        instance_id: id,
        old_path: assertSafeSubpath(oldPath, 'paths'),
        new_path: assertSafeSubpath(newPath, 'paths'),
      });
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });

  app.post('/api/instances/:id/files', async (request, reply) => {
    try {
      const id = routeId(request.params);
      const { path, data } = (request.body || {}) as FileWriteBody;
      if (!data) {
        httpError(400, 'Invalid path or missing data.');
      }
      const result = await ipcCall(ipc, 'files.write', {
        instance_id: id,
        path: assertSafeSubpath(path),
        data,
      });
      return reply.status(201).send(result);
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });

  app.get('/api/instances/:id/mods', async (request, reply) => {
    try {
      const id = routeId(request.params);
      return await getMods(ipc, id);
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });

  app.post('/api/instances/:id/mods/scan', async (request, reply) => {
    try {
      const id = routeId(request.params);
      const mods = await scanMods(ipc, id);
      return { scanned: mods.length, mods };
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });
};

function routeId(params: unknown): string {
  return assertInstanceId((params as { id: string }).id);
}

function assertServerType(type: string | undefined): ServerType {
  if (!type || !VALID_TYPES.has(type as ServerType)) {
    httpError(400, `Invalid server type: ${type}. Must be one of: ${Array.from(VALID_TYPES).join(', ')}`);
  }
  return type as ServerType;
}

function assertServerName(name: string | undefined, missingMessage = 'Missing required fields: name, type, version'): string {
  const value = assertText(name, missingMessage);
  if (value.length > 64 || !SERVER_NAME_PATTERN.test(value)) {
    httpError(400, 'Invalid server name. Use letters, numbers, spaces, hyphens, underscores.');
  }
  return value;
}

function assertText(value: string | undefined, missingMessage: string): string {
  if (!value || value.trim().length === 0) {
    httpError(400, missingMessage);
  }
  return value;
}
