import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import supertest from 'supertest';

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const mockIpc = {
    request: vi.fn().mockImplementation((method: string, params: any) => {
      if (method === 'config.get') {
        if (params.instance_id === 'nonexistent') {
          return Promise.resolve({ id: '', result: null, error: { code: 'NOT_FOUND', message: 'Not found' } });
        }
        return Promise.resolve({ id: '', result: { 'server-port': '25565', 'motd': 'Test MOTD' } });
      }
      if (method === 'config.set') {
        if (params.instance_id === 'nonexistent') {
          return Promise.resolve({ id: '', result: null, error: { code: 'NOT_FOUND', message: 'Not found' } });
        }
        return Promise.resolve({ id: '', result: { ok: true } });
      }
      return Promise.resolve({ id: '', result: null, error: { code: 'UNKNOWN', message: 'Unknown' } });
    }),
    onEvent: vi.fn(() => () => {}),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  const { configRoutes } = await import('../../src/routes/config');
  await app.register(configRoutes, { ipc: mockIpc });
  await app.ready();
  return app;
}

describe('GET /api/instances/:id/config', () => {
  it('should return server.properties as object', async () => {
    const app = await buildTestApp();
    const res = await supertest(app.server)
      .get('/api/instances/test-id/config')
      .expect(200);
    expect(res.body).toHaveProperty('server-port', '25565');
    expect(res.body).toHaveProperty('motd', 'Test MOTD');
    await app.close();
  });

  it('should return 404 for unknown instance', async () => {
    const app = await buildTestApp();
    await supertest(app.server)
      .get('/api/instances/nonexistent/config')
      .expect(404);
    await app.close();
  });
});

describe('PUT /api/instances/:id/config', () => {
  it('should update properties and return success', async () => {
    const app = await buildTestApp();
    const res = await supertest(app.server)
      .put('/api/instances/test-id/config')
      .send({ properties: { 'motd': 'Custom MOTD' } })
      .expect(200);
    expect(res.body.ok).toBe(true);
    await app.close();
  });

  it('should return 400 when no properties provided', async () => {
    const app = await buildTestApp();
    await supertest(app.server)
      .put('/api/instances/test-id/config')
      .send({})
      .expect(400);
    await app.close();
  });
});
