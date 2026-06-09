import { describe, expect, it, vi } from 'vitest';
import { PluginMarketService } from '../../src/services/plugin-market-service';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('PluginMarketService', () => {
  it('normalizes Modrinth plugin search results', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({
      hits: [{
        project_id: '1u6JkXh5',
        slug: 'worldedit',
        title: 'WorldEdit',
        description: 'Map editor',
        author: 'EngineHub',
        downloads: 1234,
        follows: 56,
        versions: ['1.21.10'],
        categories: ['paper', 'spigot', 'utility'],
        icon_url: 'https://cdn.example/icon.webp',
      }],
    }));
    const service = new PluginMarketService({ fetchFn });

    const results = await service.search('modrinth', 'worldedit');

    expect(results).toEqual([expect.objectContaining({
      provider: 'modrinth',
      id: '1u6JkXh5',
      name: 'WorldEdit',
      supportedPlatforms: ['paper', 'spigot'],
      pageUrl: 'https://modrinth.com/plugin/worldedit',
    })]);
    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('/search?'), expect.any(Object));
  });

  it('normalizes Hangar projects with namespace IDs', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({
      result: [{
        id: 6,
        name: 'WorldEdit',
        namespace: { owner: 'EngineHub', slug: 'WorldEdit' },
        description: 'Map editor',
        stats: { downloads: 74663, stars: 109 },
        supportedPlatforms: { PAPER: ['1.21.10'] },
      }],
    }));
    const service = new PluginMarketService({ fetchFn });

    const results = await service.search('hangar', 'worldedit');

    expect(results[0]).toEqual(expect.objectContaining({
      provider: 'hangar',
      id: 'EngineHub/WorldEdit',
      supportedPlatforms: ['Paper'],
      supportedVersions: ['1.21.10'],
      pageUrl: 'https://hangar.papermc.io/EngineHub/WorldEdit',
    }));
  });

  it('normalizes Spiget versions with download URLs', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([{
      id: 203285,
      name: '1.0',
      downloads: 358,
      releaseDate: 1364364840,
    }]));
    const service = new PluginMarketService({ fetchFn });

    const versions = await service.getVersions('spiget', '2');

    expect(versions[0]).toEqual(expect.objectContaining({
      provider: 'spiget',
      id: '203285',
      name: '1.0',
      downloadUrl: 'https://api.spiget.org/v2/resources/2/versions/203285/download',
      supportedPlatforms: ['Spigot', 'Paper'],
    }));
  });

  it('throws when an upstream market request fails', async () => {
    const service = new PluginMarketService({
      fetchFn: vi.fn().mockResolvedValue(jsonResponse({}, false, 503)),
    });

    await expect(service.search('modrinth', 'worldedit')).rejects.toThrow('HTTP 503');
  });

  it('downloads and writes a Modrinth plugin version safely', async () => {
    const ipc = {
      request: vi.fn()
        .mockResolvedValueOnce({ id: '', result: [{ name: 'World-Edit-7.4.3.jar' }] })
        .mockResolvedValueOnce({ id: '', result: { ok: true, name: 'World-Edit-7.4.3-2.jar' } })
        .mockResolvedValue({ id: '', result: [] }),
    };
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse([{
        id: 'ver1',
        version_number: '7.4.3',
        files: [{
          primary: true,
          filename: '../World Edit 7.4.3.jar',
          size: 12,
          url: 'https://cdn.modrinth.com/data/abc/versions/ver1/worldedit.jar',
        }],
        game_versions: ['1.21.10'],
        loaders: ['paper'],
      }]))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '12', 'content-type': 'application/java-archive' }),
        arrayBuffer: async () => new TextEncoder().encode('plugin-bytes').buffer,
      } as Response);
    const service = new PluginMarketService({ fetchFn });

    const result = await service.installPlugin(ipc as any, 'paper-demo', {
      provider: 'modrinth',
      projectId: 'abc',
      versionId: 'ver1',
    });

    expect(result.fileName).toBe('World-Edit-7.4.3-2.jar');
    expect(ipc.request).toHaveBeenCalledWith('files.write', {
      instance_id: 'paper-demo',
      path: 'plugins/World-Edit-7.4.3-2.jar',
      data: Buffer.from('plugin-bytes').toString('base64'),
    }, { timeout: 120000 });
  });

  it('refuses external plugin downloads that cannot be resolved safely', async () => {
    const service = new PluginMarketService({
      fetchFn: vi.fn().mockResolvedValue(jsonResponse({
        result: [{
          id: 100,
          name: 'v1',
          downloads: {
            PAPER: {
              externalUrl: 'https://example.com/plugin.jar',
              fileInfo: { name: 'plugin.jar', sizeBytes: 1 },
            },
          },
        }],
      })),
    });

    await expect(service.installPlugin({ request: vi.fn() } as any, 'paper-demo', {
      provider: 'hangar',
      projectId: 'owner/project',
      versionId: '100',
    })).rejects.toThrow('not installable');
  });

  it('refuses downloads that redirect to an untrusted host', async () => {
    const service = new PluginMarketService({
      fetchFn: vi.fn()
        .mockResolvedValueOnce(jsonResponse([{
          id: 'v1',
          version_number: 'v1',
          files: [{
            primary: true,
            filename: 'plugin.jar',
            size: 1,
            url: 'https://cdn.modrinth.com/data/abc/versions/v1/plugin.jar',
          }],
        }]))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          url: 'https://example.com/plugin.jar',
          headers: new Headers({ 'content-length': '1' }),
          arrayBuffer: async () => new Uint8Array([1]).buffer,
        } as Response),
    });

    await expect(service.installPlugin({ request: vi.fn() } as any, 'paper-demo', {
      provider: 'modrinth',
      projectId: 'abc',
      versionId: 'v1',
    })).rejects.toThrow('untrusted host');
  });
});
