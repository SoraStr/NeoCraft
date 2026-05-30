import type { Instance, ServerVersion, CreateInstanceInput } from './types';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
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
  return request<ServerVersion[]>(`/versions?type=${type}`);
}
