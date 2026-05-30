import { createServer, Server, Socket } from 'node:net';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync } from 'node:fs';

export interface MockDaemon {
  socketPath: string;
  server: Server;
  clients: Set<Socket>;
  cleanup: () => void;
  restart: () => Promise<void>;
}

export function createMockDaemon(): Promise<MockDaemon> {
  return new Promise((resolve, reject) => {
    const socketPath = join(tmpdir(), `neocraft-mock-${randomUUID()}.sock`);

    const server = createServer((socket) => {
      const rl = createInterface({ input: socket, crlfDelay: Infinity });

      rl.on('line', (line) => {
        try {
          const req = JSON.parse(line);

          // Intentionally slow: don't respond to simulate timeout
          if (req.method === 'slow.method') return;

          const response = {
            id: req.id,
            result: req.method === 'instance.list'
              ? { instances: [] }
              : { ok: true },
            error: null as any,
          };
          socket.write(JSON.stringify(response) + '\n');

          // If subscribe requested, also send events
          if (req.method === 'monitor.subscribe') {
            const event = {
              event: 'instance.stats',
              data: { instance_id: 'test', cpu_percent: 5.0, memory_mb: 512, uptime_secs: 10 },
            };
            socket.write(JSON.stringify(event) + '\n');
          }
        } catch {
          socket.write(JSON.stringify({ id: '', result: null, error: { code: 'PARSE_ERROR', message: 'Invalid JSON' } }) + '\n');
        }
      });
    });

    server.listen(socketPath, () => {
      resolve({
        socketPath,
        server,
        clients: new Set(),
        cleanup: () => {
          server.close();
          try { unlinkSync(socketPath); } catch {}
        },
        restart: () => {
          return new Promise<void>((res) => {
            server.close();
            server.listen(socketPath, () => res());
          });
        },
      });
    });

    server.on('error', reject);
  });
}
