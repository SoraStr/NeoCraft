export interface ServerVersion {
  id: string;
  type: 'vanilla' | 'paper' | 'spigot' | 'fabric' | 'forge' | 'custom';
  downloadUrl?: string;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// ─── PaperMC (GraphQL API) ──────────────────────────────────────────

const PAPER_GQL = 'https://fill.papermc.io/graphql';

interface GqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface PaperVersionNode {
  key: string;
  family: { key: string };
  builds?: { nodes: Array<{ number: number; downloads: Array<{ name: string; url: string }> }> };
}

async function gqlQuery<T>(query: string): Promise<T> {
  const res = await fetch(PAPER_GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'NeoCraft/0.1' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Paper GraphQL error: ${res.status}`);
  const json = await res.json() as GqlResponse<T>;
  if (json.errors?.length) throw new Error(`GraphQL error: ${json.errors[0].message}`);
  return json.data!;
}

function isReleaseVersion(key: string): boolean {
  return !key.includes('-pre') && !key.includes('-rc');
}

async function fetchPaperVersions(): Promise<ServerVersion[]> {
  const query = `{
    project(key: "paper") {
      families { key }
    }
  }`;
  const data = await gqlQuery<{
    project: { families: Array<{ key: string }> };
  }>(query);

  const families = data.project.families.map(f => f.key);
  // Collect versions from each family in parallel
  const allVersions: ServerVersion[] = [];
  const results = await Promise.all(
    families.map(async (familyKey) => {
      const vQuery = `{
        project(key: "paper") {
          versions(first: 50, filterBy: { familyKey: "${familyKey}" }) {
            nodes { key }
          }
        }
      }`;
      const vData = await gqlQuery<{
        project: { versions: { nodes: Array<{ key: string }> } };
      }>(vQuery);
      return vData.project.versions.nodes
        .filter(v => isReleaseVersion(v.key))
        .map(v => ({ id: v.key, type: 'paper' as const }));
    }),
  );
  for (const vers of results) allVersions.push(...vers);
  return allVersions.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
}

async function resolvePaperDownload(version: string): Promise<string> {
  const query = `{
    project(key: "paper") {
      version(key: "${version}") {
        builds(first: 1, orderBy: { direction: DESC }) {
          nodes {
            downloads { name url }
          }
        }
      }
    }
  }`;
  const data = await gqlQuery<{
    project: {
      version: PaperVersionNode | null;
    };
  }>(query);

  if (!data.project.version) throw new Error(`Version ${version} not found`);
  const downloads = data.project.version.builds?.nodes?.[0]?.downloads;
  if (!downloads?.length) throw new Error(`No download for Paper ${version}`);
  return downloads[0].url;
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

  // Each link: <a href="1.21.9.json">1.21.9.json</a>
  //  or: <a href="1.21.json">1.21.json</a>
  // Pure-number versions like 1000.json are Spigot internal — skip those
  const linkRegex = /<a[^>]*href="(\d+\.\d+(?:\.\d+)?)\.json"[^>]*>/gi;
  const versionRegex = /^\d+\.\d+(?:\.\d+)?$/;
  const versions: ServerVersion[] = [];
  const seen = new Set<string>();

  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const version = match[1];
    if (versionRegex.test(version) && !seen.has(version)) {
      seen.add(version);
      versions.push({ id: version, type: 'spigot' });
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
  return `https://cdn.getbukkit.org/spigot/spigot-${version}.jar`;
}

// ─── Fabric ──────────────────────────────────────────────────────────

function resolveFabricDownload(
  gameVersion: string,
  loaderVersion: string,
  installerVersion: string,
): string {
  // https://meta.fabricmc.net/v2/versions/loader/{mc}/{loader}/{installer}/server/jar
  return `https://meta.fabricmc.net/v2/versions/loader/${gameVersion}/${loaderVersion}/${installerVersion}/server/jar`;
}

// ─── Main Service ───────────────────────────────────────────────────

export class VersionService {
  private cache = new Map<string, CacheEntry<ServerVersion[]>>();
  private urlCache = new Map<string, CacheEntry<string>>();
  private cacheTTL = 10 * 60 * 1000; // 10 minutes
  private fabricLoadersCache: CacheEntry<Array<{ version: string; stable: boolean }>> | null = null;
  private fabricInstallersCache: CacheEntry<Array<{ version: string; stable: boolean }>> | null = null;

  /** Get version list (fast — no download URL resolution) */
  async getPaperVersions(): Promise<ServerVersion[]> {
    const cacheKey = 'paper';
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) return cached.data;

    const versions = await fetchPaperVersions();

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

  /** Get Fabric loader versions with TTL-based caching. */
  async getFabricLoaderVersions(): Promise<Array<{ version: string; stable: boolean }>> {
    if (this.fabricLoadersCache && Date.now() - this.fabricLoadersCache.timestamp < this.cacheTTL) {
      return this.fabricLoadersCache.data;
    }
    const res = await fetch('https://meta.fabricmc.net/v2/versions/loader');
    if (!res.ok) throw new Error(`Fabric loader fetch failed: ${res.status}`);
    const data = await res.json() as Array<{ version: string; stable: boolean }>;
    this.fabricLoadersCache = { data, timestamp: Date.now() };
    return data;
  }

  /** Get Fabric installer versions with TTL-based caching. */
  async getFabricInstallerVersions(): Promise<Array<{ version: string; stable: boolean }>> {
    if (this.fabricInstallersCache && Date.now() - this.fabricInstallersCache.timestamp < this.cacheTTL) {
      return this.fabricInstallersCache.data;
    }
    const res = await fetch('https://meta.fabricmc.net/v2/versions/installer');
    if (!res.ok) throw new Error(`Fabric installer fetch failed: ${res.status}`);
    const data = await res.json() as Array<{ version: string; stable: boolean }>;
    this.fabricInstallersCache = { data, timestamp: Date.now() };
    return data;
  }

  async getVersions(serverType: string): Promise<ServerVersion[]> {
    switch (serverType) {
      case 'paper':   return this.getPaperVersions();
      case 'vanilla': return this.getVanillaVersions();
      case 'spigot':  return this.getSpigotVersions();
      case 'fabric':  return this.getFabricVersions();
      case 'forge':   return []; // Forge servers are imported — no version API
      case 'custom':  return []; // Custom servers use their own JAR — no version list
      default: throw new Error(`Unknown server type: ${serverType}`);
    }
  }

  /** Resolve download URL. For Fabric, `version` = minecraft version, and
   *  `fabricLoader` + `fabricInstaller` must be provided. */
  async resolveDownloadUrl(
    serverType: string,
    version: string,
    fabricLoader?: string,
    fabricInstaller?: string,
  ): Promise<string> {
    const cacheKey = `url:${serverType}:${version}:${fabricLoader || ''}:${fabricInstaller || ''}`;
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
        if (!fabricLoader || !fabricInstaller) {
          throw new Error('Fabric requires loader and installer version parameters');
        }
        url = resolveFabricDownload(version, fabricLoader, fabricInstaller);
        break;
      }
      case 'forge':
      case 'custom': {
        throw new Error('Forge and custom servers do not support download URL resolution — provide your own server directory');
      }
      default:
        throw new Error(`Unknown server type: ${serverType}`);
    }

    this.urlCache.set(cacheKey, { data: url, timestamp: Date.now() });
    return url;
  }
}
