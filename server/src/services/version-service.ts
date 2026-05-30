export interface ServerVersion {
  id: string;
  type: 'vanilla' | 'paper' | 'spigot' | 'fabric';
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class VersionService {
  private cache = new Map<string, CacheEntry<ServerVersion[]>>();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  async getVanillaVersions(): Promise<ServerVersion[]> {
    const cacheKey = 'vanilla';
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    const url = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch versions: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as {
      versions: Array<{ id: string; type: string; url: string }>;
    };

    const versions: ServerVersion[] = data.versions
      .filter(v => v.type === 'release')
      .map(v => ({ id: v.id, type: 'vanilla' as const }));

    this.cache.set(cacheKey, { data: versions, timestamp: Date.now() });
    return versions;
  }

  async getPaperVersions(): Promise<ServerVersion[]> {
    const cacheKey = 'paper';
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    const url = 'https://api.papermc.io/v2/projects/paper';
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch Paper versions: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { versions: string[] };

    const versions: ServerVersion[] = data.versions
      .reverse() // newest first
      .map(v => ({ id: v, type: 'paper' as const }));

    this.cache.set(cacheKey, { data: versions, timestamp: Date.now() });
    return versions;
  }

  async getVersions(serverType: 'vanilla' | 'paper'): Promise<ServerVersion[]> {
    switch (serverType) {
      case 'vanilla': return this.getVanillaVersions();
      case 'paper': return this.getPaperVersions();
      default: return [];
    }
  }
}
