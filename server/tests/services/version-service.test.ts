import { describe, it, expect, vi } from 'vitest';

describe('VersionService', () => {
  it('should fetch vanilla versions with download URLs', async () => {
    const { VersionService } = await import('../../src/services/version-service');
    const service = new VersionService();

    global.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = url.toString();
      if (urlStr.includes('version_manifest_v2')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            versions: [
              { id: '1.21.5', type: 'release', url: 'https://example.com/1.21.5.json' },
              { id: '1.21.4', type: 'release', url: 'https://example.com/1.21.4.json' },
            ],
          }),
        });
      }
      // Version detail responses (download URL)
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          downloads: { server: { url: `https://download.example/server.jar` } },
        }),
      });
    });

    const versions = await service.getVanillaVersions();
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions[0].type).toBe('vanilla');
    expect(versions[0].downloadUrl).toBeDefined();
  });

  it('should fetch Paper versions with download URLs', async () => {
    const { VersionService } = await import('../../src/services/version-service');
    const service = new VersionService();

    global.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = url.toString();
      if (urlStr === 'https://api.papermc.io/v2/projects/paper') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ project_id: 'paper', versions: ['1.21.5', '1.21.4'] }),
        });
      }
      // Builds endpoint
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ builds: [100, 200, 300] }),
      });
    });

    const versions = await service.getPaperVersions();
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions[0].type).toBe('paper');
    expect(versions[0].downloadUrl).toContain('api.papermc.io');
  });

  it('should fetch Fabric versions with download URLs', async () => {
    const { VersionService } = await import('../../src/services/version-service');
    const service = new VersionService();

    global.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = url.toString();
      if (urlStr.includes('versions/game')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { version: '1.21.5', stable: true },
            { version: '25w21a', stable: false },
          ]),
        });
      }
      if (urlStr.includes('versions/loader') && !urlStr.includes('server/json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { version: '0.16.0', stable: true },
          ]),
        });
      }
      // Server JSON (download URL)
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          downloads: { server: { url: 'https://meta.fabricmc.net/server.jar' } },
        }),
      });
    });

    const versions = await service.getFabricVersions();
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions.every(v => v.type === 'fabric')).toBe(true);
    // Should not include snapshots
    expect(versions.some(v => v.id === '25w21a')).toBe(false);
    if (versions.length > 0) expect(versions[0].downloadUrl).toBeDefined();
  });

  it('should dispatch to correct method via getVersions', async () => {
    const { VersionService } = await import('../../src/services/version-service');
    const service = new VersionService();

    global.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = url.toString();
      if (urlStr === 'https://api.papermc.io/v2/projects/paper') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ project_id: 'paper', versions: ['1.21.5'] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ builds: [500] }),
      });
    });

    const versions = await service.getVersions('paper');
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions[0].type).toBe('paper');
  });

  it('should reject unknown server types', async () => {
    const { VersionService } = await import('../../src/services/version-service');
    const service = new VersionService();
    await expect(service.getVersions('unknown' as any)).rejects.toThrow('Unknown server type');
  });

  it('should handle API errors gracefully', async () => {
    const { VersionService } = await import('../../src/services/version-service');
    const service = new VersionService();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Error',
    });

    await expect(service.getVanillaVersions()).rejects.toThrow();
  });

  it('should cache results', async () => {
    const { VersionService } = await import('../../src/services/version-service');
    const service = new VersionService();

    global.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = url.toString();
      if (urlStr.includes('version_manifest_v2')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            versions: [
              { id: '1.21.5', type: 'release', url: 'https://example.com/1.21.5.json' },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ downloads: { server: { url: 'https://dl.example/jar' } } }),
      });
    });

    await service.getVanillaVersions();
    const countAfterFirst = (global.fetch as any).mock.calls.length;

    // Second call should hit cache — no additional fetch calls
    await service.getVanillaVersions();
    const countAfterSecond = (global.fetch as any).mock.calls.length;

    // With caching, the second call should not increase fetch count
    expect(countAfterSecond).toBe(countAfterFirst);
  });
});
