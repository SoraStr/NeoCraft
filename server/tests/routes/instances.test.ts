import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import supertest from 'supertest';
import { IpcClient } from '../../src/services/ipc-client';
import { RconClient } from '../../src/services/rcon-client';

const { mockRconExecute } = vi.hoisted(() => ({
  mockRconExecute: vi.fn().mockResolvedValue('Command output'),
}));

vi.mock('../../src/services/rcon-client', () => ({
  RconClient: vi.fn().mockImplementation(() => ({
    execute: mockRconExecute,
  })),
}));

function createMockIpc() {
  const instances = new Map<string, any>();

  return {
    request: vi.fn(async (method: string, params: any) => {
      switch (method) {
        case 'instance.create': {
          const id = `inst-${instances.size + 1}`;
          const instance = {
            id,
            name: params.name,
            type: params.type,
            version: params.version,
            port: params.port || 25565,
            state: 'stopped',
            createdAt: new Date().toISOString(),
          };
          instances.set(id, instance);
          return { id: '', result: instance };
        }
        case 'instance.import': {
          const id = `inst-${instances.size + 1}`;
          const instance = {
            id,
            name: params.name,
            type: 'custom',
            version: '1.20.4',
            port: params.port || 25565,
            state: 'stopped',
            createdAt: new Date().toISOString(),
          };
          instances.set(id, instance);
          return { id: '', result: instance };
        }
        case 'instance.list':
          return { id: '', result: Array.from(instances.values()) };
        case 'instance.get': {
          const inst = instances.get(params.id);
          return inst
            ? { id: '', result: inst }
            : { id: '', error: { code: 'NOT_FOUND', message: 'Instance not found' } };
        }
        case 'instance.delete': {
          if (!instances.has(params.id)) {
            return { id: '', error: { code: 'NOT_FOUND', message: 'Instance not found' } };
          }
          instances.delete(params.id);
          return { id: '', result: { ok: true } };
        }
        case 'instance.start': {
          const inst = instances.get(params.id);
          if (!inst) {
            return { id: '', error: { code: 'NOT_FOUND', message: 'Instance not found' } };
          }
          inst.state = 'running';
          return { id: '', result: { ok: true, state: 'running' } };
        }
        case 'instance.stop': {
          const inst = instances.get(params.id);
          if (!inst) {
            return { id: '', error: { code: 'NOT_FOUND', message: 'Instance not found' } };
          }
          inst.state = 'stopped';
          return { id: '', result: { ok: true, state: 'stopped' } };
        }
        case 'instance.restart': {
          const inst = instances.get(params.id);
          if (!inst) {
            return { id: '', error: { code: 'NOT_FOUND', message: 'Instance not found' } };
          }
          inst.state = 'running';
          return { id: '', result: { ok: true, state: 'running' } };
        }
        case 'config.get': {
          const inst = instances.get(params.instance_id as string);
          if (!inst) {
            return { id: '', error: { code: 'NOT_FOUND', message: 'Instance not found' } };
          }
          return {
            id: '',
            result: {
              'rcon.port': '25575',
              'rcon.password': 'testpass',
              'enable-rcon': 'true',
              'server-port': String(params.port || inst.port),
            },
          };
        }
        default:
          return { id: '', result: { ok: true } };
      }
    }),
    onEvent: vi.fn(() => () => {}),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

async function buildTestApp(mockIpc?: ReturnType<typeof createMockIpc>) {
  const app = Fastify({ logger: false });
  const ipc = mockIpc ?? createMockIpc();

  const { instanceRoutes } = await import('../../src/routes/instances');
  await app.register(instanceRoutes, { ipc: ipc as any as IpcClient });

  await app.ready();
  return { app, ipc };
}

describe('POST /api/instances', () => {
  it('should create an instance and return 201', async () => {
    const { app } = await buildTestApp();

    const res = await supertest(app.server)
      .post('/api/instances')
      .send({ name: 'My Server', type: 'paper', version: '1.21.5', port: 25565 })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('My Server');
    expect(res.body.type).toBe('paper');
    expect(res.body.state).toBe('stopped');

    await app.close();
  });

  it('should return 400 for invalid server type', async () => {
    const mockIpc = createMockIpc();
    const { app } = await buildTestApp(mockIpc);

    const res = await supertest(app.server)
      .post('/api/instances')
      .send({ name: 'Bad', type: 'invalid', version: '1.21.5', port: 25565 })
      .expect(400);

    expect(res.body.error).toBeDefined();
    // Should not have called IPC for invalid input
    expect(mockIpc.request).not.toHaveBeenCalledWith('instance.create', expect.anything());

    await app.close();
  });

  it('should return 400 for missing required fields', async () => {
    const mockIpc = createMockIpc();
    const { app } = await buildTestApp(mockIpc);

    const res = await supertest(app.server)
      .post('/api/instances')
      .send({ name: 'Incomplete' })
      .expect(400);

    expect(res.body.error).toBeDefined();
    expect(mockIpc.request).not.toHaveBeenCalledWith('instance.create', expect.anything());

    await app.close();
  });
});

describe('POST /api/instances/import', () => {
  it('should import an instance with an extended IPC timeout', async () => {
    const mockIpc = createMockIpc();
    const { app } = await buildTestApp(mockIpc);

    const res = await supertest(app.server)
      .post('/api/instances/import')
      .send({ name: 'Imported', sourceDir: '/tmp/minecraft-server', port: 25565 })
      .expect(201);

    expect(res.body.name).toBe('Imported');
    expect(mockIpc.request).toHaveBeenCalledWith(
      'instance.import',
      {
        name: 'Imported',
        source_dir: '/tmp/minecraft-server',
        port: 25565,
        java_args: null,
        java_path: null,
      },
      { timeout: 1800000 },
    );

    await app.close();
  });
});

describe('GET /api/instances', () => {
  it('should list instances — empty when none created', async () => {
    const { app } = await buildTestApp();

    const res = await supertest(app.server)
      .get('/api/instances')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);

    await app.close();
  });

  it('should list instances after creation', async () => {
    const mockIpc = createMockIpc();
    const { app } = await buildTestApp(mockIpc);

    // Create one instance first
    await supertest(app.server)
      .post('/api/instances')
      .send({ name: 'Srv1', type: 'vanilla', version: '1.21.0' });

    const res = await supertest(app.server)
      .get('/api/instances')
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Srv1');

    await app.close();
  });
});

describe('GET /api/instances/:id', () => {
  it('should return instance details', async () => {
    const mockIpc = createMockIpc();
    const { app } = await buildTestApp(mockIpc);

    const createRes = await supertest(app.server)
      .post('/api/instances')
      .send({ name: 'DetailSrv', type: 'fabric', version: '1.21.4' });

    const id = createRes.body.id;

    const res = await supertest(app.server)
      .get(`/api/instances/${id}`)
      .expect(200);

    expect(res.body.id).toBe(id);
    expect(res.body.name).toBe('DetailSrv');

    await app.close();
  });

  it('should return 404 for unknown instance', async () => {
    const { app } = await buildTestApp();

    const res = await supertest(app.server)
      .get('/api/instances/nonexistent')
      .expect(404);

    expect(res.body.error).toBeDefined();

    await app.close();
  });
});

describe('DELETE /api/instances/:id', () => {
  it('should delete instance and return 204', async () => {
    const mockIpc = createMockIpc();
    const { app } = await buildTestApp(mockIpc);

    const createRes = await supertest(app.server)
      .post('/api/instances')
      .send({ name: 'DeleteMe', type: 'spigot', version: '1.20.4' });

    const id = createRes.body.id;

    await supertest(app.server)
      .delete(`/api/instances/${id}`)
      .expect(204);

    // Verify it's gone
    await supertest(app.server)
      .get(`/api/instances/${id}`)
      .expect(404);

    await app.close();
  });

  it('should return 404 for unknown instance', async () => {
    const { app } = await buildTestApp();

    const res = await supertest(app.server)
      .delete('/api/instances/nonexistent')
      .expect(404);

    expect(res.body.error).toBeDefined();

    await app.close();
  });
});

describe('POST /api/instances/:id/start', () => {
  it('should start a stopped instance', async () => {
    const mockIpc = createMockIpc();
    const { app } = await buildTestApp(mockIpc);

    const createRes = await supertest(app.server)
      .post('/api/instances')
      .send({ name: 'Test', type: 'paper', version: '1.21.5', port: 25565 });

    const id = createRes.body.id;

    const res = await supertest(app.server)
      .post(`/api/instances/${id}/start`)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.state).toBe('running');

    await app.close();
  });

  it('should return 404 for unknown instance', async () => {
    const { app } = await buildTestApp();

    await supertest(app.server)
      .post('/api/instances/nonexistent/start')
      .expect(404);

    await app.close();
  });
});

describe('POST /api/instances/:id/stop', () => {
  it('should stop a running instance', async () => {
    const mockIpc = createMockIpc();
    const { app } = await buildTestApp(mockIpc);

    const createRes = await supertest(app.server)
      .post('/api/instances')
      .send({ name: 'Test', type: 'paper', version: '1.21.5', port: 25565 });

    const id = createRes.body.id;

    const res = await supertest(app.server)
      .post(`/api/instances/${id}/stop`)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.state).toBe('stopped');

    await app.close();
  });
});

describe('POST /api/instances/:id/restart', () => {
  it('should restart an instance', async () => {
    const mockIpc = createMockIpc();
    const { app } = await buildTestApp(mockIpc);

    const createRes = await supertest(app.server)
      .post('/api/instances')
      .send({ name: 'Test', type: 'paper', version: '1.21.5', port: 25565 });

    const id = createRes.body.id;

    const res = await supertest(app.server)
      .post(`/api/instances/${id}/restart`)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.state).toBe('running');

    await app.close();
  });
});

describe('POST /api/instances/:id/rcon', () => {
  it('should execute an RCON command and return the result', async () => {
    mockRconExecute.mockResolvedValue('There are 0/20 players online:');
    const mockIpc = createMockIpc();
    const { app } = await buildTestApp(mockIpc);

    const createRes = await supertest(app.server)
      .post('/api/instances')
      .send({ name: 'RCON Test', type: 'paper', version: '1.21.5', port: 25565 });

    const id = createRes.body.id;

    const res = await supertest(app.server)
      .post(`/api/instances/${id}/rcon`)
      .send({ command: 'list' })
      .expect(200);

    expect(res.body).toEqual({ result: 'There are 0/20 players online:' });
    expect(vi.mocked(RconClient)).toHaveBeenCalledWith('localhost', 25575);
    expect(mockRconExecute).toHaveBeenCalledWith('testpass', 'list');

    await app.close();
  });

  it('should return 404 for unknown instance', async () => {
    const { app } = await buildTestApp();

    const res = await supertest(app.server)
      .post('/api/instances/nonexistent/rcon')
      .send({ command: 'list' })
      .expect(404);

    expect(res.body.error).toBeDefined();

    await app.close();
  });

  it('should return 400 when command is missing', async () => {
    const mockIpc = createMockIpc();
    const { app } = await buildTestApp(mockIpc);

    const createRes = await supertest(app.server)
      .post('/api/instances')
      .send({ name: 'RCON Test', type: 'paper', version: '1.21.5', port: 25565 });

    const id = createRes.body.id;

    const res = await supertest(app.server)
      .post(`/api/instances/${id}/rcon`)
      .send({})
      .expect(400);

    expect(res.body.error).toBe('Missing command.');

    await app.close();
  });

  it('should return 503 on RCON connection failure', async () => {
    mockRconExecute.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const mockIpc = createMockIpc();
    const { app } = await buildTestApp(mockIpc);

    const createRes = await supertest(app.server)
      .post('/api/instances')
      .send({ name: 'RCON Test', type: 'paper', version: '1.21.5', port: 25565 });

    const id = createRes.body.id;

    const res = await supertest(app.server)
      .post(`/api/instances/${id}/rcon`)
      .send({ command: 'list' })
      .expect(503);

    expect(res.body.error).toContain('connect ECONNREFUSED');

    await app.close();
  });
});
