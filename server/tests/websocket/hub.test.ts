import { describe, it, expect, beforeAll } from 'vitest';
import { WebSocketHub } from '../../src/websocket/hub';

describe('WebSocketHub', () => {
  let hub: WebSocketHub;

  beforeAll(() => {
    hub = new WebSocketHub();
  });

  it('should start with zero clients', () => {
    expect(hub.getConnectedCount()).toBe(0);
  });

  it('should add and remove mock clients', () => {
    const mockWs1 = { send: (data: string) => {}, readyState: 1, on: () => {}, close: () => {} } as any;
    const mockWs2 = { send: (data: string) => {}, readyState: 1, on: () => {}, close: () => {} } as any;

    hub.addClient(mockWs1);
    expect(hub.getConnectedCount()).toBe(1);

    hub.addClient(mockWs2);
    expect(hub.getConnectedCount()).toBe(2);

    hub.removeClient(mockWs1);
    expect(hub.getConnectedCount()).toBe(1);

    hub.removeClient(mockWs2);
    expect(hub.getConnectedCount()).toBe(0);
  });

  it('should broadcast to all connected clients', () => {
    const received: string[] = [];
    const mockWs1 = {
      send: (data: string) => { received.push('c1:' + data); },
      readyState: 1,
      on: () => {},
    } as any;
    const mockWs2 = {
      send: (data: string) => { received.push('c2:' + data); },
      readyState: 1,
      on: () => {},
    } as any;

    hub.addClient(mockWs1);
    hub.addClient(mockWs2);

    const event = { event: 'instance.log', data: { instance_id: 'i1', line: 'Hello', timestamp: 123 } };
    hub.broadcast(event);

    expect(received.length).toBe(2);
    expect(received[0]).toContain('instance.log');
    expect(received[1]).toContain('instance.log');

    hub.removeClient(mockWs1);
    hub.removeClient(mockWs2);
  });

  it('should not fail when broadcasting to empty client list', () => {
    // hub is empty now, should not throw
    expect(() => hub.broadcast({ event: 'test', data: {} })).not.toThrow();
  });

  it('should handle client with closed connection gracefully', () => {
    const received: string[] = [];
    const closedWs = {
      send: () => { throw new Error('Connection closed'); },
      readyState: 3, // CLOSED
      on: () => {},
    } as any;
    const openWs = {
      send: (data: string) => { received.push(data); },
      readyState: 1,
      on: () => {},
    } as any;

    hub.addClient(closedWs);
    hub.addClient(openWs);

    // Should not throw, and should still deliver to open client
    hub.broadcast({ event: 'test', data: {} });
    expect(received.length).toBe(1);

    hub.removeClient(closedWs);
    hub.removeClient(openWs);
  });
});
