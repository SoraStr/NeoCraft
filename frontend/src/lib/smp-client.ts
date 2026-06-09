// JSON-RPC 2.0 message types
// JSON-RPC 2.0 allows params to be either an Array (positional) or an Object (named).
type JsonRpcParams = unknown[] | Record<string, unknown>;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: JsonRpcParams;
  id: number;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
  id: number;
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

type NotificationHandler = (params: unknown) => void;

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;
const REQUEST_TIMEOUT_MS = 10000;
const CALL_PREFIX = 'minecraft:';
const NOTIFICATION_PREFIX = 'minecraft:notification/';

export class SmpClient {
  private url: string;
  private token: string;
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingCall>();
  private notificationHandlers = new Map<string, Set<NotificationHandler>>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private connectPromise: Promise<void> | null = null;
  private connectResolve: (() => void) | null = null;
  private connectReject: ((reason: Error) => void) | null = null;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    // If a connect attempt is already in progress, return that promise
    if (this.connectPromise) return this.connectPromise;

    this.intentionalClose = false;
    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
    });

    const ws = new WebSocket(this.url, ['minecraft-v1', this.token]);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.connectResolve?.();
      this.connectPromise = null;
      this.connectResolve = null;
      this.connectReject = null;
    };

    ws.onclose = () => {
      // Reject all in-flight calls — the connection is gone
      for (const [, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Connection closed'));
      }
      this.pending.clear();

      // Resolve/reject the connect promise if still pending
      this.connectPromise = null;
      this.connectResolve = null;
      this.connectReject = null;

      // Schedule reconnect unless intentionally closed or out of attempts
      if (!this.intentionalClose && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        this.reconnectAttempts++;
        this.reconnectTimer = setTimeout(() => {
          this.connect().catch(() => {
            // Reconnect failures are swallowed; the next onclose will retry
          });
        }, RECONNECT_DELAY_MS);
      }
    };

    ws.onerror = () => {
      this.connectReject?.(new Error('WebSocket connection failed'));
    };

    ws.onmessage = (event: MessageEvent) => {
      let data: JsonRpcResponse | JsonRpcNotification;
      try {
        data = JSON.parse(event.data as string);
      } catch {
        return;
      }

      // Notification: no "id" field
      if (!('id' in data)) {
        const method = (data as JsonRpcNotification).method;
        if (method) {
          const handlers = this.notificationHandlers.get(method);
          if (handlers) {
            for (const handler of handlers) {
              try {
                handler((data as JsonRpcNotification).params);
              } catch (err) {
                console.error('SMP notification handler error:', err);
              }
            }
          }
        }
        return;
      }

      // Response: has "id" field — match to a pending call
      const response = data as JsonRpcResponse;
      const pending = this.pending.get(response.id);
      if (!pending) return;

      clearTimeout(pending.timer);
      this.pending.delete(response.id);

      if (response.error) {
        pending.reject(
          new Error(response.error.message || `JSON-RPC error ${response.error.code}`),
        );
      } else {
        pending.resolve(response.result);
      }
    };

    return this.connectPromise;
  }

  call(method: string, params?: JsonRpcParams): Promise<unknown> {
    return this.callMethod(`${CALL_PREFIX}${method}`, params);
  }

  callRaw(method: string, params?: JsonRpcParams): Promise<unknown> {
    return this.callMethod(method, params);
  }

  private callMethod(method: string, params?: JsonRpcParams): Promise<unknown> {
    if (!this.connected) {
      return Promise.reject(new Error('Not connected'));
    }

    const id = this.nextId++;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    };

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timed out: ${method}`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });

      try {
        this.ws!.send(JSON.stringify(request));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /**
   * Register a handler for server-pushed notifications.
   * Returns an unsubscribe function; call it to remove the handler.
   */
  onNotification(method: string, handler: NotificationHandler): () => void {
    return this.onRawNotification(`${NOTIFICATION_PREFIX}${method}`, handler);
  }

  onRawNotification(method: string, handler: NotificationHandler): () => void {
    let handlers = this.notificationHandlers.get(method);
    if (!handlers) {
      handlers = new Set();
      this.notificationHandlers.set(method, handlers);
    }
    handlers.add(handler);

    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.notificationHandlers.delete(method);
      }
    };
  }

  close(): void {
    this.intentionalClose = true;

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.connectPromise = null;
    this.connectResolve = null;
    this.connectReject = null;

    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Connection closed'));
    }
    this.pending.clear();

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }
}
