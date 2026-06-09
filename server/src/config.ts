import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

export interface RuntimeOptions {
  ipcSocketPath?: string;
  dataDir?: string;
  frontendDist?: string;
  corsOrigins?: string[];
  autoStartDaemon?: boolean;
  daemonStartupRetries?: number;
  daemonStartupRetryDelayMs?: number;
  daemonHealthIntervalMs?: number;
}

export interface RuntimeConfig {
  dataDir: string;
  ipcSocketPath: string;
  frontendDist: string;
  corsOrigins: string[];
  autoStartDaemon: boolean;
  daemonStartupRetries: number;
  daemonStartupRetryDelayMs: number;
  daemonHealthIntervalMs: number;
  authToken: string | null;
}

export interface ListenConfig {
  host: string;
  port: number;
}

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:1145',
  'http://127.0.0.1:1145',
  'http://localhost:3000',
];

export function defaultDataDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || homedir();
  return process.env.NEOCRAFT_DATA_DIR || join(home, '.neocraft');
}

export function defaultIpcAddress(dataDir: string): string {
  if (platform() === 'win32') {
    return process.env.NEOCRAFT_SOCKET || String.raw`\\.\pipe\neocraft-daemon`;
  }
  return process.env.NEOCRAFT_SOCKET || join(dataDir, 'daemon.sock');
}

export function loadRuntimeConfig(options: RuntimeOptions = {}): RuntimeConfig {
  const dataDir = options.dataDir || defaultDataDir();
  return {
    dataDir,
    ipcSocketPath: options.ipcSocketPath || defaultIpcAddress(dataDir),
    frontendDist: options.frontendDist || process.env.NEOCRAFT_FRONTEND_DIST || join(process.cwd(), 'frontend-dist'),
    corsOrigins: options.corsOrigins || envList('NEOCRAFT_CORS_ORIGINS') || DEFAULT_CORS_ORIGINS,
    autoStartDaemon: options.autoStartDaemon ?? process.env.NEOCRAFT_AUTO_START_DAEMON !== 'false',
    daemonStartupRetries: options.daemonStartupRetries ?? numberEnv('NEOCRAFT_DAEMON_STARTUP_RETRIES', 20),
    daemonStartupRetryDelayMs: options.daemonStartupRetryDelayMs ?? numberEnv('NEOCRAFT_DAEMON_RETRY_DELAY_MS', 500),
    daemonHealthIntervalMs: options.daemonHealthIntervalMs ?? numberEnv('NEOCRAFT_DAEMON_HEALTH_INTERVAL_MS', 5000),
    authToken: loadAuthToken(dataDir),
  };
}

export function loadAuthToken(dataDir: string): string | null {
  try {
    return readFileSync(join(dataDir, '.daemon-token'), 'utf-8').trim();
  } catch {
    return null;
  }
}

export function loadListenConfig(): ListenConfig {
  return {
    host: process.env.HOST || '127.0.0.1',
    port: numberEnv('PORT', 3001),
  };
}

function envList(name: string): string[] | null {
  const value = process.env[name];
  if (!value) return null;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
