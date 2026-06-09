import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { join, resolve } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';

export interface SpawnDaemonOptions {
  socketPath: string;
  dataDir: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  logger?: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
}

export function findDaemonBinary(cwd = process.cwd(), env = process.env): string | null {
  if (env.NEOCRAFT_DAEMON_BIN && existsSync(env.NEOCRAFT_DAEMON_BIN)) {
    return env.NEOCRAFT_DAEMON_BIN;
  }

  const exeExt = platform() === 'win32' ? '.exe' : '';
  const name = `neocraft-daemon${exeExt}`;
  const base = resolve(cwd);
  const candidates = [
    join(base, '..', 'daemon', 'target', 'release', name),
    join(base, '..', 'daemon', 'target', 'debug', name),
    join(base, 'daemon', 'target', 'release', name),
    join(base, 'daemon', 'target', 'debug', name),
    join(base, '..', '..', 'daemon', 'target', 'release', name),
    join(base, '..', '..', 'daemon', 'target', 'debug', name),
  ];

  return candidates.find((candidate) => existsSync(candidate)) || null;
}

export function spawnDaemon(options: SpawnDaemonOptions): ChildProcess | null {
  const bin = findDaemonBinary(options.cwd, options.env);
  if (!bin) {
    options.logger?.warn('Daemon binary not found. Build it with: cd daemon && cargo build');
    return null;
  }

  options.logger?.info({ bin }, 'Auto-starting daemon');
  const child = spawn(bin, [
    '--socket',
    options.socketPath,
    '--data-dir',
    options.dataDir,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  child.stdout?.on('data', (chunk) => {
    options.logger?.info({ daemon: chunk.toString().trimEnd() }, 'daemon stdout');
  });
  child.stderr?.on('data', (chunk) => {
    options.logger?.warn({ daemon: chunk.toString().trimEnd() }, 'daemon stderr');
  });
  child.on('exit', (code, signal) => {
    options.logger?.warn({ code, signal }, 'Daemon process exited');
  });

  return child;
}
