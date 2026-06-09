import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SmpClient } from '../smp-client';

describe('SmpClient', () => {
  let client: SmpClient;

  beforeEach(() => {
    client = new SmpClient('ws://localhost:25565/', 'test-token');
  });

  afterEach(() => {
    client.close();
    vi.unstubAllGlobals();
  });

  it('creates a client successfully', () => {
    expect(client).toBeDefined();
  });

  it('connected returns false when not connected', () => {
    expect(client.connected).toBe(false);
  });

  it('call rejects with "Not connected" when not connected', async () => {
    await expect(client.call('test')).rejects.toThrow('Not connected');
  });

  it('call with params rejects when not connected', async () => {
    await expect(client.call('test', ['arg1'])).rejects.toThrow('Not connected');
  });

  it('formats server/save with positional flush boolean', () => {
    const sentPayloads: string[] = [];
    class MockWebSocket {
      static OPEN = 1;
      readyState = MockWebSocket.OPEN;
      onopen: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      send(payload: string) {
        sentPayloads.push(payload);
        const request = JSON.parse(payload);
        setTimeout(() => {
          this.onmessage?.({
            data: JSON.stringify({ jsonrpc: '2.0', id: request.id, result: true }),
          } as MessageEvent);
        }, 0);
      }
      close = vi.fn();

      constructor() {
        setTimeout(() => this.onopen?.(), 0);
      }
    }

    vi.stubGlobal('WebSocket', MockWebSocket);
    client = new SmpClient('ws://localhost:25565/', 'test-token');

    return client.connect().then(() => {
      return client.call('server/save', [true]).then(() => {
        const request = JSON.parse(sentPayloads[0]);

        expect(request).toMatchObject({
          jsonrpc: '2.0',
          method: 'minecraft:server/save',
          params: [true],
        });
      });
    });
  });

  it('sends raw rpc.discover calls without minecraft prefix', () => {
    const sentPayloads: string[] = [];
    class MockWebSocket {
      static OPEN = 1;
      readyState = MockWebSocket.OPEN;
      onopen: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      send(payload: string) {
        sentPayloads.push(payload);
        const request = JSON.parse(payload);
        setTimeout(() => {
          this.onmessage?.({
            data: JSON.stringify({ jsonrpc: '2.0', id: request.id, result: {} }),
          } as MessageEvent);
        }, 0);
      }
      close = vi.fn();

      constructor() {
        setTimeout(() => this.onopen?.(), 0);
      }
    }

    vi.stubGlobal('WebSocket', MockWebSocket);
    client = new SmpClient('ws://localhost:25565/', 'test-token');

    return client.connect().then(() => {
      return client.callRaw('rpc.discover').then(() => {
        expect(JSON.parse(sentPayloads[0]).method).toBe('rpc.discover');
      });
    });
  });

  it('close cleans up (connected becomes false)', () => {
    client.close();
    expect(client.connected).toBe(false);
  });

  it('close is idempotent', () => {
    client.close();
    client.close();
    expect(client.connected).toBe(false);
  });

  it('onNotification returns unsubscribe function', () => {
    const unsub = client.onNotification('test', () => {});
    expect(typeof unsub).toBe('function');
  });

  it('unsubscribe function can be called without error', () => {
    const unsub = client.onNotification('test', () => {});
    expect(() => unsub()).not.toThrow();
  });

  it('onNotification handles multiple handlers for same method', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    client.onNotification('test', handler1);
    client.onNotification('test', handler2);
    // Both should be registered without error
  });

  it('onRawNotification handles custom namespace notifications', () => {
    const handler = vi.fn();
    client.onRawNotification('myplugin:notification/chat/message', handler);
    const typedClient = client as any;
    const registered = typedClient.notificationHandlers.get('myplugin:notification/chat/message');

    expect(registered?.has(handler)).toBe(true);
  });

  it('connect returns existing promise when already connecting', async () => {
    // Should not crash — connect is called but WebSocket constructor fails in jsdom
    const promise = client.connect().catch(() => {});
    const promise2 = client.connect().catch(() => {});
    // Both should resolve/reject without throwing
    await Promise.allSettled([promise, promise2]);
  });
});
