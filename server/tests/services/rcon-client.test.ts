import { describe, it, expect, afterEach } from 'vitest';
import * as net from 'net';
import { RconClient } from '../../src/services/rcon-client';

/**
 * Build a raw RCON packet.
 * Packet layout:
 *   [length: i32 LE] [request_id: i32 LE] [type: i32 LE] [payload: UTF-8] [0x00] [0x00]
 * length = 4 (request_id) + 4 (type) + payload_bytes + 2 (null terminators)
 */
function rconPacket(requestId: number, type: number, payload: string): Buffer {
  const payloadBytes = Buffer.from(payload, 'utf-8');
  const length = 4 + 4 + payloadBytes.length + 2;
  const buf = Buffer.alloc(4 + length);
  buf.writeInt32LE(length, 0);
  buf.writeInt32LE(requestId, 4);
  buf.writeInt32LE(type, 8);
  payloadBytes.copy(buf, 12);
  return buf;
}

/** Start a mock RCON TCP server; returns { server, port, host }. */
function startMockServer(handler: (socket: net.Socket) => void): Promise<{ server: net.Server; port: number; host: string }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server address'));
        return;
      }
      resolve({ server, port: addr.port, host: addr.address });
    });
    server.on('error', reject);
  });
}

describe('RconClient', () => {
  let servers: net.Server[] = [];

  afterEach(() => {
    for (const s of servers) s.close();
    servers = [];
  });

  it('should authenticate and execute a command successfully', async () => {
    const mock = await startMockServer((socket) => {
      let buf = Buffer.alloc(0);
      socket.on('data', (data: Buffer) => {
        buf = Buffer.concat([buf, data]);

        while (buf.length >= 4) {
          const length = buf.readInt32LE(0);
          if (buf.length < 4 + length) break;

          const packet = buf.subarray(4, 4 + length);
          buf = buf.subarray(4 + length);

          const requestId = packet.readInt32LE(0);
          const type = packet.readInt32LE(4);

          if (type === 3) {
            // Auth — respond success with same request id
            socket.write(rconPacket(requestId, 2, ''));
          } else if (type === 2) {
            // Command — respond with the command echoed back
            const nullIdx = packet.indexOf(0, 8);
            const cmd = packet.subarray(8, nullIdx >= 0 ? nullIdx : packet.length).toString('utf-8');
            socket.write(rconPacket(requestId, 0, `result: ${cmd}`));
          }
        }
      });
    });
    servers.push(mock.server);

    const client = new RconClient(mock.host, mock.port);
    const result = await client.execute('secret', 'list');
    expect(result).toBe('result: list');
  });

  it('should reject on authentication failure', async () => {
    const mock = await startMockServer((socket) => {
      socket.on('data', (data: Buffer) => {
        // Read the incoming packet to extract request id, but respond with -1
        const length = data.readInt32LE(0);
        expect(data.length).toBeGreaterThanOrEqual(4 + length);

        const requestId = data.readInt32LE(4); // original request id
        // Auth failure: respond type 2 with request id -1
        socket.write(rconPacket(-1, 2, ''));
      });
    });
    servers.push(mock.server);

    const client = new RconClient(mock.host, mock.port);
    await expect(client.execute('wrong-password', 'list')).rejects.toThrow('authentication failed');
  });

  it('should reject on timeout when server does not respond', async () => {
    const mock = await startMockServer((_socket) => {
      // Never respond — just eat the data
    });
    servers.push(mock.server);

    const client = new RconClient(mock.host, mock.port);
    await expect(
      client.execute('secret', 'list', 300)
    ).rejects.toThrow('timed out');
  });

  it('should handle multi-packet responses by concatenating payloads', async () => {
    const mock = await startMockServer((socket) => {
      let buf = Buffer.alloc(0);
      socket.on('data', (data: Buffer) => {
        buf = Buffer.concat([buf, data]);

        while (buf.length >= 4) {
          const length = buf.readInt32LE(0);
          if (buf.length < 4 + length) break;

          const packet = buf.subarray(4, 4 + length);
          buf = buf.subarray(4 + length);

          const requestId = packet.readInt32LE(0);
          const type = packet.readInt32LE(4);

          if (type === 3) {
            // Auth success
            socket.write(rconPacket(requestId, 2, ''));
          } else if (type === 2) {
            // Send two response packets with the same request id
            socket.write(rconPacket(requestId, 0, 'part1-'));
            // Use setImmediate to send the second packet after a microtick,
            // simulating a multi-packet response that arrives in separate TCP chunks.
            setImmediate(() => {
              socket.write(rconPacket(requestId, 0, 'part2'));
            });
          }
        }
      });
    });
    servers.push(mock.server);

    const client = new RconClient(mock.host, mock.port);
    const result = await client.execute('secret', 'long-command');
    expect(result).toBe('part1-part2');
  });

  it('should reject on connection refused', async () => {
    // Pick a port that is very likely closed.
    const client = new RconClient('127.0.0.1', 19999);
    await expect(client.execute('secret', 'list', 500)).rejects.toThrow();
  });
});
