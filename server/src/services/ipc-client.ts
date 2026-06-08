import { createConnection, Socket } from 'node:net';
import { createInterface, Interface } from 'node:readline';
import { randomUUID } from 'node:crypto';

interface IpcRequest {
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export interface IpcResponse {
  id: string;
  result?: unknown;
  error?: { code: string; message: string };
}

export interface IpcEvent {
  event: string;
  data: unknown;
}

type EventCallback = (event: IpcEvent) => void;

export class IpcClient {
  private socket: Socket | null = null;
  private rl: Interface | null = null;
  private pending = new Map<string, {
    resolve: (value: IpcResponse) => void;
    reject: (reason: Error) => void;
    timer: NodeJS.Timeout;
  }>();
  private eventListeners = new Set<EventCallback>();
  private reconnectDelay = 100;
  private maxReconnectDelay = 30000;
  private shouldReconnect = true;
  private connecting = false;
  private reconnectTimerActive = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private authToken: string | null = null;

  constructor(
    private socketPath: string,
    authToken?: string | null,
  ) {
    this.authToken = authToken ?? null;
  }

  /** Update the auth token (e.g. after daemon auto-start generates one). */
  setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  async connect(): Promise<void> {
    // Clean up any previous connection first to prevent duplicate event processing
    this.cleanup();
    this.connecting = true;
    this.shouldReconnect = true;

    return new Promise((resolve, reject) => {
      this.socket = createConnection(this.socketPath, async () => {
        this.rl = createInterface({ input: this.socket!, crlfDelay: Infinity });

        // ── IPC Authentication handshake ──
        // The daemon expects the auth token as the first line if auth is enabled.
        if (this.authToken) {
          try {
            await this.authenticate();
          } catch (authErr) {
            this.connecting = false;
            this.cleanup();
            reject(authErr);
            return;
          }
        }

        this.rl.on('line', (line: string) => this.handleLine(line));
        this.connecting = false;
        this.reconnectDelay = 100; // reset backoff on successful connection
        resolve();
      });

      this.socket.on('error', (err) => {
        this.connecting = false;
        this.cleanup();
        reject(err);
      });

      this.socket.on('close', () => {
        this.connecting = false;
        if (this.shouldReconnect && !this.reconnectTimerActive) {
          this.reconnect();
        }
      });
    });
  }

  /** Send the auth token and wait for the daemon's acknowledgement. */
  private authenticate(): Promise<void> {
    return new Promise((resolve, reject) => {
      const authTimeout = setTimeout(() => {
        cleanup();
        reject(new Error('IPC authentication timed out'));
      }, 5000);

      const cleanup = () => {
        clearTimeout(authTimeout);
        this.rl?.removeListener('line', onLine);
        if (this.socket) {
          this.socket.removeListener('error', onError);
        }
      };

      const onLine = (line: string) => {
        try {
          const msg = JSON.parse(line);
          if (msg.auth === 'ok') {
            cleanup();
            resolve();
          } else if (msg.auth === 'error') {
            cleanup();
            reject(new Error(`IPC authentication failed: ${msg.message || 'unknown'}`));
          }
          // Ignore other lines (unlikely during handshake)
        } catch {
          // Not JSON — might be a raw response, ignore
        }
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      this.rl!.on('line', onLine);
      this.socket!.on('error', onError);

      // Send the auth token as the first line
      this.socket!.write(this.authToken + '\n', (err) => {
        if (err) {
          cleanup();
          reject(err);
        }
      });
    });
  }

  private cleanup(): void {
    if (this.rl) {
      this.rl.removeAllListeners();
      this.rl.close();
      this.rl = null;
    }
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
  }

  async disconnect(): Promise<void> {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.reconnectTimerActive = false;
    }
    this.cleanup();
    // Reject all pending requests
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Disconnected'));
    }
    this.pending.clear();
  }

  async request(
    method: string,
    params: Record<string, unknown>,
    opts?: { timeout?: number }
  ): Promise<IpcResponse> {
    if (!this.socket) throw new Error('Not connected');

    const id = randomUUID();
    const timeout = opts?.timeout ?? 30000;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request ${method} timed out after ${timeout}ms`));
      }, timeout);

      const request: IpcRequest = { id, method, params };
      this.pending.set(id, { resolve, reject, timer });

      this.socket!.write(JSON.stringify(request) + '\n', (err) => {
        if (!err) return;
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      });
    });
  }

  onEvent(callback: EventCallback): () => void {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  private handleLine(line: string): void {
    try {
      const msg = JSON.parse(line);

      if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
        // It's a response
        const pending = this.pending.get(msg.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(msg.id);
          pending.resolve(msg as IpcResponse);
        }
      } else if (msg.event !== undefined) {
        // It's an event
        const event = msg as IpcEvent;
        for (const listener of this.eventListeners) {
          listener(event);
        }
      }
    } catch {
      // Ignore malformed lines
    }
  }

  private reconnect(): void {
    if (!this.shouldReconnect || this.connecting) return;
    this.cleanup();
    this.reconnectTimerActive = true;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimerActive = false;
      this.reconnectTimer = null;
      this.connect().catch(() => {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      });
    }, this.reconnectDelay);
  }
}
