export type ServerType = 'vanilla' | 'paper' | 'spigot' | 'fabric';

export type InstanceState = 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed';

export interface Instance {
  id: string;
  name: string;
  type: ServerType;
  version: string;
  port: number;
  state: InstanceState;
  javaArgs: string;
  createdAt: string;
}

export interface ServerVersion {
  id: string;
  type: ServerType;
}

export interface LogEntry {
  instanceId: string;
  line: string;
  timestamp: number;
}

export interface InstanceStats {
  instanceId: string;
  cpuPercent: number;
  memoryMb: number;
  uptimeSecs: number;
}

export interface CreateInstanceInput {
  name: string;
  type: ServerType;
  version: string;
  port?: number;
}

export interface IpcEvent {
  event: string;
  data: Record<string, unknown>;
}
