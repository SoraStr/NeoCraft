import { createConnection, Socket } from 'node:net';
import { createInterface, Interface } from 'node:readline';
import { randomUUID } from 'node:crypto';

interface IpcRequest {
  id: string;
  method: string;
  params: Record<string, unknown>;
}

interface IpcResponse {
  id: string;
  result?: unknown;
  error?: { code: string; message: string };
}

interface IpcEvent {
  event: string;
  data: Record<string, unknown>;
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

  constructor(private socketPath: string) {}

  async connect(): Promise<void> {
    // Clean up any previous connection first to prevent duplicate event processing
    this.cleanup();
    this.connecting = true;
    this.shouldReconnect = true;

    return new Promise((resolve, reject) => {
      this.socket = createConnection(this.socketPath, () => {
        this.rl = createInterface({ input: this.socket!, crlfDelay: Infinity });
        this.rl.on('line', (line: string) => this.handleLine(line));
        this.connecting = false;
        this.reconnectDelay = 100; // reset backoff on successful connection
        resolve();
      });

      this.socket.on('error', (err) => {
        this.connecting = false;
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

      this.pending.set(id, { resolve, reject, timer });

      const request: IpcRequest = { id, method, params };
      this.socket!.write(JSON.stringify(request) + '\n');
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
    setTimeout(() => {
      this.reconnectTimerActive = false;
      this.connect().catch(() => {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      });
    }, this.reconnectDelay);
  }
}
