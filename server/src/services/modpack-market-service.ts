export interface ModpackSearchResult {
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
  pageUrl: string;
}

export interface ModpackDetails extends ModpackSearchResult {
  body?: string;
  links: Array<{ label: string; url: string }>;
  license?: string;
  categories: string[];
}

export interface ModpackVersion {
  id: string;
  name: string;
  downloads?: number;
  releasedAt?: string;
  supportedVersions: string[];
  fileName?: string;
  fileSize?: number;
  downloadUrl?: string;
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type JsonObject = Record<string, unknown>;

const MODRINTH_API = 'https://api.modrinth.com/v2';
const MODRINTH_SITE = 'https://modrinth.com/modpack';
const USER_AGENT = 'NeoCraft/0.1 (Modpack Market)';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export class ModpackMarketService {
  private fetchFn: FetchLike;

  constructor(fetchFn?: FetchLike) {
    this.fetchFn = fetchFn ?? fetch;
  }

  async search(query: string, limit = DEFAULT_LIMIT): Promise<ModpackSearchResult[]> {
    const q = query.trim();
    if (!q || q.length < 2) return [];

    const facets = [
      ['project_type:modpack'],
      ['server_side:required', 'server_side:optional'],
    ];
    const params = new URLSearchParams({
      query: q,
      facets: JSON.stringify(facets),
      limit: String(clampLimit(limit)),
    });

    const data = await this.getJson<unknown>(`${MODRINTH_API}/search?${params}`);
    const hits = arrayOfObjects(getProp(asObject(data), 'hits'));
    return hits.map(mapSearchResult);
  }

  async getDetails(projectId: string): Promise<ModpackDetails> {
    const id = projectId.trim();
    if (!id) throw new Error('Missing modpack project ID.');

    const data = await this.getJson<unknown>(
      `${MODRINTH_API}/project/${encodeURIComponent(id)}`,
    );
    return mapDetails(asObject(data));
  }

  async getVersions(projectId: string, limit = DEFAULT_LIMIT): Promise<ModpackVersion[]> {
    const id = projectId.trim();
    if (!id) throw new Error('Missing modpack project ID.');

    const data = await this.getJson<unknown>(
      `${MODRINTH_API}/project/${encodeURIComponent(id)}/version`,
    );
    return arrayOfObjects(data)
      .slice(0, clampLimit(limit))
      .map(mapVersion);
  }

  private async getJson<T>(url: string): Promise<T> {
    const res = await this.fetchFn(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    });
    if (!res.ok) {
      throw new Error(`Modpack market request failed: HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }
}

function mapSearchResult(item: JsonObject): ModpackSearchResult {
  const id = stringValue(getProp(item, 'project_id')) || stringValue(getProp(item, 'slug'));
  const slug = stringValue(getProp(item, 'slug')) || id;

  return {
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
    pageUrl: `${MODRINTH_SITE}/${slug}`,
  };
}

function mapDetails(item: JsonObject): ModpackDetails {
  const slug = stringValue(getProp(item, 'slug'));
  const id = stringValue(getProp(item, 'id')) || slug;
  const links = [
    link('Source', stringValue(getProp(item, 'source_url'))),
    link('Issues', stringValue(getProp(item, 'issues_url'))),
    link('Wiki', stringValue(getProp(item, 'wiki_url'))),
    link('Discord', stringValue(getProp(item, 'discord_url'))),
  ].filter(Boolean) as Array<{ label: string; url: string }>;
  const license = asObject(getProp(item, 'license'));

  return {
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
    pageUrl: `${MODRINTH_SITE}/${slug || id}`,
    body: stringValue(getProp(item, 'body')) || undefined,
    links,
    license: stringValue(getProp(license, 'id')) || undefined,
    categories: stringArray(getProp(item, 'categories')),
  };
}

function mapVersion(item: JsonObject): ModpackVersion {
  const primaryFile =
    arrayOfObjects(getProp(item, 'files')).find((file) =>
      booleanValue(getProp(file, 'primary')),
    ) ?? arrayOfObjects(getProp(item, 'files'))[0];
  const downloadUrl = stringValue(getProp(primaryFile, 'url'));

  return {
    id: stringValue(getProp(item, 'id')),
    name: stringValue(getProp(item, 'version_number')) || stringValue(getProp(item, 'name')),
    downloads: numberValue(getProp(item, 'downloads')),
    releasedAt: stringValue(getProp(item, 'date_published')) || undefined,
    supportedVersions: stringArray(getProp(item, 'game_versions')),
    fileName: stringValue(getProp(primaryFile, 'filename')) || undefined,
    fileSize: numberValue(getProp(primaryFile, 'size')),
    downloadUrl: downloadUrl || undefined,
  };
}

// ─── JSON helpers ─────────────────────────────────────────────────────

function getProp(obj: JsonObject | undefined, key: string): unknown {
  return obj?.[key];
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function arrayOfObjects(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.map(asObject).filter((item) => Object.keys(item).length > 0)
    : [];
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
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function link(label: string, url: string): { label: string; url: string } | null {
  if (!label || !url) return null;
  return { label, url };
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}
