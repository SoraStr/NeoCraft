export type ServerType = 'vanilla' | 'paper' | 'spigot' | 'fabric';

export type InstanceState = 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed';

export interface Instance {
  id: string;
  name: string;
  type: ServerType;
  version: string;
  port: number;
  state: InstanceState;
  java_args: string;
  created_at: string;
  download_url: string;
  management_port: number;
  management_token: string;
}

export interface ServerVersion {
  id: string;
  type: ServerType;
  downloadUrl?: string;
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
  downloadUrl?: string;
}

export interface IpcEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface PlayerDto {
  id: string;
  name: string;
}

export interface UserBanDto {
  expires?: string;
  player: PlayerDto;
  reason?: string;
  source?: string;
}

export interface IpBanDto {
  expires?: string;
  ip: string;
  reason?: string;
  source?: string;
}

export interface OperatorDto {
  bypassesPlayerLimit?: boolean;
  permissionLevel: number;
  player: PlayerDto;
}

export interface ServerStatus {
  players: number;
  started: boolean;
  version: string;
}

export interface TypedRule {
  key: string;
  type: string;
  value: unknown;
}

export interface ManagementConfig {
  protocol: string;
  smpPort?: number;
  smpToken?: string;
  rconPort?: number;
  rconPassword?: string;
}
