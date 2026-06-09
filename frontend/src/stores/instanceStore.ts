import { create } from 'zustand';
import type { Instance, LogEntry, InstanceStats, InstanceState } from '../lib/types';
import * as api from '../lib/api';

interface InstanceStore {
  // Data
  instances: Instance[];
  selectedId: string | null;
  logs: Record<string, LogEntry[]>;
  stats: Record<string, InstanceStats | null>;
  loading: boolean;
  error: string | null;
  downloadProgress: { taskId: string; percent: number; downloaded: number; total: number; phase?: string; status?: string } | null;

  // Actions
  fetchInstances: () => Promise<void>;
  setDownloadProgress: (progress: { taskId: string; percent: number; downloaded: number; total: number; phase?: string; status?: string } | null) => void;
  createInstance: (name: string, type: string, version: string, port?: number, downloadUrl?: string, javaPath?: string) => Promise<Instance>;
  importInstance: (name: string, sourceDir: string, port?: number, javaArgs?: string, javaPath?: string) => Promise<Instance>;
  deleteInstance: (id: string) => Promise<void>;
  startInstance: (id: string) => Promise<void>;
  stopInstance: (id: string) => Promise<void>;
  restartInstance: (id: string) => Promise<void>;
  updateInstanceState: (id: string, state: InstanceState) => void;
  appendLog: (instanceId: string, entry: LogEntry) => void;
  updateStats: (instanceId: string, stats: InstanceStats) => void;
  selectInstance: (id: string | null) => void;
}

export const useInstanceStore = create<InstanceStore>((set) => ({
  instances: [],
  selectedId: null,
  logs: {},
  stats: {},
  loading: false,
  error: null,
  downloadProgress: null,

  fetchInstances: async () => {
    set({ loading: true, error: null });
    try {
      const instances = await api.getInstances();
      set({ instances, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  createInstance: async (name, type, version, port, downloadUrl, javaPath) => {
    const instance = await api.createInstance({ name, type: type as any, version, port, downloadUrl, javaPath });
    set((state) => ({ instances: [...state.instances, instance] }));
    return instance;
  },

  importInstance: async (name, sourceDir, port, javaArgs, javaPath) => {
    const instance = await api.importInstance({ name, sourceDir, port, javaArgs, javaPath });
    set((state) => ({ instances: [...state.instances, instance] }));
    return instance;
  },

  deleteInstance: async (id) => {
    try {
      await api.deleteInstance(id);
      set((state) => ({
        instances: state.instances.filter((i) => i.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId,
        error: null,
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  startInstance: async (id) => {
    await api.startInstance(id);
    set((state) => ({
      instances: state.instances.map((i) => {
        if (i.id !== id) return i;
        // Don't overwrite if WebSocket already delivered the Running event
        if (i.state === 'running') return i;
        return { ...i, state: 'starting' as InstanceState };
      }),
    }));
  },

  stopInstance: async (id) => {
    await api.stopInstance(id);
    set((state) => ({
      instances: state.instances.map((i) => {
        if (i.id !== id) return i;
        // Don't overwrite if WebSocket already delivered the Stopped event
        if (i.state === 'stopped' || i.state === 'crashed') return i;
        return { ...i, state: 'stopping' as InstanceState };
      }),
    }));
  },

  restartInstance: async (id) => {
    // Set to stopping first, then the daemon will emit events for actual transitions
    set((state) => ({
      instances: state.instances.map((i) =>
        i.id === id ? { ...i, state: 'stopping' as InstanceState } : i
      ),
    }));
    await api.restartInstance(id);
  },

  updateInstanceState: (id, state) => {
    set((s) => ({
      instances: s.instances.map((i) => (i.id === id ? { ...i, state } : i)),
    }));
  },

  appendLog: (instanceId, entry) => {
    set((state) => {
      const existing = state.logs[instanceId] || [];
      // Skip if identical to the last line (dedup from any source)
      if (existing.length > 0 && existing[existing.length - 1].line === entry.line) {
        return state;
      }
      return {
        logs: {
          ...state.logs,
          [instanceId]: [...existing, entry].slice(-1000),
        },
      };
    });
  },

  updateStats: (instanceId, stats) => {
    set((state) => ({
      stats: { ...state.stats, [instanceId]: stats },
    }));
  },

  selectInstance: (id) => set({ selectedId: id }),

  setDownloadProgress: (progress) => set({ downloadProgress: progress }),
}));
