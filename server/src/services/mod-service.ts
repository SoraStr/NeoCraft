import { readFabricMod, readForgeMod } from '@xmcl/mod-parser';
import { openFileSystem } from '@xmcl/system';
import { IpcClient } from './ipc-client.js';

export interface ModInfo {
  /** File name (e.g. "journeymap-1.21.1-6.0.0.jar") */
  fileName: string;
  /** Human-readable name (e.g. "JourneyMap") */
  name: string;
  /** Mod ID (e.g. "journeymap") */
  modid: string;
  /** Version string (e.g. "6.0.0") */
  version: string;
  /** Mod loader: "fabric", "forge", "neoforge", "bukkit", or "unknown" */
  loader: string;
  /** File size in bytes */
  size: number;
  /** Whether the mod is disabled (.disabled suffix) */
  disabled: boolean;
  /** Optional: mod description */
  description?: string;
  /** Optional: authors */
  authors?: string[];
}

interface CachedMods {
  scannedAt: number;
  mods: ModInfo[];
}

/** Call IPC and return the result, throwing on error */
async function ipcCall(ipc: IpcClient, method: string, params: Record<string, unknown>, timeoutMs?: number): Promise<any> {
  const response = await ipc.request(method, params, { timeout: timeoutMs ?? 30000 });
  if (response.error) throw new Error(response.error.message);
  return response.result;
}

/**
 * Read plugin.yml from a Bukkit/Spigot/Paper plugin JAR using @xmcl/system.
 * Returns parsed plugin metadata or null if plugin.yml is not found.
 */
async function readBukkitPlugin(jarBuffer: Buffer): Promise<{
  name: string;
  version: string;
  main: string;
  description?: string;
  author?: string;
  authors?: string[];
  apiVersion?: string;
} | null> {
  let fs;
  try {
    fs = await openFileSystem(new Uint8Array(jarBuffer));
  } catch {
    return null; // Not a valid ZIP/JAR
  }

  try {
    const hasPluginYml = await fs.existsFile('plugin.yml');
    if (!hasPluginYml) return null;

    const content = await fs.readFile('plugin.yml', 'utf-8');
    return parsePluginYml(content);
  } catch {
    return null;
  } finally {
    try { fs.close(); } catch { /* ignore */ }
  }
}

/**
 * Minimal YAML parser for plugin.yml.
 * Only handles the flat key-value pairs and simple string lists we need.
 * Avoids adding a full YAML dependency for this single use case.
 */
function parsePluginYml(content: string): {
  name: string;
  version: string;
  main: string;
  description?: string;
  author?: string;
  authors?: string[];
  apiVersion?: string;
} | null {
  const lines = content.split('\n');
  const values: Record<string, string | string[]> = {};
  let currentListKey: string | null = null;

  for (const rawLine of lines) {
    // Strip comments (not inside quoted strings — but plugin.yml rarely uses them)
    const line = rawLine.split('#')[0];
    const trimmed = line.trimEnd();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Indented lines: part of a list
    if (rawLine.startsWith(' ') || rawLine.startsWith('\t')) {
      if (currentListKey) {
        const item = trimmed
          .replace(/^- /, '')
          .replace(/^["']|["']$/g, '')
          .trim();
        if (item) {
          const existing = values[currentListKey];
          if (Array.isArray(existing)) {
            existing.push(item);
          } else {
            values[currentListKey] = [item];
          }
        }
      }
      continue;
    }

    // key: value
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const val = trimmed.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');

    if (val === '') {
      // Empty value → start of a list block (e.g. "authors:")
      currentListKey = key;
      values[key] = [];
    } else {
      currentListKey = null;
      values[key] = val;
    }
  }

  const name = typeof values.name === 'string' ? values.name : '';
  const main = typeof values.main === 'string' ? values.main : '';
  if (!name && !main) return null;

  const result: any = {
    name: name || main.split('.').pop() || 'Unknown',
    version: typeof values.version === 'string' ? values.version : '',
    main,
  };

  if (typeof values.description === 'string') result.description = values.description;
  if (typeof values.author === 'string') result.author = values.author;
  if (typeof values.api_version === 'string') result.apiVersion = values.api_version;

  // Handle authors list
  const rawAuthors = values.authors;
  if (Array.isArray(rawAuthors) && rawAuthors.length > 0) {
    result.authors = rawAuthors;
  } else if (typeof values.author === 'string') {
    result.authors = [values.author];
  }

  return result;
}

/**
 * Scan mods/ and plugins/ directories of an instance, parse each JAR with
 * @xmcl/mod-parser, and return structured mod info.
 * Results are cached to `mods-cache.json` in the instance directory.
 */
export async function scanMods(
  ipc: IpcClient,
  instanceId: string,
): Promise<ModInfo[]> {
  const dirs = ['mods', 'plugins'];
  const allMods: ModInfo[] = [];

  for (const dir of dirs) {
    // List files in directory
    let fileList: Array<{ name: string; size: number; disabled: boolean }> = [];
    try {
      fileList = await ipcCall(ipc, 'files.list', { instance_id: instanceId, path: dir }) as any[];
    } catch {
      continue; // Directory doesn't exist — skip
    }

    // Include both .jar and .jar.disabled (so the cache tracks disabled mods too)
    const jarFiles = fileList.filter((f: any) =>
      f.name.endsWith('.jar') || f.name.endsWith('.jar.disabled')
    );

    // Process in concurrent batches of 8 to balance speed vs IPC pressure
    const BATCH = 8;
    for (let i = 0; i < jarFiles.length; i += BATCH) {
      const batch = jarFiles.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (file: any) => {
          const readResult = await ipcCall(ipc, 'files.read', {
            instance_id: instanceId,
            path: `${dir}/${file.name}`,
          }, 30000) as { data: string; size: number };
          const jarBuffer = Buffer.from(readResult.data, 'base64');
          return parseModJar(jarBuffer, file.name, file.size, file.disabled);
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          allMods.push(result.value);
        } else if (result.status === 'rejected') {
          const err: any = result.reason;
          if (err?.message?.includes('Daemon') || err?.message?.includes('IPC') || err?.code === 'ECONNREFUSED') {
            throw err;
          }
          console.warn(`[mod-service] Parse failed: ${err?.message || err}`);
        }
      }
    }
  }

  // Cache result in instance directory
  try {
    const cache: CachedMods = { scannedAt: Date.now(), mods: allMods };
    await ipcCall(ipc, 'files.write', {
      instance_id: instanceId,
      path: 'mods-cache.json',
      data: Buffer.from(JSON.stringify(cache)).toString('base64'),
    });
  } catch {
    // Cache write failed — non-fatal
  }

  return allMods;
}

/**
 * Parse a single mod JAR buffer and return structured info.
 * Tries Forge first (covers Forge + NeoForge),
 * then Fabric, then Bukkit/Spigot/Paper (plugin.yml),
 * then falls back to basic file info instead of returning null.
 */
async function parseModJar(
  jarBuffer: Buffer,
  fileName: string,
  size: number,
  disabled: boolean,
): Promise<ModInfo | null> {
  // Try Forge first (covers Forge + NeoForge)
  try {
    const forgeMods = await readForgeMod(jarBuffer);
    if (forgeMods && Array.isArray(forgeMods) && forgeMods.length > 0) {
      const mod = forgeMods[0] as any;
      return {
        fileName,
        name: mod.name || mod.modid || fileName,
        modid: mod.modid || fileName.replace('.jar', ''),
        version: mod.version || '',
        loader: 'forge',
        size,
        disabled,
        description: mod.description,
        authors: mod.authors,
      };
    }
  } catch (err: any) {
    // Only skip parse errors — re-throw fatal errors
    if (err?.code === 'ERR_INVALID_ARG_TYPE' || err?.message?.includes('OOM') || err?.message?.includes('allocation')) {
      throw err;
    }
    // Not a Forge mod — fall through
  }

  // Try Fabric
  try {
    const fabricMod: any = await readFabricMod(jarBuffer);
    if (fabricMod) {
      return {
        fileName,
        name: fabricMod.name || fabricMod.id || fileName,
        modid: fabricMod.id || fileName.replace('.jar', ''),
        version: fabricMod.version || '',
        loader: 'fabric',
        size,
        disabled,
        description: fabricMod.description,
        authors: fabricMod.authors,
      };
    }
  } catch (err: any) {
    if (err?.code === 'ERR_INVALID_ARG_TYPE' || err?.message?.includes('OOM')) {
      throw err;
    }
    // Not a Fabric mod — fall through
  }

  // Try Bukkit/Spigot/Paper (plugin.yml)
  try {
    const plugin = await readBukkitPlugin(jarBuffer);
    if (plugin) {
      return {
        fileName,
        name: plugin.name || fileName.replace(/\.jar(\.disabled)?$/, ''),
        modid: plugin.name || fileName.replace(/\.jar(\.disabled)?$/, ''),
        version: plugin.version || '',
        loader: 'bukkit',
        size,
        disabled,
        description: plugin.description,
        authors: plugin.authors,
      };
    }
  } catch (err: any) {
    if (err?.message?.includes('OOM') || err?.message?.includes('allocation')) {
      throw err;
    }
    // Not a Bukkit plugin — fall through
  }

  // Fallback: treat as unknown JAR so it still shows up in the list
  const bareName = fileName.replace(/\.jar(\.disabled)?$/, '');
  return {
    fileName,
    name: bareName,
    modid: bareName,
    version: '',
    loader: 'unknown',
    size,
    disabled,
  };
}

/**
 * Load cached mod info, or re-scan if cache is missing/stale.
 */
export async function getMods(
  ipc: IpcClient,
  instanceId: string,
  forceRescan = false,
): Promise<ModInfo[]> {
  if (!forceRescan) {
    try {
      const cached = await ipcCall(ipc, 'files.read', {
        instance_id: instanceId,
        path: 'mods-cache.json',
      }) as { data: string };

      const parsed: CachedMods = JSON.parse(Buffer.from(cached.data, 'base64').toString('utf-8'));
      // Cache valid for 1 hour
      if (Date.now() - parsed.scannedAt < 60 * 60 * 1000) {
        return parsed.mods;
      }
    } catch {
      // No cache or stale — rescan
    }
  }

  return scanMods(ipc, instanceId);
}
