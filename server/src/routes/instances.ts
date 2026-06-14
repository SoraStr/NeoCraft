import { type FastifyInstance, type FastifyPluginAsync } from 'fastify';
import { IpcClient } from '../services/ipc-client.js';
import { RconClient } from '../services/rcon-client.js';
import { getMods, scanMods } from '../services/mod-service.js';
import { ModpackService, sanitizeFileName } from '../services/modpack-service.js';
import { VersionService } from '../services/version-service.js';
import { checkPort } from '../services/port-check.js';
import { WebSocketHub } from '../websocket/hub.js';
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
  modpackService?: ModpackService;
  versionService?: VersionService;
  wsHub?: WebSocketHub;
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

  app.post('/api/instances/import-modpack', async (request, reply) => {
    try {
      const { modpackService, versionService } = opts;
      if (!modpackService || !versionService) {
        httpError(500, 'Modpack service not available.');
      }

      const body = request.body as { url?: string } | undefined;
      const url = (body?.url || '').trim();
      if (!url) {
        httpError(400, 'Missing modpack URL.');
      }

      const info = await modpackService.fetchAndParse(url);
      const { manifest, serverType, minecraftVersion, loaderVersion, installerVersion } = info;

      // Resolve server JAR download URL
      let downloadUrl: string;
      if (serverType === 'fabric') {
        downloadUrl = await versionService.resolveDownloadUrl(
          'fabric', minecraftVersion, loaderVersion, installerVersion,
        );
      } else if (serverType === 'forge') {
        // Forge modpacks: create a vanilla instance as base, mods will be added.
        // The Forge installer must be run separately by the user.
        downloadUrl = await versionService.resolveDownloadUrl('vanilla', minecraftVersion);
      } else {
        downloadUrl = await versionService.resolveDownloadUrl('vanilla', minecraftVersion);
      }

      const serverName = manifest.name || 'Modpack Server';
      const port = optionalPort(undefined, 25565);

      // Create the instance with the server JAR
      const instance = await ipcCall(ipc, 'instance.create', {
        name: serverName.slice(0, 64),
        type: serverType === 'forge' ? 'forge' : serverType === 'fabric' ? 'fabric' : 'vanilla',
        version: minecraftVersion,
        port,
        download_url: downloadUrl,
        java_path: null,
      }, 300000);

      const instanceId = (instance as { id: string }).id;
      if (!instanceId) {
        throw new Error('Instance creation did not return an ID.');
      }

      // Download and install server-side mods
      const serverFiles = modpackService.filterServerFiles(manifest.files);
      const totalMods = serverFiles.length;
      let installedMods = 0;
      let failedMods = 0;
      const failures: string[] = [];
      const taskId = `modpack:${instanceId}`;

      // Broadcast initial progress
      broadcastProgress(opts.wsHub, taskId, 0, totalMods, 0, installedMods, failedMods, 'downloading_mods');

      for (const file of serverFiles) {
        const downloadUrl = file.downloads?.[0];
        if (!downloadUrl || !modpackService.isTrustedDownloadUrl(downloadUrl)) {
          failedMods += 1;
          failures.push(`${file.path} (untrusted or missing URL)`);
          broadcastProgress(opts.wsHub, taskId, installedMods + failedMods, totalMods, 0, installedMods, failedMods, 'downloading_mods');
          continue;
        }

        try {
          broadcastProgress(opts.wsHub, taskId, installedMods + failedMods, totalMods, 0, installedMods, failedMods, 'downloading_mods', file.path);

          const modBytes = await modpackService.downloadMod(downloadUrl);
          const fileName = sanitizeFileName(file.path);
          const modDir = file.path.includes('/')
            ? file.path.substring(0, file.path.lastIndexOf('/'))
            : 'mods';
          const targetPath = `${modDir}/${fileName}`;

          await ipcCall(ipc, 'files.write', {
            instance_id: instanceId,
            path: targetPath,
            data: Buffer.from(modBytes).toString('base64'),
          }, 120000);

          installedMods += 1;
          broadcastProgress(opts.wsHub, taskId, installedMods + failedMods, totalMods, modBytes.length, installedMods, failedMods, 'downloading_mods', file.path);
        } catch (err) {
          failedMods += 1;
          failures.push(`${file.path}: ${err instanceof Error ? err.message : 'Unknown error'}`);
          broadcastProgress(opts.wsHub, taskId, installedMods + failedMods, totalMods, 0, installedMods, failedMods, 'downloading_mods', file.path);
        }
      }

      // Final progress
      broadcastProgress(opts.wsHub, taskId, totalMods, totalMods, 0, installedMods, failedMods, 'complete');

      return reply.status(201).send({
        ...instance as Record<string, unknown>,
        modpack: {
          name: manifest.name,
          version: manifest.versionId,
          serverType,
          totalMods: serverFiles.length,
          installedMods,
          failedMods,
          failures: failures.slice(0, 10),
        },
      });
    } catch (error) {
      return sendRouteError(reply, error, 'Modpack import failed');
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

  app.post('/api/instances/:id/check-port', async (request, reply) => {
    try {
      const id = routeId(request.params);
      const instance = await ipcCall<{ port: number }>(ipc, 'instance.get', { id });
      const result = await checkPort(instance.port);
      return result;
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

function broadcastProgress(
  wsHub: WebSocketHub | undefined,
  taskId: string,
  downloaded: number,
  total: number,
  bytes: number,
  installed: number,
  failed: number,
  phase: string,
  currentFile?: string,
): void {
  if (!wsHub) return;
  const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
  wsHub.broadcast({
    event: 'download.progress',
    data: {
      task_id: taskId,
      downloaded: bytes,
      total: 0,
      percent,
      phase,
      status: currentFile,
      modpack_installed: installed,
      modpack_failed: failed,
      modpack_total: total,
      modpack_done: downloaded,
    },
  });
}
