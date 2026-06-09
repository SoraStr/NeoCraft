import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { IpcClient } from '../../src/services/ipc-client';
import { createMockDaemon } from '../helpers/mock-daemon';

describe('IpcClient', () => {
  let mock: Awaited<ReturnType<typeof createMockDaemon>>;
  let client: IpcClient;

  beforeAll(async () => {
    mock = await createMockDaemon();
    client = new IpcClient(mock.socketPath);
    await client.connect();
  });

  afterAll(async () => {
    await client.disconnect();
    mock.cleanup();
  });

  it('should send request and receive response', async () => {
    const resp = await client.request('instance.list', {});
    expect(resp.result).toBeDefined();
    expect(resp.result).toEqual({ instances: [] });
  });

  it('should receive events via subscription', async () => {
    const events: any[] = [];
    const unsub = client.onEvent((ev) => events.push(ev));

    await client.request('monitor.subscribe', { instanceId: 'test' });
    await new Promise(r => setTimeout(r, 300));

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toHaveProperty('event', 'instance.stats');
    unsub();
  });

  it('should timeout on no response', async () => {
    await expect(
      client.request('slow.method', {}, { timeout: 100 })
    ).rejects.toThrow('timed out');
  });

  it('should handle connection errors gracefully', async () => {
    const badClient = new IpcClient('/nonexistent/path.sock');
    await expect(badClient.connect()).rejects.toThrow();
  });

  it('should reject requests instead of crashing when the daemon disconnects', async () => {
    const isolatedMock = await createMockDaemon();
    const isolatedClient = new IpcClient(isolatedMock.socketPath);

    try {
      await isolatedClient.connect();
      await isolatedMock.restart(100);

      await expect(
        isolatedClient.request('instance.list', {}, { timeout: 500 })
      ).rejects.toThrow();
    } finally {
      await isolatedClient.disconnect();
      isolatedMock.cleanup();
    }
  });
});
