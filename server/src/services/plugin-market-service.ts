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

export interface PluginInstallSelection {
  provider: PluginMarketProvider;
  projectId: string;
  versionId: string;
}

export interface PluginInstallResult {
  fileName: string;
  path: string;
  size: number;
  provider: PluginMarketProvider;
  projectId: string;
  versionId: string;
  mods: unknown[];
}

interface FetchLike {
  (input: string | URL, init?: RequestInit): Promise<Response>;
}

interface IpcLike {
  request(
    method: string,
    params: Record<string, unknown>,
    options?: { timeout?: number },
  ): Promise<{ result?: unknown; error?: { code: string; message: string } }>;
}

interface ServiceOptions {
  fetchFn?: FetchLike;
}

type JsonObject = Record<string, unknown>;

const SPIGET_API = 'https://api.spiget.org/v2';
const MODRINTH_API = 'https://api.modrinth.com/v2';
const HANGAR_API = 'https://hangar.papermc.io/api/v1';
const HANGAR_SITE = 'https://hangar.papermc.io';
const SPIGOT_SITE = 'https://www.spigotmc.org/resources';
const MODRINTH_SITE = 'https://modrinth.com/plugin';

const USER_AGENT = 'NeoCraft/0.1 (Plugin Market)';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_PLUGIN_DOWNLOAD_BYTES = 100 * 1024 * 1024;
const INSTALLABLE_HOSTS = new Map<PluginMarketProvider, Set<string>>([
  ['modrinth', new Set(['cdn.modrinth.com'])],
  ['hangar', new Set(['hangarcdn.papermc.io'])],
  ['spiget', new Set(['api.spiget.org', 'cdn.spiget.org'])],
]);

export class PluginMarketService {
  private readonly fetchFn: FetchLike;

  constructor(options: ServiceOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async search(provider: PluginMarketProvider, query: string, limit = DEFAULT_LIMIT): Promise<PluginMarketResult[]> {
    const searchQuery = query.trim();
    if (!searchQuery) return [];
    const size = clampLimit(limit);

    switch (provider) {
      case 'spiget':
        return this.searchSpiget(searchQuery, size);
      case 'modrinth':
        return this.searchModrinth(searchQuery, size);
      case 'hangar':
        return this.searchHangar(searchQuery, size);
    }
  }

  async getDetails(provider: PluginMarketProvider, projectId: string): Promise<PluginMarketDetails> {
    const id = projectId.trim();
    if (!id) throw new Error('Missing project ID.');

    switch (provider) {
      case 'spiget':
        return this.getSpigetDetails(id);
      case 'modrinth':
        return this.getModrinthDetails(id);
      case 'hangar':
        return this.getHangarDetails(id);
    }
  }

  async getVersions(provider: PluginMarketProvider, projectId: string, limit = DEFAULT_LIMIT): Promise<PluginMarketVersion[]> {
    const id = projectId.trim();
    if (!id) throw new Error('Missing project ID.');
    const size = clampLimit(limit);

    switch (provider) {
      case 'spiget':
        return this.getSpigetVersions(id, size);
      case 'modrinth':
        return this.getModrinthVersions(id, size);
      case 'hangar':
        return this.getHangarVersions(id, size);
    }
  }

  async installPlugin(
    ipc: IpcLike,
    instanceId: string,
    selection: PluginInstallSelection,
  ): Promise<PluginInstallResult> {
    const provider = selection.provider;
    const projectId = selection.projectId.trim();
    const versionId = selection.versionId.trim();
    if (!projectId || !versionId) throw new Error('Missing plugin project or version ID.');

    const versions = await this.getVersions(provider, projectId, MAX_LIMIT);
    const version = versions.find((entry) => entry.id === versionId);
    if (!version) throw new Error('Plugin version not found.');

    const downloadUrl = version.downloadUrl;
    if (!downloadUrl || !isInstallableUrl(provider, downloadUrl)) {
      throw new Error('This plugin version is not installable from a trusted direct download URL.');
    }

    const fileName = sanitizeJarFileName(version.fileName || `${safeName(version.name || versionId)}.jar`);
    const bytes = await this.downloadPluginBytes(provider, downloadUrl);
    const path = await uniquePluginPath(ipc, instanceId, fileName);
    const finalFileName = path.slice('plugins/'.length);
    await ipcCall(ipc, 'files.write', {
      instance_id: instanceId,
      path,
      data: Buffer.from(bytes).toString('base64'),
    }, 120000);

    return {
      fileName: finalFileName,
      path,
      size: bytes.length,
      provider,
      projectId,
      versionId,
      mods: [],
    };
  }

  private async searchSpiget(query: string, limit: number): Promise<PluginMarketResult[]> {
    const params = new URLSearchParams({
      field: 'name',
      size: String(limit),
      fields: 'id,name,tag,downloads,likes,rating,testedVersions,version,external,file,icon.url,updateDate',
    });
    const data = await this.getJson<unknown>(`${SPIGET_API}/search/resources/${encodeURIComponent(query)}?${params}`);
    return arrayOfObjects(data).map(mapSpigetResult);
  }

  private async getSpigetDetails(id: string): Promise<PluginMarketDetails> {
    const params = new URLSearchParams({
      fields: 'id,name,tag,downloads,likes,rating,testedVersions,version,external,file,icon.url,description,documentation,sourceCodeLink,donationLink,links,updateDate,premium',
    });
    const data = await this.getJson<unknown>(`${SPIGET_API}/resources/${encodeURIComponent(id)}?${params}`);
    return mapSpigetDetails(asObject(data));
  }

  private async getSpigetVersions(id: string, limit: number): Promise<PluginMarketVersion[]> {
    const params = new URLSearchParams({
      size: String(limit),
      sort: '-releaseDate',
      fields: 'id,name,downloads,releaseDate,url',
    });
    const data = await this.getJson<unknown>(`${SPIGET_API}/resources/${encodeURIComponent(id)}/versions?${params}`);
    return arrayOfObjects(data).map((version) => mapSpigetVersion(version, id));
  }

  private async searchModrinth(query: string, limit: number): Promise<PluginMarketResult[]> {
    const params = new URLSearchParams({
      query,
      facets: JSON.stringify([['project_type:plugin']]),
      limit: String(limit),
    });
    const data = await this.getJson<unknown>(`${MODRINTH_API}/search?${params}`);
    const hits = arrayOfObjects(getProp(asObject(data), 'hits'));
    return hits.map(mapModrinthResult);
  }

  private async getModrinthDetails(id: string): Promise<PluginMarketDetails> {
    const data = await this.getJson<unknown>(`${MODRINTH_API}/project/${encodeURIComponent(id)}`);
    return mapModrinthDetails(asObject(data));
  }

  private async getModrinthVersions(id: string, limit: number): Promise<PluginMarketVersion[]> {
    const params = new URLSearchParams({
      loaders: JSON.stringify(['bukkit', 'paper', 'spigot']),
      include_changelog: 'false',
    });
    const data = await this.getJson<unknown>(`${MODRINTH_API}/project/${encodeURIComponent(id)}/version?${params}`);
    return arrayOfObjects(data).slice(0, limit).map(mapModrinthVersion);
  }

  private async searchHangar(query: string, limit: number): Promise<PluginMarketResult[]> {
    const params = new URLSearchParams({
      query,
      limit: String(limit),
    });
    const data = await this.getJson<unknown>(`${HANGAR_API}/projects?${params}`);
    const result = arrayOfObjects(getProp(asObject(data), 'result'));
    return result.map(mapHangarResult);
  }

  private async getHangarDetails(id: string): Promise<PluginMarketDetails> {
    const data = await this.getJson<unknown>(`${HANGAR_API}/projects/${encodeHangarProjectId(id)}`);
    return mapHangarDetails(asObject(data));
  }

  private async getHangarVersions(id: string, limit: number): Promise<PluginMarketVersion[]> {
    const params = new URLSearchParams({
      limit: String(limit),
    });
    const data = await this.getJson<unknown>(`${HANGAR_API}/projects/${encodeHangarProjectId(id)}/versions?${params}`);
    const result = arrayOfObjects(getProp(asObject(data), 'result'));
    return result.map(mapHangarVersion);
  }

  private async getJson<T>(url: string): Promise<T> {
    const res = await this.fetchFn(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
    });

    if (!res.ok) {
      throw new Error(`Plugin market request failed: HTTP ${res.status}`);
    }

    return await res.json() as T;
  }

  private async downloadPluginBytes(provider: PluginMarketProvider, url: string): Promise<Buffer> {
    const res = await this.fetchFn(url, {
      headers: {
        Accept: 'application/java-archive, application/octet-stream, */*',
        'User-Agent': USER_AGENT,
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      throw new Error(`Plugin download failed: HTTP ${res.status}`);
    }

    const finalUrl = res.url || url;
    if (!isInstallableUrl(provider, finalUrl)) {
      throw new Error('Plugin download redirected to an untrusted host.');
    }

    const length = Number.parseInt(res.headers.get('content-length') || '', 10);
    if (Number.isFinite(length) && length > MAX_PLUGIN_DOWNLOAD_BYTES) {
      throw new Error('Plugin file is too large (max 100 MB).');
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_PLUGIN_DOWNLOAD_BYTES) {
      throw new Error('Plugin file is too large (max 100 MB).');
    }
    if (buffer.length === 0) {
      throw new Error('Plugin download was empty.');
    }

    return buffer;
  }
}

export function parsePluginMarketProvider(value: unknown): PluginMarketProvider {
  if (value === 'spiget' || value === 'modrinth' || value === 'hangar') return value;
  throw new Error('Invalid plugin market provider.');
}

function mapSpigetResult(item: JsonObject): PluginMarketResult {
  const id = stringOrNumber(getProp(item, 'id'));
  const iconPath = stringValue(getProp(asObject(getProp(item, 'icon')), 'url'));
  const version = asObject(getProp(item, 'version'));

  return {
    provider: 'spiget',
    id,
    name: stringValue(getProp(item, 'name')) || `Spigot resource ${id}`,
    description: stringValue(getProp(item, 'tag')),
    iconUrl: absoluteUrl(iconPath, SPIGET_API),
    downloads: numberValue(getProp(item, 'downloads')),
    likes: numberValue(getProp(item, 'likes')),
    rating: numberValue(getProp(asObject(getProp(item, 'rating')), 'average')),
    updatedAt: timestampSecondsToIso(getProp(item, 'updateDate')),
    latestVersion: stringOrNumber(getProp(version, 'id')),
    supportedVersions: stringArray(getProp(item, 'testedVersions')),
    supportedPlatforms: ['Spigot', 'Paper'],
    pageUrl: `${SPIGOT_SITE}/${id}/`,
    external: booleanValue(getProp(item, 'external')),
  };
}

function mapSpigetDetails(item: JsonObject): PluginMarketDetails {
  const base = mapSpigetResult(item);
  const links = linksFromRecord(asObject(getProp(item, 'links')));
  const sourceCodeLink = stringValue(getProp(item, 'sourceCodeLink'));
  const donationLink = stringValue(getProp(item, 'donationLink'));

  if (sourceCodeLink) links.push({ label: 'Source', url: sourceCodeLink });
  if (donationLink) links.push({ label: 'Donate', url: donationLink });

  return {
    ...base,
    body: decodeBase64Text(stringValue(getProp(item, 'description'))),
    links,
    categories: [],
  };
}

function mapSpigetVersion(item: JsonObject, resourceId: string): PluginMarketVersion {
  const id = stringOrNumber(getProp(item, 'id'));
  const downloadUrl = `${SPIGET_API}/resources/${resourceId}/versions/${id}/download`;
  return {
    provider: 'spiget',
    id,
    name: stringValue(getProp(item, 'name')) || id,
    downloads: numberValue(getProp(item, 'downloads')),
    releasedAt: timestampSecondsToIso(getProp(item, 'releaseDate')),
    supportedVersions: [],
    supportedPlatforms: ['Spigot', 'Paper'],
    downloadUrl,
    installable: isInstallableUrl('spiget', downloadUrl),
    external: false,
  };
}

function mapModrinthResult(item: JsonObject): PluginMarketResult {
  const id = stringValue(getProp(item, 'project_id')) || stringValue(getProp(item, 'slug'));
  const slug = stringValue(getProp(item, 'slug')) || id;

  return {
    provider: 'modrinth',
    id,
    name: stringValue(getProp(item, 'title')) || slug,
    description: stringValue(getProp(item, 'description')),
    iconUrl: stringValue(getProp(item, 'icon_url')) || undefined,
    author: stringValue(getProp(item, 'author')) || undefined,
    downloads: numberValue(getProp(item, 'downloads')),
    likes: numberValue(getProp(item, 'follows')),
    updatedAt: stringValue(getProp(item, 'date_modified')) || undefined,
    latestVersion: stringValue(getProp(item, 'latest_version')) || undefined,
    supportedVersions: stringArray(getProp(item, 'versions')),
    supportedPlatforms: stringArray(getProp(item, 'categories')).filter(isPluginPlatform),
    pageUrl: `${MODRINTH_SITE}/${slug}`,
  };
}

function mapModrinthDetails(item: JsonObject): PluginMarketDetails {
  const slug = stringValue(getProp(item, 'slug'));
  const id = stringValue(getProp(item, 'id')) || slug;
  const links = [
    link('Source', stringValue(getProp(item, 'source_url'))),
    link('Issues', stringValue(getProp(item, 'issues_url'))),
    link('Wiki', stringValue(getProp(item, 'wiki_url'))),
    link('Discord', stringValue(getProp(item, 'discord_url'))),
    ...modrinthDonationLinks(getProp(item, 'donation_urls')),
  ].filter((entry): entry is { label: string; url: string } => Boolean(entry));

  const license = asObject(getProp(item, 'license'));

  return {
    provider: 'modrinth',
    id,
    name: stringValue(getProp(item, 'title')) || slug,
    description: stringValue(getProp(item, 'description')),
    iconUrl: stringValue(getProp(item, 'icon_url')) || undefined,
    author: stringValue(getProp(item, 'team')) || undefined,
    downloads: numberValue(getProp(item, 'downloads')),
    likes: numberValue(getProp(item, 'followers')),
    updatedAt: stringValue(getProp(item, 'updated')) || undefined,
    latestVersion: stringValue(getProp(item, 'published')) || undefined,
    supportedVersions: stringArray(getProp(item, 'game_versions')),
    supportedPlatforms: stringArray(getProp(item, 'loaders')).filter(isPluginPlatform),
    pageUrl: `${MODRINTH_SITE}/${slug || id}`,
    body: stringValue(getProp(item, 'body')) || undefined,
    links,
    license: stringValue(getProp(license, 'id')) || undefined,
    categories: stringArray(getProp(item, 'categories')),
  };
}

function mapModrinthVersion(item: JsonObject): PluginMarketVersion {
  const primaryFile = arrayOfObjects(getProp(item, 'files')).find((file) => booleanValue(getProp(file, 'primary')))
    ?? arrayOfObjects(getProp(item, 'files'))[0];

  return {
    provider: 'modrinth',
    id: stringValue(getProp(item, 'id')),
    name: stringValue(getProp(item, 'version_number')) || stringValue(getProp(item, 'name')),
    downloads: numberValue(getProp(item, 'downloads')),
    releasedAt: stringValue(getProp(item, 'date_published')) || undefined,
    supportedVersions: stringArray(getProp(item, 'game_versions')),
    supportedPlatforms: stringArray(getProp(item, 'loaders')).filter(isPluginPlatform),
    fileName: stringValue(getProp(primaryFile, 'filename')) || undefined,
    fileSize: numberValue(getProp(primaryFile, 'size')),
    downloadUrl: stringValue(getProp(primaryFile, 'url')) || undefined,
    channel: stringValue(getProp(item, 'version_type')) || undefined,
    installable: isInstallableUrl('modrinth', stringValue(getProp(primaryFile, 'url'))),
    external: false,
  };
}

function mapHangarResult(item: JsonObject): PluginMarketResult {
  const namespace = asObject(getProp(item, 'namespace'));
  const owner = stringValue(getProp(namespace, 'owner'));
  const slug = stringValue(getProp(namespace, 'slug')) || stringValue(getProp(item, 'name'));
  const id = owner && slug ? `${owner}/${slug}` : String(stringOrNumber(getProp(item, 'id')));
  const stats = asObject(getProp(item, 'stats'));

  return {
    provider: 'hangar',
    id,
    name: stringValue(getProp(item, 'name')) || slug,
    description: stringValue(getProp(item, 'description')),
    author: owner || undefined,
    downloads: numberValue(getProp(stats, 'downloads')),
    likes: numberValue(getProp(stats, 'stars')),
    updatedAt: stringValue(getProp(item, 'lastUpdated')) || undefined,
    supportedVersions: versionsFromHangarPlatforms(getProp(item, 'supportedPlatforms')),
    supportedPlatforms: Object.keys(asObject(getProp(item, 'supportedPlatforms'))).map(titleCase),
    pageUrl: `${HANGAR_SITE}/${owner}/${slug}`,
  };
}

function mapHangarDetails(item: JsonObject): PluginMarketDetails {
  const base = mapHangarResult(item);
  const settings = asObject(getProp(item, 'settings'));
  const license = asObject(getProp(settings, 'license'));

  return {
    ...base,
    body: stringValue(getProp(item, 'mainPageContent')) || undefined,
    links: hangarLinks(settings),
    license: stringValue(getProp(license, 'name')) || stringValue(getProp(license, 'type')) || undefined,
    categories: [stringValue(getProp(item, 'category'))].filter(Boolean),
  };
}

function mapHangarVersion(item: JsonObject): PluginMarketVersion {
  const downloads = asObject(getProp(item, 'downloads'));
  const paperDownload = firstNonEmptyObject(getProp(downloads, 'PAPER'), ...Object.values(downloads));
  const fileInfo = asObject(getProp(paperDownload, 'fileInfo'));
  const channel = asObject(getProp(item, 'channel'));
  const downloadUrl = stringValue(getProp(paperDownload, 'downloadUrl')) || stringValue(getProp(paperDownload, 'externalUrl')) || undefined;

  return {
    provider: 'hangar',
    id: stringOrNumber(getProp(item, 'id')) || stringValue(getProp(item, 'name')),
    name: stringValue(getProp(item, 'name')),
    downloads: numberValue(getProp(asObject(getProp(item, 'stats')), 'totalDownloads')),
    releasedAt: stringValue(getProp(item, 'createdAt')) || undefined,
    supportedVersions: versionsFromHangarPlatforms(getProp(item, 'platformDependencies')),
    supportedPlatforms: Object.keys(asObject(getProp(item, 'downloads'))).map(titleCase),
    fileName: stringValue(getProp(fileInfo, 'name')) || undefined,
    fileSize: numberValue(getProp(fileInfo, 'sizeBytes')),
    downloadUrl,
    channel: stringValue(getProp(channel, 'name')) || undefined,
    installable: Boolean(downloadUrl && isInstallableUrl('hangar', downloadUrl)),
    external: Boolean(getProp(paperDownload, 'externalUrl')),
  };
}

function hangarLinks(settings: JsonObject): Array<{ label: string; url: string }> {
  const groups = arrayOfObjects(getProp(settings, 'links'));
  return groups.flatMap((group) => arrayOfObjects(getProp(group, 'links')))
    .map((entry) => link(stringValue(getProp(entry, 'name')) || stringValue(getProp(entry, 'title')), stringValue(getProp(entry, 'url'))))
    .filter((entry): entry is { label: string; url: string } => Boolean(entry));
}

function modrinthDonationLinks(value: unknown): Array<{ label: string; url: string } | null> {
  return arrayOfObjects(value).map((entry) => (
    link(stringValue(getProp(entry, 'platform')) || 'Donation', stringValue(getProp(entry, 'url')))
  ));
}

function versionsFromHangarPlatforms(value: unknown): string[] {
  const platforms = asObject(value);
  return unique(Object.values(platforms).flatMap(stringArray));
}

function linksFromRecord(record: JsonObject): Array<{ label: string; url: string }> {
  return Object.entries(record)
    .map(([label, value]) => link(label, stringValue(value)))
    .filter((entry): entry is { label: string; url: string } => Boolean(entry));
}

function link(label: string, url: string): { label: string; url: string } | null {
  if (!label || !url) return null;
  return { label, url };
}

function getProp(obj: JsonObject | undefined, key: string): unknown {
  return obj?.[key];
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function arrayOfObjects(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(asObject).filter((item) => Object.keys(item).length > 0) : [];
}

function firstNonEmptyObject(...values: unknown[]): JsonObject {
  return values.map(asObject).find((item) => Object.keys(item).length > 0) ?? {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function stringOrNumber(value: unknown): string {
  if (typeof value === 'number') return String(value);
  return stringValue(value);
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function absoluteUrl(path: string, base: string): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function timestampSecondsToIso(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return new Date(value * 1000).toISOString();
}

function decodeBase64Text(value: string): string | undefined {
  if (!value) return undefined;
  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch {
    return undefined;
  }
}

function encodeHangarProjectId(id: string): string {
  return id.split('/').map(encodeURIComponent).join('/');
}

function isPluginPlatform(value: string): boolean {
  return ['bukkit', 'paper', 'spigot', 'folia', 'purpur'].includes(value.toLowerCase());
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

async function ipcCall<T = unknown>(
  ipc: IpcLike,
  method: string,
  params: Record<string, unknown>,
  timeout = 30000,
): Promise<T> {
  const response = await ipc.request(method, params, { timeout });
  if (response.error) throw new Error(response.error.message);
  return response.result as T;
}

async function uniquePluginPath(ipc: IpcLike, instanceId: string, desiredFileName: string): Promise<string> {
  const existing = await ipcCall<Array<{ name?: unknown }>>(ipc, 'files.list', {
    instance_id: instanceId,
    path: 'plugins',
  }).catch(() => []);
  const existingNames = new Set(existing.map((entry) => String(entry.name || '').toLowerCase()));
  if (!existingNames.has(desiredFileName.toLowerCase())) return `plugins/${desiredFileName}`;

  const stem = desiredFileName.replace(/\.jar$/i, '');
  for (let index = 2; index <= 99; index += 1) {
    const candidate = `${stem}-${index}.jar`;
    if (!existingNames.has(candidate.toLowerCase())) return `plugins/${candidate}`;
  }

  throw new Error('Too many installed files with the same plugin name.');
}

function isInstallableUrl(provider: PluginMarketProvider, value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') return false;
  return INSTALLABLE_HOSTS.get(provider)?.has(url.hostname.toLowerCase()) ?? false;
}

function sanitizeJarFileName(fileName: string): string {
  const withoutPath = fileName.split(/[\\/]/).filter(Boolean).pop() || 'plugin.jar';
  const withJar = withoutPath.toLowerCase().endsWith('.jar') ? withoutPath : `${withoutPath}.jar`;
  const cleaned = withJar
    .replace(/[^a-zA-Z0-9._ -]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 120);
  return cleaned && cleaned !== '.jar' ? cleaned : 'plugin.jar';
}

function safeName(value: string): string {
  return value.trim() || 'plugin';
}
