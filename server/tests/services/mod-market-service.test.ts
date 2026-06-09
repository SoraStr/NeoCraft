import { describe, expect, it, vi } from 'vitest';
import { ModMarketService } from '../../src/services/mod-market-service';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('ModMarketService', () => {
  it('searches Modrinth mods with loader facets', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({
      hits: [{
        project_id: 'AANobbMI',
        slug: 'sodium',
        title: 'Sodium',
        description: 'Rendering engine',
        author: 'jellysquid3',
        downloads: 1234,
        follows: 56,
        versions: ['1.21.1'],
        categories: ['fabric', 'optimization'],
        icon_url: 'https://cdn.example/icon.webp',
      }],
    }));
    const service = new ModMarketService({ fetchFn });

    const results = await service.search('fabric', 'sodium', '1.21.1');

    expect(results[0]).toEqual(expect.objectContaining({
      provider: 'modrinth',
      id: 'AANobbMI',
      name: 'Sodium',
      supportedPlatforms: ['fabric'],
      pageUrl: 'https://modrinth.com/mod/sodium',
    }));

    const calledUrl = new URL(String(fetchFn.mock.calls[0][0]));
    expect(calledUrl.pathname).toBe('/v2/search');
    expect(JSON.parse(calledUrl.searchParams.get('facets') || '[]')).toEqual([
      ['project_type:mod'],
      ['categories:fabric'],
    ]);
  });

  it('filters Modrinth versions by loader and game version', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([{
      id: 'ver1',
      version_number: 'mc1.21.1-0.6.0',
      downloads: 99,
      date_published: '2026-01-01T00:00:00.000Z',
      version_type: 'release',
      game_versions: ['1.21.1'],
      loaders: ['fabric'],
      files: [{
        primary: true,
        filename: 'sodium-fabric.jar',
        size: 123,
        url: 'https://cdn.modrinth.com/data/AANobbMI/versions/ver1/sodium.jar',
      }],
    }]));
    const service = new ModMarketService({ fetchFn });

    const versions = await service.getVersions('AANobbMI', 'fabric', '1.21.1');

    expect(versions[0]).toEqual(expect.objectContaining({
      provider: 'modrinth',
      id: 'ver1',
      fileName: 'sodium-fabric.jar',
      installable: true,
      supportedPlatforms: ['fabric'],
    }));
    const calledUrl = new URL(String(fetchFn.mock.calls[0][0]));
    expect(calledUrl.pathname).toBe('/v2/project/AANobbMI/version');
    expect(JSON.parse(calledUrl.searchParams.get('loaders') || '[]')).toEqual(['fabric']);
    expect(JSON.parse(calledUrl.searchParams.get('game_versions') || '[]')).toEqual(['1.21.1']);
  });

  it('downloads and writes a Modrinth mod version into mods safely', async () => {
    const ipc = {
      request: vi.fn()
        .mockResolvedValueOnce({ id: '', result: [{ name: 'sodium.jar' }] })
        .mockResolvedValueOnce({ id: '', result: { ok: true, name: 'sodium-2.jar' } })
        .mockResolvedValue({ id: '', result: [] }),
    };
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse([{
        id: 'ver1',
        version_number: '0.6.0',
        game_versions: ['1.21.1'],
        loaders: ['fabric'],
        files: [{
          primary: true,
          filename: '../sodium.jar',
          size: 9,
          url: 'https://cdn.modrinth.com/data/AANobbMI/versions/ver1/sodium.jar',
        }],
      }]))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: 'https://cdn.modrinth.com/data/AANobbMI/versions/ver1/sodium.jar',
        headers: new Headers({ 'content-length': '9' }),
        arrayBuffer: async () => new TextEncoder().encode('mod-bytes').buffer,
      } as Response);
    const service = new ModMarketService({ fetchFn });

    const result = await service.installMod(ipc as any, 'fabric-demo', {
      provider: 'modrinth',
      projectId: 'AANobbMI',
      versionId: 'ver1',
      loader: 'fabric',
      gameVersion: '1.21.1',
    });

    expect(result.fileName).toBe('sodium-2.jar');
    expect(ipc.request).toHaveBeenCalledWith('files.write', {
      instance_id: 'fabric-demo',
      path: 'mods/sodium-2.jar',
      data: Buffer.from('mod-bytes').toString('base64'),
    }, { timeout: 120000 });
  });
});
