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
});
