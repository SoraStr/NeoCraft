export type ModMarketProvider = 'modrinth';
export type ModMarketLoader = 'fabric' | 'forge';

export interface ModMarketResult {
  provider: ModMarketProvider;
  id: string;
  name: string;
  description: string;
  iconUrl?: string;
  author?: string;
  downloads?: number;
  likes?: number;
  updatedAt?: string;
  latestVersion?: string;
  supportedVersions: string[];
  supportedPlatforms: string[];
  pageUrl: string;
}

export interface ModMarketDetails extends ModMarketResult {
  body?: string;
  links: Array<{ label: string; url: string }>;
  license?: string;
  categories: string[];
}

export interface ModMarketVersion {
  provider: ModMarketProvider;
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

export interface ModInstallSelection {
  provider: ModMarketProvider;
  projectId: string;
  versionId: string;
  loader: ModMarketLoader;
  gameVersion?: string;
}

export interface ModInstallResult {
  fileName: string;
  path: string;
  size: number;
  provider: ModMarketProvider;
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

const MODRINTH_API = 'https://api.modrinth.com/v2';
const MODRINTH_SITE = 'https://modrinth.com/mod';
const USER_AGENT = 'NeoCraft/0.1 (Mod Market)';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_MOD_DOWNLOAD_BYTES = 240 * 1024 * 1024;
const MODRINTH_CDN_HOST = 'cdn.modrinth.com';

export class ModMarketService {
  private readonly fetchFn: FetchLike;

  constructor(options: ServiceOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async search(
    loader: ModMarketLoader,
    query: string,
    gameVersion?: string,
    limit = DEFAULT_LIMIT,
  ): Promise<ModMarketResult[]> {
    const searchQuery = query.trim();
    if (!searchQuery) return [];

    const facets = [
      ['project_type:mod'],
      [`categories:${loader}`],
    ];
    const params = new URLSearchParams({
      query: searchQuery,
      facets: JSON.stringify(facets),
      limit: String(clampLimit(limit)),
    });

    const data = await this.getJson<unknown>(`${MODRINTH_API}/search?${params}`);
    const hits = arrayOfObjects(getProp(asObject(data), 'hits'));
    return hits.map(mapModrinthModResult);
  }

  async getDetails(projectId: string): Promise<ModMarketDetails> {
    const id = projectId.trim();
    if (!id) throw new Error('Missing mod project ID.');

    const data = await this.getJson<unknown>(`${MODRINTH_API}/project/${encodeURIComponent(id)}`);
    return mapModrinthModDetails(asObject(data));
  }

  async getVersions(
    projectId: string,
    loader: ModMarketLoader,
    gameVersion?: string,
    limit = DEFAULT_LIMIT,
  ): Promise<ModMarketVersion[]> {
    const id = projectId.trim();
    if (!id) throw new Error('Missing mod project ID.');

    const params = new URLSearchParams({
      loaders: JSON.stringify([loader]),
      include_changelog: 'false',
    });
    if (gameVersion?.trim()) {
      params.set('game_versions', JSON.stringify([gameVersion.trim()]));
    }

    const data = await this.getJson<unknown>(`${MODRINTH_API}/project/${encodeURIComponent(id)}/version?${params}`);
    return arrayOfObjects(data).slice(0, clampLimit(limit)).map(mapModrinthModVersion);
  }

  async installMod(
    ipc: IpcLike,
    instanceId: string,
    selection: ModInstallSelection,
  ): Promise<ModInstallResult> {
    const projectId = selection.projectId.trim();
    const versionId = selection.versionId.trim();
    if (!projectId || !versionId) throw new Error('Missing mod project or version ID.');

    const versions = await this.getVersions(projectId, selection.loader, selection.gameVersion, MAX_LIMIT);
    const version = versions.find((entry) => entry.id === versionId);
    if (!version) throw new Error('Mod version not found.');

    const downloadUrl = version.downloadUrl;
    if (!downloadUrl || !isModrinthInstallableUrl(downloadUrl)) {
      throw new Error('This mod version is not installable from a trusted direct download URL.');
    }

    const fileName = sanitizeJarFileName(version.fileName || `${safeName(version.name || versionId)}.jar`);
    const bytes = await this.downloadModBytes(downloadUrl);
    const path = await uniqueModPath(ipc, instanceId, fileName);
    const finalFileName = path.slice('mods/'.length);

    await ipcCall(ipc, 'files.write', {
      instance_id: instanceId,
      path,
      data: Buffer.from(bytes).toString('base64'),
    }, 120000);

    return {
      fileName: finalFileName,
      path,
      size: bytes.length,
      provider: 'modrinth',
      projectId,
      versionId,
      mods: [],
    };
  }

  private async getJson<T>(url: string): Promise<T> {
    const res = await this.fetchFn(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
    });

    if (!res.ok) {
      throw new Error(`Mod market request failed: HTTP ${res.status}`);
    }

    return await res.json() as T;
  }

  private async downloadModBytes(url: string): Promise<Buffer> {
    const res = await this.fetchFn(url, {
      headers: {
        Accept: 'application/java-archive, application/octet-stream, */*',
        'User-Agent': USER_AGENT,
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      throw new Error(`Mod download failed: HTTP ${res.status}`);
    }

    const finalUrl = res.url || url;
    if (!isModrinthInstallableUrl(finalUrl)) {
      throw new Error('Mod download redirected to an untrusted host.');
    }

    const length = Number.parseInt(res.headers.get('content-length') || '', 10);
    if (Number.isFinite(length) && length > MAX_MOD_DOWNLOAD_BYTES) {
      throw new Error('Mod file is too large (max 240 MB).');
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_MOD_DOWNLOAD_BYTES) {
      throw new Error('Mod file is too large (max 240 MB).');
    }
    if (buffer.length === 0) {
      throw new Error('Mod download was empty.');
    }

    return buffer;
  }
}

export function parseModMarketProvider(value: unknown): ModMarketProvider {
  if (value === 'modrinth') return value;
  throw new Error('Invalid mod market provider.');
}

export function parseModMarketLoader(value: unknown): ModMarketLoader {
  if (value === 'fabric' || value === 'forge') return value;
  throw new Error('Invalid mod loader.');
}

function mapModrinthModResult(item: JsonObject): ModMarketResult {
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
    supportedPlatforms: stringArray(getProp(item, 'categories')).filter(isModLoader),
    pageUrl: `${MODRINTH_SITE}/${slug}`,
  };
}

function mapModrinthModDetails(item: JsonObject): ModMarketDetails {
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
    supportedPlatforms: stringArray(getProp(item, 'loaders')).filter(isModLoader),
    pageUrl: `${MODRINTH_SITE}/${slug || id}`,
    body: stringValue(getProp(item, 'body')) || undefined,
    links,
    license: stringValue(getProp(license, 'id')) || undefined,
    categories: stringArray(getProp(item, 'categories')),
  };
}

function mapModrinthModVersion(item: JsonObject): ModMarketVersion {
  const primaryFile = arrayOfObjects(getProp(item, 'files')).find((file) => booleanValue(getProp(file, 'primary')))
    ?? arrayOfObjects(getProp(item, 'files'))[0];
  const downloadUrl = stringValue(getProp(primaryFile, 'url'));

  return {
    provider: 'modrinth',
    id: stringValue(getProp(item, 'id')),
    name: stringValue(getProp(item, 'version_number')) || stringValue(getProp(item, 'name')),
    downloads: numberValue(getProp(item, 'downloads')),
    releasedAt: stringValue(getProp(item, 'date_published')) || undefined,
    supportedVersions: stringArray(getProp(item, 'game_versions')),
    supportedPlatforms: stringArray(getProp(item, 'loaders')).filter(isModLoader),
    fileName: stringValue(getProp(primaryFile, 'filename')) || undefined,
    fileSize: numberValue(getProp(primaryFile, 'size')),
    downloadUrl: downloadUrl || undefined,
    channel: stringValue(getProp(item, 'version_type')) || undefined,
    installable: isModrinthInstallableUrl(downloadUrl),
    external: false,
  };
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

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
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

function isModLoader(value: string): boolean {
  return ['fabric', 'forge', 'neoforge', 'quilt'].includes(value.toLowerCase());
}

function link(label: string, url: string): { label: string; url: string } | null {
  if (!label || !url) return null;
  return { label, url };
}

function modrinthDonationLinks(value: unknown): Array<{ label: string; url: string } | null> {
  return arrayOfObjects(value).map((entry) => (
    link(stringValue(getProp(entry, 'platform')) || 'Donation', stringValue(getProp(entry, 'url')))
  ));
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

async function uniqueModPath(ipc: IpcLike, instanceId: string, desiredFileName: string): Promise<string> {
  const existing = await ipcCall<Array<{ name?: unknown }>>(ipc, 'files.list', {
    instance_id: instanceId,
    path: 'mods',
  }).catch(() => []);
  const existingNames = new Set(existing.map((entry) => String(entry.name || '').toLowerCase()));
  if (!existingNames.has(desiredFileName.toLowerCase())) return `mods/${desiredFileName}`;

  const stem = desiredFileName.replace(/\.jar$/i, '');
  for (let index = 2; index <= 99; index += 1) {
    const candidate = `${stem}-${index}.jar`;
    if (!existingNames.has(candidate.toLowerCase())) return `mods/${candidate}`;
  }

  throw new Error('Too many installed files with the same mod name.');
}

function isModrinthInstallableUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return url.protocol === 'https:' && url.hostname.toLowerCase() === MODRINTH_CDN_HOST;
}

function sanitizeJarFileName(fileName: string): string {
  const withoutPath = fileName.split(/[\\/]/).filter(Boolean).pop() || 'mod.jar';
  const withJar = withoutPath.toLowerCase().endsWith('.jar') ? withoutPath : `${withoutPath}.jar`;
  const cleaned = withJar
    .replace(/[^a-zA-Z0-9._ -]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 120);
  return cleaned && cleaned !== '.jar' ? cleaned : 'mod.jar';
}

function safeName(value: string): string {
  return value.trim() || 'mod';
}
