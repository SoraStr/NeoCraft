import { VersionService } from './version-service.js';

export interface ModpackFile {
  path: string;
  hashes: Record<string, string>;
  env: { client: string; server: string };
  downloads: string[];
}

export interface ModpackManifest {
  formatVersion: number;
  game: string;
  versionId: string;
  name: string;
  summary?: string;
  files: ModpackFile[];
  dependencies: Record<string, string>;
}

export interface ModpackInfo {
  manifest: ModpackManifest;
  serverType: 'fabric' | 'forge' | 'vanilla';
  minecraftVersion: string;
  loaderVersion?: string;
  installerVersion?: string;
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

const USER_AGENT = 'NeoCraft/0.1 (Modpack Import)';
const MODRINTH_CDN_HOST = 'cdn.modrinth.com';

export class ModpackService {
  private versionService: VersionService;
  private fetchFn: FetchLike;

  constructor(versionService: VersionService, fetchFn?: FetchLike) {
    this.versionService = versionService;
    this.fetchFn = fetchFn ?? fetch;
  }

  /** Download and parse a .mrpack file from a URL. */
  async fetchAndParse(url: string): Promise<ModpackInfo> {
    const buffer = await this.downloadPack(url);
    return this.parsePack(buffer);
  }

  /** Parse a .mrpack buffer into structured modpack info. */
  async parsePack(buffer: Buffer): Promise<ModpackInfo> {
    const manifest = await this.extractManifest(buffer);
    this.validateManifest(manifest);

    const { serverType, loaderVersion, installerVersion } = await this.determineServerInfo(manifest);

    return {
      manifest,
      serverType,
      minecraftVersion: manifest.dependencies['minecraft'] || manifest.versionId,
      loaderVersion,
      installerVersion,
    };
  }

  /** Extract modrinth.index.json from the .mrpack zip. */
  private async extractManifest(buffer: Buffer): Promise<ModpackManifest> {
    // Dynamic import of zlib + tar or unzip. .mrpack is a zip archive.
    // Use built-in node:zlib with a simple zip parser.
    const JSZip = await import('jszip');
    const zip = new JSZip.default();
    const contents = await zip.loadAsync(buffer, { createFolders: false });

    const indexFile = contents.file('modrinth.index.json');
    if (!indexFile) {
      throw new Error('Invalid modpack: modrinth.index.json not found in archive.');
    }

    const raw = await indexFile.async('string');
    try {
      return JSON.parse(raw) as ModpackManifest;
    } catch {
      throw new Error('Invalid modpack: modrinth.index.json is not valid JSON.');
    }
  }

  /** Validate the manifest has required fields. */
  private validateManifest(manifest: ModpackManifest): void {
    if (manifest.game !== 'minecraft') {
      throw new Error(`Unsupported game: ${manifest.game}. Only Minecraft modpacks are supported.`);
    }
    if (!manifest.dependencies || Object.keys(manifest.dependencies).length === 0) {
      throw new Error('Invalid modpack: missing dependencies in manifest.');
    }
    const mcVersion = manifest.dependencies['minecraft'] || manifest.versionId;
    if (!mcVersion) {
      throw new Error('Invalid modpack: missing Minecraft version in dependencies.');
    }
    if (!Array.isArray(manifest.files)) {
      throw new Error('Invalid modpack: missing files array in manifest.');
    }
  }

  /** Determine server type and loader version from manifest dependencies. */
  private async determineServerInfo(manifest: ModpackManifest): Promise<{
    serverType: 'fabric' | 'forge' | 'vanilla';
    loaderVersion?: string;
    installerVersion?: string;
  }> {
    const deps = manifest.dependencies;

    if (deps['fabric-loader'] || deps['quilt-loader']) {
      const loaderVersion = deps['fabric-loader'] || deps['quilt-loader'];
      const installers = await this.versionService.getFabricInstallerVersions();
      const latestStable = installers.find((i) => i.stable) ?? installers[0];
      const installerVersion = latestStable?.version;

      if (!installerVersion) {
        throw new Error('Failed to determine Fabric installer version.');
      }

      return { serverType: 'fabric', loaderVersion, installerVersion };
    }

    if (deps['forge'] || deps['neoforge']) {
      return {
        serverType: 'forge',
        loaderVersion: deps['forge'] || deps['neoforge'],
      };
    }

    // No mod loader — treat as vanilla
    return { serverType: 'vanilla' };
  }

  /** Download the .mrpack file from a URL. */
  private async downloadPack(url: string): Promise<Buffer> {
    const res = await this.fetchFn(url, {
      headers: {
        Accept: 'application/zip, application/octet-stream, */*',
        'User-Agent': USER_AGENT,
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      throw new Error(`Failed to download modpack: HTTP ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0) {
      throw new Error('Downloaded modpack is empty.');
    }
    if (buffer.length > 500 * 1024 * 1024) {
      throw new Error('Modpack file is too large (max 500 MB).');
    }

    return buffer;
  }

  /**
   * Filter modpack files to only include server-side mods.
   * Returns only files where env.server is "required" or "optional",
   * excluding client-only files.
   */
  filterServerFiles(files: ModpackFile[]): ModpackFile[] {
    return files.filter((file) => {
      const env = file.env;
      if (!env || !env.server) return true; // default: include
      return env.server === 'required' || env.server === 'optional';
    });
  }

  /** Check if a mod download URL is from a trusted Modrinth CDN host. */
  isTrustedDownloadUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === MODRINTH_CDN_HOST;
    } catch {
      return false;
    }
  }

  /**
   * Download a single mod file and return its bytes.
   */
  async downloadMod(url: string): Promise<Buffer> {
    if (!this.isTrustedDownloadUrl(url)) {
      throw new Error(`Untrusted download URL: ${url}`);
    }

    const res = await this.fetchFn(url, {
      headers: {
        Accept: 'application/java-archive, application/octet-stream, */*',
        'User-Agent': USER_AGENT,
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      throw new Error(`Mod download failed: HTTP ${res.status} for ${url}`);
    }

    const finalUrl = res.url || url;
    if (!this.isTrustedDownloadUrl(finalUrl)) {
      throw new Error('Mod download redirected to an untrusted host.');
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const MAX_MOD_SIZE = 240 * 1024 * 1024;
    if (buffer.length > MAX_MOD_SIZE) {
      throw new Error('Mod file is too large (max 240 MB).');
    }
    if (buffer.length === 0) {
      throw new Error('Mod download was empty.');
    }

    return buffer;
  }
}

/**
 * Sanitize a file name from a modpack file path.
 * Extracts the filename portion and cleans it.
 */
export function sanitizeFileName(path: string): string {
  const name = path.split(/[\\/]/).filter(Boolean).pop() || 'mod.jar';
  return name
    .replace(/[^a-zA-Z0-9._ -]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 120);
}
