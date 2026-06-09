import type {
  CreateInstanceInput,
  FabricVersionMeta,
  Instance,
  PluginMarketDetails,
  PluginMarketProvider,
  PluginMarketResult,
  PluginMarketVersion,
  ServerVersion,
} from './types';

const API_HOST = (import.meta.env.VITE_API_HOST || '').replace(/\/$/, '');
const BASE = API_HOST ? `${API_HOST}/api` : '/api';

/** Auth token for daemon API authentication (MAJOR-4). Set via VITE_API_TOKEN env var or setAuthToken(). */
let authToken: string | null = import.meta.env.VITE_API_TOKEN || null;
let authInitPromise: Promise<void> | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

/**
 * Ensure the auth token is fetched before any API call proceeds.
 * Safe to call multiple times — only fetches once.
 * Exported as `initAuth` so WebSocketProvider can eagerly trigger it.
 */
export async function initAuth(): Promise<void> {
  await ensureAuth();
}

/**
 * Internal: fetch the auth token from the server if we don't have one yet.
 * Returns a stable promise so concurrent callers all wait on the same fetch.
 */
async function ensureAuth(): Promise<void> {
  if (authToken) return; // Already have a token (from env or previous fetch)
  if (!authInitPromise) {
    authInitPromise = (async () => {
      try {
        const data = await rawFetch<{ token: string | null }>('/auth-token', { timeoutMs: 5000 });
        if (data?.token) {
          setAuthToken(data.token);
        }
      } catch {
        // Auth might be disabled, or server not ready yet — that's okay.
        // Reset so we retry on the next request.
        console.warn('[API] Failed to fetch auth token; API calls may be unauthorized');
        authInitPromise = null;
      }
    })();
  }
  await authInitPromise;
}

interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

export interface FileEntry {
  name: string;
  size: number;
  modified: number;
  disabled: boolean;
}

export interface ModInfo {
  fileName: string;
  name: string;
  modid: string;
  version: string;
  loader: string;
  size: number;
  disabled: boolean;
  description?: string;
  authors?: string[];
}

/** Build a full API URL from a path (e.g. "/instances/xxx/mods"). */
export function apiUrl(path: string): string {
  return `${BASE}${path}`;
}

/**
 * Low-level fetch without auth initialization.
 * Used internally by ensureAuth() to avoid circular dependency,
 * and by request() after auth is ensured.
 */
async function rawFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 10000;
  const { timeoutMs: _timeoutMs, headers: inputHeaders, ...fetchOptions } = options;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers(inputHeaders);

  if (fetchOptions.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  try {
    const res = await fetch(apiUrl(path), {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await readJson<{ error?: string }>(res);
      throw new Error(body?.error || `HTTP ${res.status}`);
    }

    if (res.status === 204) return undefined as T;
    return (await readJson<T>(res)) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Authenticated API request. Automatically ensures the auth token
 * is fetched before the first call, so no component needs to worry
 * about race conditions with initAuth().
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  await ensureAuth();
  return rawFetch<T>(path, options);
}

async function readJson<T>(res: Response): Promise<T | undefined> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    if (import.meta.env.DEV) {
      console.warn('[API] Failed to parse JSON response:', text.slice(0, 200));
    }
    return undefined;
  }
}

function withQuery(path: string, params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export async function checkHealth(): Promise<{ status: string; daemon_connected: boolean }> {
  return request<{ status: string; daemon_connected: boolean }>('/health');
}

export async function getInstances(): Promise<Instance[]> {
  return request<Instance[]>('/instances');
}

export async function getInstance(id: string): Promise<Instance> {
  return request<Instance>(`/instances/${id}`);
}

export async function createInstance(input: CreateInstanceInput): Promise<Instance> {
  return request<Instance>('/instances', {
    method: 'POST',
    body: JSON.stringify(input),
    timeoutMs: 300000,
  });
}

export async function importInstance(input: {
  name: string;
  sourceDir: string;
  port?: number;
  javaArgs?: string;
  javaPath?: string;
}): Promise<Instance> {
  return request<Instance>('/instances/import', {
    method: 'POST',
    body: JSON.stringify(input),
    timeoutMs: 120000,
  });
}

export async function deleteInstance(id: string): Promise<void> {
  return request<void>(`/instances/${id}`, { method: 'DELETE' });
}

export async function startInstance(id: string): Promise<void> {
  return request<void>(`/instances/${id}/start`, { method: 'POST' });
}

export async function stopInstance(id: string): Promise<void> {
  return request<void>(`/instances/${id}/stop`, { method: 'POST' });
}

export async function restartInstance(id: string): Promise<void> {
  return request<void>(`/instances/${id}/restart`, { method: 'POST' });
}

export async function sendCommand(id: string, command: string): Promise<void> {
  return request<void>(`/instances/${id}/command`, {
    method: 'POST',
    body: JSON.stringify({ command }),
  });
}

export async function sendRconCommand(id: string, command: string): Promise<string> {
  const data = await request<{ result?: string }>(`/instances/${id}/rcon`, {
    method: 'POST',
    body: JSON.stringify({ command }),
  });
  return data.result ?? '';
}

export async function getConfig(id: string): Promise<Record<string, string>> {
  return request<Record<string, string>>(`/instances/${id}/config`);
}

export async function updateConfig(id: string, properties: Record<string, string>): Promise<void> {
  return request<void>(`/instances/${id}/config`, {
    method: 'PUT',
    body: JSON.stringify({ properties }),
  });
}

export async function getVersions(type: string): Promise<ServerVersion[]> {
  return request<ServerVersion[]>(withQuery('/versions', { type }));
}

export async function resolveDownloadUrl(
  type: string,
  version: string,
  loader?: string,
  installer?: string,
): Promise<string> {
  const data = await request<{ downloadUrl: string }>(withQuery('/versions/resolve', {
    type,
    version,
    loader,
    installer,
  }));
  return data.downloadUrl;
}

export async function getFabricLoaderVersions(): Promise<FabricVersionMeta[]> {
  return request<FabricVersionMeta[]>('/versions/fabric/loader');
}

export async function getFabricInstallerVersions(): Promise<FabricVersionMeta[]> {
  return request<FabricVersionMeta[]>('/versions/fabric/installer');
}

export async function listFiles(id: string, path: string): Promise<FileEntry[]> {
  return request<FileEntry[]>(withQuery(`/instances/${id}/files`, { path }));
}

export async function deleteFile(id: string, path: string): Promise<void> {
  return request<void>(withQuery(`/instances/${id}/files`, { path }), { method: 'DELETE' });
}

export async function uploadFile(
  id: string,
  dir: string,
  fileName: string,
  dataBase64: string,
): Promise<void> {
  return request<void>(`/instances/${id}/files`, {
    method: 'POST',
    body: JSON.stringify({ path: `${dir}/${fileName}`, data: dataBase64 }),
  });
}

export async function toggleFileDisabled(id: string, oldPath: string, newPath: string): Promise<void> {
  return request<void>(`/instances/${id}/files`, {
    method: 'PATCH',
    body: JSON.stringify({ oldPath, newPath }),
  });
}

export async function getMods(id: string): Promise<ModInfo[]> {
  return request<ModInfo[]>(`/instances/${id}/mods`);
}

export async function scanMods(id: string): Promise<{ scanned: number; mods: ModInfo[] }> {
  return request<{ scanned: number; mods: ModInfo[] }>(`/instances/${id}/mods/scan`, {
    method: 'POST',
    timeoutMs: 600000,
  });
}

export async function searchPluginMarket(
  provider: PluginMarketProvider,
  query: string,
): Promise<PluginMarketResult[]> {
  return request<PluginMarketResult[]>(withQuery('/plugin-market/search', {
    provider,
    q: query,
    limit: '20',
  }), { timeoutMs: 20000 });
}

export async function getPluginMarketDetails(
  provider: PluginMarketProvider,
  projectId: string,
): Promise<PluginMarketDetails> {
  return request<PluginMarketDetails>(
    `/plugin-market/${provider}/projects/${encodeURIComponent(projectId)}`,
    { timeoutMs: 20000 },
  );
}

export async function getPluginMarketVersions(
  provider: PluginMarketProvider,
  projectId: string,
): Promise<PluginMarketVersion[]> {
  return request<PluginMarketVersion[]>(
    `/plugin-market/${provider}/projects/${encodeURIComponent(projectId)}/versions`,
    { timeoutMs: 20000 },
  );
}
