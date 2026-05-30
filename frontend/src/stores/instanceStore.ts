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

  // Actions
  fetchInstances: () => Promise<void>;
  createInstance: (name: string, type: string, version: string, port?: number, downloadUrl?: string) => Promise<Instance>;
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

  fetchInstances: async () => {
    set({ loading: true, error: null });
    try {
      const instances = await api.getInstances();
      set({ instances, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  createInstance: async (name, type, version, port, downloadUrl) => {
    const instance = await api.createInstance({ name, type: type as any, version, port, downloadUrl });
    set((state) => ({ instances: [...state.instances, instance] }));
    return instance;
  },

  deleteInstance: async (id) => {
    await api.deleteInstance(id);
    set((state) => ({
      instances: state.instances.filter((i) => i.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    }));
  },

  startInstance: async (id) => {
    await api.startInstance(id);
    set((state) => ({
      instances: state.instances.map((i) =>
        i.id === id ? { ...i, state: 'starting' as InstanceState } : i
      ),
    }));
  },

  stopInstance: async (id) => {
    await api.stopInstance(id);
    set((state) => ({
      instances: state.instances.map((i) =>
        i.id === id ? { ...i, state: 'stopping' as InstanceState } : i
      ),
    }));
  },

  restartInstance: async (id) => {
    await api.restartInstance(id);
  },

  updateInstanceState: (id, state) => {
    set((s) => ({
      instances: s.instances.map((i) => (i.id === id ? { ...i, state } : i)),
    }));
  },

  appendLog: (instanceId, entry) => {
    set((state) => ({
      logs: {
        ...state.logs,
        [instanceId]: [...(state.logs[instanceId] || []), entry].slice(-1000), // keep last 1000 lines
      },
    }));
  },

  updateStats: (instanceId, stats) => {
    set((state) => ({
      stats: { ...state.stats, [instanceId]: stats },
    }));
  },

  selectInstance: (id) => set({ selectedId: id }),
}));
