import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import type { FastifyBaseLogger } from 'fastify';
import type { RuntimeConfig } from '../config.js';
import { IpcClient, type IpcEvent } from './ipc-client.js';
import { spawnDaemon } from './daemon-process.js';
import { WebSocketHub } from '../websocket/hub.js';

export interface DaemonRuntimeOptions {
  ipc: IpcClient;
  wsHub: WebSocketHub;
  config: RuntimeConfig;
  logger: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
}

export interface DaemonStatus {
  connected: boolean;
  version: string;
}

export class DaemonRuntime {
  private connected = false;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribeEvents: (() => void) | null = null;
  private child: ChildProcess | null = null;

  constructor(private readonly options: DaemonRuntimeOptions) {}

  get status(): DaemonStatus {
    return {
      connected: this.connected,
      version: '0.1.0',
    };
  }

  async start(): Promise<void> {
    await this.connectOrStart();
    this.unsubscribeEvents = this.options.ipc.onEvent((event) => this.forwardEvent(event));
    this.healthTimer = setInterval(() => {
      void this.checkHealth();
    }, this.options.config.daemonHealthIntervalMs);
  }

  async close(): Promise<void> {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    this.unsubscribeEvents?.();
    this.unsubscribeEvents = null;
    await this.options.ipc.disconnect();
    if (this.child && !this.child.killed) {
      this.child.kill();
    }
    this.child = null;
  }

  private async connectOrStart(): Promise<void> {
    try {
      await this.options.ipc.connect();
      this.setConnected(true);
      this.options.logger.info({ socket: this.options.config.ipcSocketPath }, 'Connected to daemon');
      return;
    } catch (error) {
      this.options.logger.warn(
        { socket: this.options.config.ipcSocketPath, error },
        'Daemon not reachable',
      );
    }

    if (!this.options.config.autoStartDaemon) {
      this.options.logger.warn('Daemon auto-start disabled');
      return;
    }

    this.child = spawnDaemon({
      socketPath: this.options.config.ipcSocketPath,
      dataDir: this.options.config.dataDir,
      logger: this.options.logger,
    });
    if (!this.child) return;

    // Re-read the auth token that the daemon just wrote to disk.
    const token = readTokenFileSync(this.options.config.dataDir);
    if (token) {
      this.options.ipc.setAuthToken(token);
    }

    for (let attempt = 1; attempt <= this.options.config.daemonStartupRetries; attempt += 1) {
      await delay(this.options.config.daemonStartupRetryDelayMs);
      try {
        await this.options.ipc.connect();
        this.setConnected(true);
        this.options.logger.info({ attempt }, 'Daemon auto-started and connected');
        return;
      } catch (error) {
        if (attempt === this.options.config.daemonStartupRetries) {
          this.options.logger.warn({ attempt, error }, 'Daemon still unreachable after startup retries');
        }
      }
    }
  }

  private async checkHealth(): Promise<void> {
    try {
      await this.options.ipc.request('instance.list', {}, { timeout: 2000 });
      this.setConnected(true);
    } catch {
      this.setConnected(false);
    }
  }

  private forwardEvent(event: IpcEvent): void {
    this.options.wsHub.broadcast(event);
  }

  private setConnected(next: boolean): void {
    if (this.connected === next) return;
    this.connected = next;
    this.options.wsHub.broadcast({
      event: 'daemon.status',
      data: this.status,
    });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Synchronously read the daemon token file. Returns null if not found. */
function readTokenFileSync(dataDir: string): string | null {
  try {
    return readFileSync(join(dataDir, '.daemon-token'), 'utf-8').trim();
  } catch {
    return null;
  }
}
