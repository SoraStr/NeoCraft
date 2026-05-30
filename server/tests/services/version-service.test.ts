import { describe, it, expect, vi } from 'vitest';

describe('VersionService', () => {
  it('should fetch vanilla version list (fast, no download URLs)', async () => {
    const { VersionService } = await import('../../src/services/version-service');
    const service = new VersionService();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        versions: [
          { id: '1.21.5', type: 'release', url: '...' },
          { id: '1.21.4', type: 'release', url: '...' },
          { id: '25w21a', type: 'snapshot', url: '...' },
        ],
      }),
    });

    const versions = await service.getVanillaVersions();
    expect(versions.length).toBe(2); // snapshots filtered out
    expect(versions[0].type).toBe('vanilla');
    expect(versions[0].downloadUrl).toBeUndefined(); // not resolved yet
  });

  it('should fetch Paper version list (fast)', async () => {
    const { VersionService } = await import('../../src/services/version-service');
    const service = new VersionService();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ project_id: 'paper', versions: ['1.21.1', '1.21.5'] }),
    });

    const versions = await service.getPaperVersions();
    expect(versions.length).toBe(2);
    expect(versions[0].id).toBe('1.21.5'); // reversed, newest first
    expect(versions[0].type).toBe('paper');
    expect(versions[0].downloadUrl).toBeUndefined();
  });

  it('should resolve Paper download URL lazily', async () => {
    const { VersionService } = await import('../../src/services/version-service');
    const service = new VersionService();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ builds: [100, 200, 300] }),
    });

    const url = await service.resolveDownloadUrl('paper', '1.21.5');
    expect(url).toContain('api.papermc.io');
    expect(url).toContain('1.21.5');
    expect(url).toContain('300'); // latest build
  });

  it('should resolve Vanilla download URL lazily', async () => {
    const { VersionService } = await import('../../src/services/version-service');
    const service = new VersionService();

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        // First call: version manifest
        ok: true,
        json: () => Promise.resolve({
          versions: [
            { id: '1.21.5', type: 'release', url: 'https://example.com/1.21.5.json' },
          ],
        }),
      })
      .mockResolvedValueOnce({
        // Second call: version detail
        ok: true,
        json: () => Promise.resolve({
          downloads: { server: { url: 'https://download.example/server.jar' } },
        }),
      });

    const url = await service.resolveDownloadUrl('vanilla', '1.21.5');
    expect(url).toBe('https://download.example/server.jar');
  });

  it('should dispatch to correct list method via getVersions', async () => {
    const { VersionService } = await import('../../src/services/version-service');
    const service = new VersionService();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ project_id: 'paper', versions: ['1.21.5'] }),
    });

    const versions = await service.getVersions('paper');
    expect(versions.length).toBe(1);
    expect(versions[0].type).toBe('paper');
  });

  it('should reject unknown server types', async () => {
    const { VersionService } = await import('../../src/services/version-service');
    const service = new VersionService();
    await expect(service.getVersions('unknown' as any)).rejects.toThrow('Unknown server type');
  });

  it('should cache version list', async () => {
    const { VersionService } = await import('../../src/services/version-service');
    const service = new VersionService();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        versions: [{ id: '1.21.5', type: 'release', url: '...' }],
      }),
    });

    await service.getVanillaVersions();
    const callsAfterFirst = (global.fetch as any).mock.calls.length;

    await service.getVanillaVersions(); // should hit cache
    expect((global.fetch as any).mock.calls.length).toBe(callsAfterFirst);
  });

  it('should handle API errors', async () => {
    const { VersionService } = await import('../../src/services/version-service');
    const service = new VersionService();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Error',
    });

    await expect(service.getVanillaVersions()).rejects.toThrow();
  });
});
