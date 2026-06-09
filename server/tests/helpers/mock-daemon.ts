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
  restart: (delayMs?: number) => Promise<void>;
}

interface MockDaemonOptions {
  authToken?: string;
}

export function createMockDaemon(options: MockDaemonOptions = {}): Promise<MockDaemon> {
  return new Promise((resolve, reject) => {
    const socketPath = join(tmpdir(), `neocraft-mock-${randomUUID()}.sock`);

    const clients = new Set<Socket>();

    const server = createServer((socket) => {
      clients.add(socket);
      socket.on('close', () => clients.delete(socket));

      const rl = createInterface({ input: socket, crlfDelay: Infinity });
      let authenticated = !options.authToken;

      rl.on('line', (line) => {
        if (!authenticated) {
          if (line.trim() === options.authToken) {
            authenticated = true;
            socket.write(JSON.stringify({ auth: 'ok' }) + '\n');
          } else {
            socket.write(JSON.stringify({ auth: 'error', message: 'Invalid token' }) + '\n');
            socket.destroy();
          }
          return;
        }

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
        clients,
        cleanup: () => {
          for (const client of clients) client.destroy();
          server.close();
          try { unlinkSync(socketPath); } catch {}
        },
        restart: (delayMs = 0) => {
          return new Promise<void>((res) => {
            for (const client of clients) client.destroy();
            server.close(() => {
              setTimeout(() => {
                try { unlinkSync(socketPath); } catch {}
                server.listen(socketPath, () => res());
              }, delayMs);
            });
          });
        },
      });
    });

    server.on('error', reject);
  });
}
