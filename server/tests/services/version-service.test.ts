import { describe, it, expect, beforeEach, vi } from 'vitest';

// We'll test with mocked fetch to avoid network dependency
describe('VersionService', () => {
  it('should parse Mojang version manifest correctly', async () => {
    const { VersionService } = await import('../../src/services/version-service');
    const service = new VersionService();

    // Mock the fetch call
    const mockVersions = {
      latest: { release: '1.21.5', snapshot: '25w21a' },
      versions: [
        { id: '1.21.5', type: 'release', url: 'https://...', time: '2025-01-01T00:00:00Z', releaseTime: '2025-01-01T00:00:00Z' },
        { id: '1.21.4', type: 'release', url: 'https://...', time: '2024-12-01T00:00:00Z', releaseTime: '2024-12-01T00:00:00Z' },
        { id: '1.21.3', type: 'release', url: 'https://...', time: '2024-11-01T00:00:00Z', releaseTime: '2024-11-01T00:00:00Z' },
      ]
    };

    // Use global fetch (Node 22 has built-in fetch, we can mock with vitest)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockVersions),
    });

    const versions = await service.getVanillaVersions();
    expect(versions.length).toBe(3);
    expect(versions[0]).toEqual({ id: '1.21.5', type: 'vanilla' });
    expect(versions[2]).toEqual({ id: '1.21.3', type: 'vanilla' });
  });

  it('should parse PaperMC API correctly', async () => {
    const { VersionService } = await import('../../src/services/version-service');
    const service = new VersionService();

    // PaperMC API returns versions oldest-first; our service reverses to newest-first
    const mockPaperVersions = {
      project_id: 'paper',
      project_name: 'Paper',
      versions: ['1.21.1', '1.21.3', '1.21.4', '1.21.5'],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPaperVersions),
    });

    const versions = await service.getPaperVersions();
    expect(versions.length).toBe(4);
    expect(versions[0]).toEqual({ id: '1.21.5', type: 'paper' });
  });

  it('should cache results', async () => {
    const { VersionService } = await import('../../src/services/version-service');
    const service = new VersionService();

    const mockVersions = {
      versions: [{ id: '1.21.5', type: 'release', url: '', time: '', releaseTime: '' }],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockVersions),
    });

    await service.getVanillaVersions();
    await service.getVanillaVersions();
    await service.getVanillaVersions();

    // Should only have called fetch once (cached)
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should handle API errors gracefully', async () => {
    const { VersionService } = await import('../../src/services/version-service');
    const service = new VersionService();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(service.getVanillaVersions()).rejects.toThrow('Failed to fetch versions');
  });

  it('should only return release versions by default', async () => {
    const { VersionService } = await import('../../src/services/version-service');
    const service = new VersionService();

    const mockVersions = {
      versions: [
        { id: '1.21.5', type: 'release', url: '', time: '', releaseTime: '' },
        { id: '25w21a', type: 'snapshot', url: '', time: '', releaseTime: '' },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockVersions),
    });

    const versions = await service.getVanillaVersions();
    expect(versions.length).toBe(1);
    expect(versions[0].id).toBe('1.21.5');
  });
});
