export interface ServerVersion {
  id: string;
  type: 'vanilla' | 'paper' | 'spigot' | 'fabric';
  downloadUrl?: string;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// ─── PaperMC (Paper.md) ────────────────────────────────────────────
// GET https://api.papermc.io/v2/projects/paper → { versions: [...] }
// GET .../versions/{version} → { builds: [...] } → latest build
// Download: .../versions/{version}/builds/{build}/downloads/paper-{version}-{build}.jar

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

// ─── Vanilla / Mojang (Vanilla.md) ──────────────────────────────────
// GET https://launchermeta.mojang.com/mc/game/version_manifest_v2.json
// → versions[].url → GET → downloads.server.url

async function resolveVanillaDownload(versionManifestUrl: string): Promise<string> {
  const res = await fetch(versionManifestUrl);
  if (!res.ok) throw new Error(`Vanilla version fetch failed: ${res.status}`);
  const data = await res.json() as { downloads: { server: { url: string } } };
  return data.downloads.server.url;
}

// ─── Spigot (Spigot.md) ─────────────────────────────────────────────
// GET https://hub.spigotmc.org/versions/ → HTML page with links
// Latest: GET https://hub.spigotmc.org/versions/latest.json → { name: "..." }
// Download: https://download.getbukkit.org/spigot/spigot-{version}.jar

async function fetchSpigotVersions(): Promise<ServerVersion[]> {
  // Try parsing the HTML versions page
  const res = await fetch('https://hub.spigotmc.org/versions/', {
    headers: { 'User-Agent': 'NeoCraft/0.1' },
  });
  if (!res.ok) throw new Error(`Spigot versions fetch failed: ${res.status}`);
  const html = await res.text();

  // Parse HTML: look for <a href="..."> tags with version-like content
  const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
  const versions: ServerVersion[] = [];
  const seen = new Set<string>();

  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const text = match[2].trim();
    // Match version patterns like "1.21.5", "1.20.4", etc.
    if (/^\d+\.\d+(?:\.\d+)?$/.test(text) && !seen.has(text)) {
      seen.add(text);
      versions.push({
        id: text,
        type: 'spigot',
        downloadUrl: `https://download.getbukkit.org/spigot/spigot-${text}.jar`,
      });
    }
  }

  if (versions.length === 0) {
    // Fallback: try latest.json to get at least the latest version
    const latestRes = await fetch('https://hub.spigotmc.org/versions/latest.json');
    if (latestRes.ok) {
      const latest = await latestRes.json() as { name: string };
      versions.push({
        id: latest.name,
        type: 'spigot',
        downloadUrl: `https://download.getbukkit.org/spigot/spigot-${latest.name}.jar`,
      });
    }
  }

  return versions.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
}

// ─── Fabric (Fabric.md) ─────────────────────────────────────────────
// GET https://meta.fabricmc.net/v2/versions/game → [{ version, stable }]
// GET https://meta.fabricmc.net/v2/versions/loader → [{ version, stable }]
// GET .../loader/{game}/{loader}/server/json → downloads.server.url

async function resolveFabricDownload(gameVersion: string): Promise<string> {
  // Get latest stable loader
  const loaderRes = await fetch('https://meta.fabricmc.net/v2/versions/loader');
  if (!loaderRes.ok) throw new Error(`Fabric loader fetch failed: ${loaderRes.status}`);
  const loaders = await loaderRes.json() as Array<{ version: string; stable: boolean }>;
  const stableLoader = loaders.find(l => l.stable) || loaders[0];
  if (!stableLoader) throw new Error('No Fabric loader found');

  // Get installer version from server JSON
  const serverJsonUrl = `https://meta.fabricmc.net/v2/versions/loader/${gameVersion}/${stableLoader.version}/server/json`;
  const serverRes = await fetch(serverJsonUrl);
  if (!serverRes.ok) throw new Error(`Fabric server info fetch failed: ${serverRes.status}`);
  const serverData = await serverRes.json() as { downloads: { server: { url: string } } };

  return serverData.downloads.server.url;
}

// ─── Main Service ───────────────────────────────────────────────────

export class VersionService {
  private cache = new Map<string, CacheEntry<ServerVersion[]>>();
  private cacheTTL = 10 * 60 * 1000; // 10 minutes

  async getPaperVersions(): Promise<ServerVersion[]> {
    const cacheKey = 'paper';
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) return cached.data;

    const url = 'https://api.papermc.io/v2/projects/paper';
    const response = await fetch(url, { headers: { 'User-Agent': 'NeoCraft/0.1' } });
    if (!response.ok) throw new Error(`Paper API error: ${response.status}`);

    const data = await response.json() as { versions: string[] };
    // Take latest 20 versions
    const latest = data.versions.reverse().slice(0, 20);

    // Resolve download URLs in parallel
    const versions: ServerVersion[] = [];
    for (const v of latest) {
      try {
        const downloadUrl = await resolvePaperDownload(v);
        versions.push({ id: v, type: 'paper', downloadUrl });
      } catch {
        // Skip versions without builds
      }
    }

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
      versions: Array<{ id: string; type: string; url: string }>;
    };

    // Take latest 30 release versions
    const releases = data.versions
      .filter(v => v.type === 'release')
      .slice(0, 30);

    // Resolve download URLs in parallel (first 10 to avoid rate limiting)
    const versions: ServerVersion[] = [];
    for (const v of releases.slice(0, 15)) {
      try {
        const downloadUrl = await resolveVanillaDownload(v.url);
        versions.push({ id: v.id, type: 'vanilla', downloadUrl });
      } catch {
        // Skip if can't resolve
      }
    }

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

    // Filter stable releases, take latest 20
    const stables = data
      .filter(v => v.stable)
      .slice(0, 20);

    const versions: ServerVersion[] = [];
    for (const v of stables) {
      try {
        const downloadUrl = await resolveFabricDownload(v.version);
        versions.push({ id: v.version, type: 'fabric', downloadUrl });
      } catch {
        // Skip if can't resolve
      }
    }

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
}
