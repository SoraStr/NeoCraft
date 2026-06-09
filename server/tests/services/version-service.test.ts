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

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { project: { families: [{ key: '26.1' }, { key: '1.21' }] } },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { project: { versions: { nodes: [{ key: '26.1.1' }, { key: '26.1.2' }] } } },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { project: { versions: { nodes: [{ key: '1.21.4' }, { key: '1.21.5' }] } } },
        }),
      });

    const versions = await service.getPaperVersions();
    expect(versions.length).toBe(4);
    expect(versions[0].id).toBe('26.1.2'); // newest first
    expect(versions[0].type).toBe('paper');
    expect(versions[0].downloadUrl).toBeUndefined();
  });

  it('should resolve Paper download URL lazily', async () => {
    const { VersionService } = await import('../../src/services/version-service');
    const service = new VersionService();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: {
          project: {
            version: {
              key: '26.1.1',
              builds: {
                nodes: [{
                  number: 29,
                  downloads: [{
                    name: 'paper-26.1.1-29.jar',
                    url: 'https://fill-data.papermc.io/v1/objects/abc/paper-26.1.1-29.jar',
                  }],
                }],
              },
            },
          },
        },
      }),
    });

    const url = await service.resolveDownloadUrl('paper', '26.1.1');
    expect(url).toContain('fill-data.papermc.io');
    expect(url).toContain('paper-26.1.1');
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

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { project: { families: [{ key: '1.21' }] } },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { project: { versions: { nodes: [{ key: '1.21.5' }] } } },
        }),
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
