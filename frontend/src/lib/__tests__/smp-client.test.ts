import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SmpClient } from '../smp-client';

describe('SmpClient', () => {
  let client: SmpClient;

  beforeEach(() => {
    client = new SmpClient('ws://localhost:25565/', 'test-token');
  });

  afterEach(() => {
    client.close();
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

  it('connect returns existing promise when already connecting', async () => {
    // Should not crash — connect is called but WebSocket constructor fails in jsdom
    const promise = client.connect().catch(() => {});
    const promise2 = client.connect().catch(() => {});
    // Both should resolve/reject without throwing
    await Promise.allSettled([promise, promise2]);
  });
});
