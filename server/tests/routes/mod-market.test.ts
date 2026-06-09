import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import supertest from 'supertest';
import { modMarketRoutes } from '../../src/routes/mod-market';

function createService() {
  return {
    search: vi.fn().mockResolvedValue([{
      provider: 'modrinth',
      id: 'AANobbMI',
      name: 'Sodium',
      description: 'Rendering engine',
      supportedVersions: ['1.21.1'],
      supportedPlatforms: ['fabric'],
      pageUrl: 'https://modrinth.com/mod/sodium',
    }]),
    getDetails: vi.fn().mockResolvedValue({
      provider: 'modrinth',
      id: 'AANobbMI',
      name: 'Sodium',
      description: 'Rendering engine',
      supportedVersions: [],
      supportedPlatforms: ['fabric'],
      pageUrl: 'https://modrinth.com/mod/sodium',
      links: [],
      categories: [],
    }),
    getVersions: vi.fn().mockResolvedValue([]),
    installMod: vi.fn().mockResolvedValue({
      fileName: 'sodium.jar',
      size: 12,
      mods: [{ fileName: 'sodium.jar', name: 'Sodium' }],
    }),
  };
}

function createIpc() {
  return {
    request: vi.fn().mockImplementation((method: string) => {
      if (method === 'files.list') return Promise.resolve({ id: '', result: [] });
      if (method === 'files.write') return Promise.resolve({ id: '', result: { ok: true } });
      return Promise.resolve({ id: '', result: { ok: true } });
    }),
    onEvent: vi.fn(() => () => {}),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

async function buildTestApp(service = createService(), ipc = createIpc()) {
  const app = Fastify({ logger: false });
  await app.register(modMarketRoutes, { service: service as any, ipc: ipc as any });
  await app.ready();
  return { app, service, ipc };
}

describe('mod market routes', () => {
  it('searches Modrinth mods for a loader', async () => {
    const { app, service } = await buildTestApp();

    const res = await supertest(app.server)
      .get('/api/mod-market/search?loader=fabric&q=sodium&gameVersion=1.21.1')
      .expect(200);

    expect(res.body[0].name).toBe('Sodium');
    expect(service.search).toHaveBeenCalledWith('fabric', 'sodium', '1.21.1', 20);
    await app.close();
  });

  it('fetches versions with loader and game version filters', async () => {
    const { app, service } = await buildTestApp();

    await supertest(app.server)
      .get('/api/mod-market/modrinth/projects/AANobbMI/versions?loader=forge&gameVersion=1.20.1')
      .expect(200);

    expect(service.getVersions).toHaveBeenCalledWith('AANobbMI', 'forge', '1.20.1', 20);
    await app.close();
  });

  it('normalizes imported loader version labels before filtering versions', async () => {
    const { app, service } = await buildTestApp();

    await supertest(app.server)
      .get('/api/mod-market/modrinth/projects/AANobbMI/versions?loader=forge&gameVersion=1.20.1%20Forge%2047.2.0')
      .expect(200);

    expect(service.getVersions).toHaveBeenCalledWith('AANobbMI', 'forge', '1.20.1', 20);
    await app.close();
  });

  it('installs a selected mod version into an instance', async () => {
    const { app, service } = await buildTestApp();

    const res = await supertest(app.server)
      .post('/api/instances/fabric-demo/mod-market/install')
      .send({
        provider: 'modrinth',
        projectId: 'AANobbMI',
        versionId: 'ver1',
        loader: 'fabric',
        gameVersion: '1.21.1',
      })
      .expect(200);

    expect(res.body.fileName).toBe('sodium.jar');
    expect(service.installMod).toHaveBeenCalledWith(expect.any(Object), 'fabric-demo', {
      provider: 'modrinth',
      projectId: 'AANobbMI',
      versionId: 'ver1',
      loader: 'fabric',
      gameVersion: '1.21.1',
    });
    await app.close();
  });

  it('rejects invalid loaders', async () => {
    const { app, service } = await buildTestApp();

    await supertest(app.server)
      .get('/api/mod-market/search?loader=paper&q=sodium')
      .expect(400);

    expect(service.search).not.toHaveBeenCalled();
    await app.close();
  });
});
