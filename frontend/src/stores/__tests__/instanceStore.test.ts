import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the API module before importing the store
vi.mock('../../lib/api', () => ({
  getInstances: vi.fn(),
  createInstance: vi.fn(),
  deleteInstance: vi.fn(),
  startInstance: vi.fn(),
  stopInstance: vi.fn(),
  restartInstance: vi.fn(),
  importInstance: vi.fn(),
}));

import { useInstanceStore } from '../instanceStore';
import * as api from '../../lib/api';
import type { Instance } from '../../lib/types';

function mockInstance(overrides: Partial<Instance> = {}): Instance {
  return {
    id: 'test-1',
    name: 'Test Server',
    type: 'paper',
    version: '1.21.5',
    port: 25565,
    state: 'stopped',
    java_args: '-Xmx2G',
    java_path: 'java',
    created_at: '2024-01-01T00:00:00Z',
    download_url: '',
    management_port: 0,
    management_token: '',
    management_tls_enabled: false,
    ...overrides,
  };
}

describe('instanceStore', () => {
  beforeEach(() => {
    useInstanceStore.setState({
      instances: [],
      selectedId: null,
      logs: {},
      stats: {},
      loading: false,
      error: null,
      downloadProgress: null,
    });
    vi.clearAllMocks();
  });

  it('has correct initial state', () => {
    const s = useInstanceStore.getState();
    expect(s.instances).toEqual([]);
    expect(s.selectedId).toBeNull();
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it('fetchInstances sets loading and updates instances', async () => {
    const mockInstances = [mockInstance({ id: '1', name: 'Server 1' })];
    vi.mocked(api.getInstances).mockResolvedValue(mockInstances);
    await useInstanceStore.getState().fetchInstances();
    const s = useInstanceStore.getState();
    expect(s.instances).toHaveLength(1);
    expect(s.instances[0].name).toBe('Server 1');
    expect(s.loading).toBe(false);
  });

  it('fetchInstances sets error on failure', async () => {
    vi.mocked(api.getInstances).mockRejectedValue(new Error('Network error'));
    await useInstanceStore.getState().fetchInstances();
    const s = useInstanceStore.getState();
    expect(s.error).toBe('Network error');
    expect(s.loading).toBe(false);
  });

  it('updateInstanceState changes matching instance state', () => {
    useInstanceStore.setState({
      instances: [mockInstance({ id: '1', state: 'stopped' })],
    });
    useInstanceStore.getState().updateInstanceState('1', 'running');
    expect(useInstanceStore.getState().instances[0].state).toBe('running');
  });

  it('updateInstanceState does not change non-matching instance', () => {
    useInstanceStore.setState({
      instances: [mockInstance({ id: '1', state: 'stopped' })],
    });
    useInstanceStore.getState().updateInstanceState('2', 'running');
    expect(useInstanceStore.getState().instances[0].state).toBe('stopped');
  });

  it('appendLog adds a log entry', () => {
    useInstanceStore.getState().appendLog('1', {
      instanceId: '1',
      line: 'hello',
      timestamp: 1000,
    });
    expect(useInstanceStore.getState().logs['1']).toHaveLength(1);
  });

  it('appendLog deduplicates consecutive identical lines', () => {
    const entry = { instanceId: '1', line: 'hello', timestamp: 1000 };
    useInstanceStore.getState().appendLog('1', entry);
    useInstanceStore.getState().appendLog('1', entry);
    expect(useInstanceStore.getState().logs['1']).toHaveLength(1);
  });

  it('appendLog caps at 1000 entries', () => {
    for (let i = 0; i < 1100; i++) {
      useInstanceStore.getState().appendLog('1', {
        instanceId: '1',
        line: `line ${i}`,
        timestamp: i,
      });
    }
    expect(useInstanceStore.getState().logs['1'].length).toBeLessThanOrEqual(1000);
  });

  it('selectInstance sets selectedId', () => {
    useInstanceStore.getState().selectInstance('test-id');
    expect(useInstanceStore.getState().selectedId).toBe('test-id');
  });

  it('selectInstance clears selectedId when toggled', () => {
    useInstanceStore.getState().selectInstance('test-id');
    useInstanceStore.getState().selectInstance(null);
    expect(useInstanceStore.getState().selectedId).toBeNull();
  });

  it('deleteInstance removes instance and clears selectedId if selected', async () => {
    useInstanceStore.setState({
      instances: [mockInstance({ id: '1' })],
      selectedId: '1',
    });
    vi.mocked(api.deleteInstance).mockResolvedValue(undefined);
    await useInstanceStore.getState().deleteInstance('1');
    const s = useInstanceStore.getState();
    expect(s.instances).toHaveLength(0);
    expect(s.selectedId).toBeNull();
  });

  it('updateStats sets stats for an instance', () => {
    useInstanceStore.getState().updateStats('1', {
      instanceId: '1',
      cpuPercent: 50,
      memoryMb: 1024,
      uptimeSecs: 3600,
    });
    const stats = useInstanceStore.getState().stats['1'];
    expect(stats?.cpuPercent).toBe(50);
    expect(stats?.memoryMb).toBe(1024);
    expect(stats?.uptimeSecs).toBe(3600);
  });

  it('setDownloadProgress updates download progress', () => {
    const progress = { taskId: 'download:1', percent: 50, downloaded: 1024, total: 2048 };
    useInstanceStore.getState().setDownloadProgress(progress);
    expect(useInstanceStore.getState().downloadProgress).toEqual(progress);
  });
});
