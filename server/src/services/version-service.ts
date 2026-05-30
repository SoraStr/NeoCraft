export interface ServerVersion {
  id: string;
  type: 'vanilla' | 'paper' | 'spigot' | 'fabric';
  downloadUrl?: string;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// ─── PaperMC ────────────────────────────────────────────────────────

async function resolvePaperDownload(version: string): Promise<string> {
  const buildsUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}`;
  const res = await fetch(buildsUrl, { headers: { 'User-Agent': 'NeoCraft/0.1' } });
  if (!res.ok) throw new Error(`Paper builds fetch failed: ${res.status}`);
  const data = await res.json() as { builds: number[] };
  const builds = data.builds;
  if (!builds || builds.length === 0) throw new Error(`No builds for Paper ${version}`);
  const latestBuild = builds[builds.length - 1];
  return `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${latestBuild}/downloads/paper-${version}-${latestBuild}.jar`;
}

// ─── Vanilla / Mojang ────────────────────────────────────────────────

async function resolveVanillaDownload(versionUrl: string): Promise<string> {
  const res = await fetch(versionUrl);
  if (!res.ok) throw new Error(`Vanilla version fetch failed: ${res.status}`);
  const data = await res.json() as { downloads: { server: { url: string } } };
  return data.downloads.server.url;
}

// ─── Spigot ──────────────────────────────────────────────────────────

async function fetchSpigotVersions(): Promise<ServerVersion[]> {
  const res = await fetch('https://hub.spigotmc.org/versions/', {
    headers: { 'User-Agent': 'NeoCraft/0.1' },
  });
  if (!res.ok) throw new Error(`Spigot versions fetch failed: ${res.status}`);
  const html = await res.text();

  const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
  const versions: ServerVersion[] = [];
  const seen = new Set<string>();

  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const text = match[2].trim();
    if (/^\d+\.\d+(?:\.\d+)?$/.test(text) && !seen.has(text)) {
      seen.add(text);
      versions.push({ id: text, type: 'spigot' });
    }
  }

  if (versions.length === 0) {
    const latestRes = await fetch('https://hub.spigotmc.org/versions/latest.json');
    if (latestRes.ok) {
      const latest = await latestRes.json() as { name: string };
      versions.push({ id: latest.name, type: 'spigot' });
    }
  }

  return versions.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
}

function resolveSpigotDownload(version: string): string {
  return `https://download.getbukkit.org/spigot/spigot-${version}.jar`;
}

// ─── Fabric ──────────────────────────────────────────────────────────

let cachedFabricLoader: string | null = null;

async function getFabricLoaderVersion(): Promise<string> {
  if (cachedFabricLoader) return cachedFabricLoader;
  const res = await fetch('https://meta.fabricmc.net/v2/versions/loader');
  if (!res.ok) throw new Error(`Fabric loader fetch failed: ${res.status}`);
  const loaders = await res.json() as Array<{ version: string; stable: boolean }>;
  const stable = loaders.find(l => l.stable) || loaders[0];
  if (!stable) throw new Error('No Fabric loader found');
  cachedFabricLoader = stable.version;
  return cachedFabricLoader;
}

async function resolveFabricDownload(gameVersion: string): Promise<string> {
  const loaderVer = await getFabricLoaderVersion();
  const url = `https://meta.fabricmc.net/v2/versions/loader/${gameVersion}/${loaderVer}/server/json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fabric server info fetch failed: ${res.status}`);
  const data = await res.json() as { downloads: { server: { url: string } } };
  return data.downloads.server.url;
}

// ─── Main Service ───────────────────────────────────────────────────

export class VersionService {
  private cache = new Map<string, CacheEntry<ServerVersion[]>>();
  private urlCache = new Map<string, CacheEntry<string>>();
  private cacheTTL = 10 * 60 * 1000; // 10 minutes

  /** Get version list (fast — no download URL resolution) */
  async getPaperVersions(): Promise<ServerVersion[]> {
    const cacheKey = 'paper';
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) return cached.data;

    const url = 'https://api.papermc.io/v2/projects/paper';
    const response = await fetch(url, { headers: { 'User-Agent': 'NeoCraft/0.1' } });
    if (!response.ok) throw new Error(`Paper API error: ${response.status}`);

    const data = await response.json() as { versions: string[] };
    const versions: ServerVersion[] = data.versions
      .reverse()
      .slice(0, 30)
      .map(v => ({ id: v, type: 'paper' as const }));

    this.cache.set(cacheKey, { data: versions, timestamp: Date.now() });
    return versions;
  }

  async getVanillaVersions(): Promise<ServerVersion[]> {
    const cacheKey = 'vanilla';
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) return cached.data;

    const url = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Mojang API error: ${response.status}`);

    const data = await response.json() as {
      versions: Array<{ id: string; type: string }>;
    };

    const versions: ServerVersion[] = data.versions
      .filter(v => v.type === 'release')
      .slice(0, 30)
      .map(v => ({ id: v.id, type: 'vanilla' as const }));

    this.cache.set(cacheKey, { data: versions, timestamp: Date.now() });
    return versions;
  }

  async getSpigotVersions(): Promise<ServerVersion[]> {
    const cacheKey = 'spigot';
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) return cached.data;

    const versions = await fetchSpigotVersions();
    this.cache.set(cacheKey, { data: versions, timestamp: Date.now() });
    return versions;
  }

  async getFabricVersions(): Promise<ServerVersion[]> {
    const cacheKey = 'fabric';
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) return cached.data;

    const url = 'https://meta.fabricmc.net/v2/versions/game';
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fabric API error: ${response.status}`);

    const data = await response.json() as Array<{ version: string; stable: boolean }>;

    const versions: ServerVersion[] = data
      .filter(v => v.stable)
      .slice(0, 30)
      .map(v => ({ id: v.version, type: 'fabric' as const }));

    this.cache.set(cacheKey, { data: versions, timestamp: Date.now() });
    return versions;
  }

  async getVersions(serverType: string): Promise<ServerVersion[]> {
    switch (serverType) {
      case 'paper':   return this.getPaperVersions();
      case 'vanilla': return this.getVanillaVersions();
      case 'spigot':  return this.getSpigotVersions();
      case 'fabric':  return this.getFabricVersions();
      default: throw new Error(`Unknown server type: ${serverType}`);
    }
  }

  /** Resolve download URL for a specific version (called lazily when user picks a version) */
  async resolveDownloadUrl(serverType: string, version: string): Promise<string> {
    const cacheKey = `url:${serverType}:${version}`;
    const cached = this.urlCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) return cached.data;

    let url: string;
    switch (serverType) {
      case 'paper': {
        url = await resolvePaperDownload(version);
        break;
      }
      case 'vanilla': {
        // Need the version manifest URL first
        const manifestUrl = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';
        const res = await fetch(manifestUrl);
        if (!res.ok) throw new Error(`Mojang manifest fetch failed: ${res.status}`);
        const data = await res.json() as {
          versions: Array<{ id: string; type: string; url: string }>;
        };
        const match = data.versions.find(v => v.id === version && v.type === 'release');
        if (!match) throw new Error(`Version ${version} not found in manifest`);
        url = await resolveVanillaDownload(match.url);
        break;
      }
      case 'spigot': {
        url = resolveSpigotDownload(version);
        break;
      }
      case 'fabric': {
        url = await resolveFabricDownload(version);
        break;
      }
      default:
        throw new Error(`Unknown server type: ${serverType}`);
    }

    this.urlCache.set(cacheKey, { data: url, timestamp: Date.now() });
    return url;
  }
}
