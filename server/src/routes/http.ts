import type { FastifyReply } from 'fastify';
import type { IpcClient, IpcResponse } from '../services/ipc-client.js';

export class HttpError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}

export function httpError(statusCode: number, message: string): never {
  throw new HttpError(statusCode, message);
}

export async function ipcCall<T = unknown>(
  ipc: IpcClient,
  method: string,
  params: Record<string, unknown>,
  timeoutMs = 30000,
): Promise<T> {
  const response: IpcResponse = await ipc.request(method, params, { timeout: timeoutMs });
  if (response.error) {
    throw new HttpError(daemonStatusCode(response.error.code), response.error.message);
  }
  return response.result as T;
}

export function sendRouteError(reply: FastifyReply, error: unknown, prefix = 'Daemon unavailable'): FastifyReply {
  if (error instanceof HttpError) {
    return reply.status(error.statusCode).send({ error: error.message });
  }

  const message = error instanceof Error ? error.message : String(error);
  return reply.status(503).send({ error: `${prefix}: ${message}` });
}

export function assertInstanceId(id: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 64) {
    httpError(400, 'Invalid instance ID.');
  }
  return id;
}

export function assertSafeSubpath(path: string | undefined, label = 'path'): string {
  if (!path || path.includes('..') || path.includes('\\') || path.includes(':') || path.startsWith('/')) {
    httpError(400, `Invalid ${label}.`);
  }
  return path;
}

export function optionalPort(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 65535) {
    httpError(400, 'Port must be an integer from 0 to 65535.');
  }
  return value;
}

export function assertCommand(command: unknown): string {
  if (typeof command !== 'string' || command.trim().length === 0) {
    httpError(400, 'Missing command.');
  }
  return command;
}

export function okObject(result: unknown): Record<string, unknown> {
  return { ok: true, ...((result as Record<string, unknown>) || {}) };
}

function daemonStatusCode(code: string): number {
  switch (code) {
    case 'NOT_FOUND':
      return 404;
    case 'PORT_IN_USE':
    case 'PORT_UNAVAILABLE':
      return 409;
    case 'TOO_LARGE':
      return 413;
    case 'INVALID_PARAMS':
    case 'INVALID_PORT':
    case 'INVALID_PATH':
    case 'DECODE_ERROR':
      return 400;
    default:
      return 400;
  }
}
