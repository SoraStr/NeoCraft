export type ServerType = 'vanilla' | 'paper' | 'spigot' | 'fabric' | 'forge' | 'custom';

export type InstanceState = 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed';

export interface Instance {
  id: string;
  name: string;
  type: ServerType;
  version: string;
  port: number;
  state: InstanceState;
  java_args: string;
  java_path: string;
  created_at: string;
  download_url: string;
  management_port: number;
  management_token: string;
  management_tls_enabled: boolean;
}

export interface ServerVersion {
  id: string;
  type: ServerType;
  downloadUrl?: string;
}

export interface FabricVersionMeta {
  version: string;
  stable: boolean;
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
  javaPath?: string;
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
  players: PlayerDto[];
  started: boolean;
  version: { name: string; protocol: number };
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

export type PluginMarketProvider = 'spiget' | 'modrinth' | 'hangar';

export interface PluginMarketResult {
  provider: PluginMarketProvider;
  id: string;
  name: string;
  description: string;
  iconUrl?: string;
  author?: string;
  downloads?: number;
  likes?: number;
  rating?: number;
  updatedAt?: string;
  latestVersion?: string;
  supportedVersions: string[];
  supportedPlatforms: string[];
  pageUrl: string;
  external?: boolean;
}

export interface PluginMarketDetails extends PluginMarketResult {
  body?: string;
  links: Array<{ label: string; url: string }>;
  license?: string;
  categories: string[];
}

export interface PluginMarketVersion {
  provider: PluginMarketProvider;
  id: string;
  name: string;
  downloads?: number;
  releasedAt?: string;
  supportedVersions: string[];
  supportedPlatforms: string[];
  fileName?: string;
  fileSize?: number;
  downloadUrl?: string;
  channel?: string;
  installable: boolean;
  external: boolean;
}

export interface PluginInstallResult {
  fileName: string;
  path: string;
  size: number;
  provider: PluginMarketProvider;
  projectId: string;
  versionId: string;
  mods: Array<{
    fileName: string;
    name: string;
    modid: string;
    version: string;
    loader: string;
    size: number;
    disabled: boolean;
    description?: string;
    authors?: string[];
  }>;
}
