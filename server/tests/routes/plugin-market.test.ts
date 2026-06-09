import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import supertest from 'supertest';
import { pluginMarketRoutes } from '../../src/routes/plugin-market';

function createService() {
  return {
    search: vi.fn().mockResolvedValue([{
      provider: 'modrinth',
      id: 'abc',
      name: 'Example',
      description: 'Example plugin',
      supportedVersions: [],
      supportedPlatforms: ['paper'],
      pageUrl: 'https://modrinth.com/plugin/example',
    }]),
    getDetails: vi.fn().mockResolvedValue({
      provider: 'hangar',
      id: 'EngineHub/WorldEdit',
      name: 'WorldEdit',
      description: 'Map editor',
      supportedVersions: [],
      supportedPlatforms: ['Paper'],
      pageUrl: 'https://hangar.papermc.io/EngineHub/WorldEdit',
      links: [],
      categories: [],
    }),
    getVersions: vi.fn().mockResolvedValue([]),
    installPlugin: vi.fn().mockResolvedValue({
      fileName: 'worldedit.jar',
      size: 12,
      mods: [{ fileName: 'worldedit.jar', name: 'WorldEdit' }],
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
  await app.register(pluginMarketRoutes, { service: service as any, ipc: ipc as any });
  await app.ready();
  return { app, service, ipc };
}

describe('plugin market routes', () => {
  it('searches a selected provider', async () => {
    const { app, service } = await buildTestApp();

    const res = await supertest(app.server)
      .get('/api/plugin-market/search?provider=modrinth&q=worldedit')
      .expect(200);

    expect(res.body[0].name).toBe('Example');
    expect(service.search).toHaveBeenCalledWith('modrinth', 'worldedit', 20);
    await app.close();
  });

  it('fetches details for slash-separated Hangar IDs', async () => {
    const { app, service } = await buildTestApp();

    await supertest(app.server)
      .get('/api/plugin-market/hangar/projects/EngineHub%2FWorldEdit')
      .expect(200);

    expect(service.getDetails).toHaveBeenCalledWith('hangar', 'EngineHub/WorldEdit');
    await app.close();
  });

  it('rejects invalid provider names', async () => {
    const { app, service } = await buildTestApp();

    await supertest(app.server)
      .get('/api/plugin-market/search?provider=bad&q=worldedit')
      .expect(400);

    expect(service.search).not.toHaveBeenCalled();
    await app.close();
  });

  it('installs a selected plugin version into an instance', async () => {
    const { app, service } = await buildTestApp();

    const res = await supertest(app.server)
      .post('/api/instances/paper-demo/plugin-market/install')
      .send({ provider: 'modrinth', projectId: '1u6JkXh5', versionId: 'yDUBafTJ' })
      .expect(200);

    expect(res.body.fileName).toBe('worldedit.jar');
    expect(service.installPlugin).toHaveBeenCalledWith(expect.any(Object), 'paper-demo', {
      provider: 'modrinth',
      projectId: '1u6JkXh5',
      versionId: 'yDUBafTJ',
    });
    await app.close();
  });

  it('rejects install requests with missing version IDs', async () => {
    const { app, service } = await buildTestApp();

    await supertest(app.server)
      .post('/api/instances/paper-demo/plugin-market/install')
      .send({ provider: 'modrinth', projectId: '1u6JkXh5' })
      .expect(400);

    expect(service.installPlugin).not.toHaveBeenCalled();
    await app.close();
  });
});
