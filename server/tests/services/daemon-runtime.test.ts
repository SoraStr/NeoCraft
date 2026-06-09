import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IpcClient } from '../../src/services/ipc-client';
import { DaemonRuntime } from '../../src/services/daemon-runtime';
import type { RuntimeConfig } from '../../src/config';
import { createMockDaemon, type MockDaemon } from '../helpers/mock-daemon';

function createConfig(socketPath: string, dataDir: string): RuntimeConfig {
  return {
    dataDir,
    ipcSocketPath: socketPath,
    frontendDist: '',
    corsOrigins: [],
    autoStartDaemon: false,
    daemonStartupRetries: 1,
    daemonStartupRetryDelayMs: 10,
    daemonHealthIntervalMs: 50,
    authToken: null,
  };
}

describe('DaemonRuntime', () => {
  const tempDirs: string[] = [];
  const runtimes: DaemonRuntime[] = [];
  const daemons: MockDaemon[] = [];

  afterEach(async () => {
    await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
    for (const daemon of daemons.splice(0)) daemon.cleanup();
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('reconnects when the daemon comes back after IPC disconnects', async () => {
    const mock = await createMockDaemon();
    daemons.push(mock);
    const dataDir = mkdtempSync(join(tmpdir(), 'neocraft-runtime-'));
    tempDirs.push(dataDir);
    const ipc = new IpcClient(mock.socketPath);
    const broadcasts: unknown[] = [];
    const runtime = new DaemonRuntime({
      ipc,
      wsHub: { broadcast: vi.fn((event) => broadcasts.push(event)) } as any,
      config: createConfig(mock.socketPath, dataDir),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });
    runtimes.push(runtime);

    await runtime.start();
    expect(runtime.status.connected).toBe(true);

    await mock.restart(100);
    await vi.waitFor(() => {
      expect(runtime.status.connected).toBe(true);
      expect(ipc.isConnected).toBe(true);
    }, { timeout: 3000 });

    expect(broadcasts).toContainEqual({
      event: 'daemon.status',
      data: { connected: false, version: '0.1.0' },
    });
    expect(broadcasts).toContainEqual({
      event: 'daemon.status',
      data: { connected: true, version: '0.1.0' },
    });
    await expect(ipc.request('instance.list', {})).resolves.toMatchObject({
      result: { instances: [] },
    });
  });

  it('refreshes the daemon auth token before connecting', async () => {
    const mock = await createMockDaemon({ authToken: 'new-token' });
    daemons.push(mock);
    const dataDir = mkdtempSync(join(tmpdir(), 'neocraft-runtime-'));
    tempDirs.push(dataDir);
    writeFileSync(join(dataDir, '.daemon-token'), 'new-token');

    const ipc = new IpcClient(mock.socketPath, 'stale-token');
    const runtime = new DaemonRuntime({
      ipc,
      wsHub: { broadcast: vi.fn() } as any,
      config: createConfig(mock.socketPath, dataDir),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });
    runtimes.push(runtime);

    await runtime.start();

    expect(runtime.status.connected).toBe(true);
    await expect(ipc.request('instance.list', {})).resolves.toMatchObject({
      result: { instances: [] },
    });
  });
});
