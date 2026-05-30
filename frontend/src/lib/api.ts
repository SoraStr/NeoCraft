import type { Instance, ServerVersion, CreateInstanceInput } from './types';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 10000;
  const { timeoutMs: _, ...fetchOptions } = (options || {});
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Only set Content-Type when there's a body (avoids Fastify empty-body errors)
    const headers: Record<string, string> = {};
    if (fetchOptions.body) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${BASE}${path}`, {
      headers,
      signal: controller.signal,
      ...fetchOptions,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as any).error || `HTTP ${res.status}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  } catch (err: any) {
    if (err.name === 'AbortError') throw new Error('Request timed out');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkHealth(): Promise<{ status: string; daemon_connected: boolean }> {
  const res = await fetch(`${BASE}/health`);
  return res.json();
}

export async function getInstances(): Promise<Instance[]> {
  return request<Instance[]>('/instances');
}

export async function getInstance(id: string): Promise<Instance> {
  return request<Instance>(`/instances/${id}`);
}

export async function createInstance(input: CreateInstanceInput): Promise<Instance> {
  // Long timeout — downloading the JAR can take minutes
  return request<Instance>('/instances', {
    method: 'POST',
    body: JSON.stringify(input),
    timeoutMs: 300000, // 5 minutes
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
  // Version list fetch is fast (one API call), use default 10s timeout
  return request<ServerVersion[]>(`/versions?type=${type}`);
}

export async function resolveDownloadUrl(type: string, version: string): Promise<string> {
  const res = await fetch(`${BASE}/versions/resolve?type=${encodeURIComponent(type)}&version=${encodeURIComponent(version)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.downloadUrl;
}
