import * as net from 'net';

export class RconClient {
  private host: string;
  private port: number;
  private nextId = 1;

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
  }

  async execute(password: string, command: string, timeoutMs = 5000): Promise<string> {
    const socket = new net.Socket();
    const requestId = this.nextId++;

    return new Promise<string>((resolve, reject) => {
      let buffer = Buffer.alloc(0);
      let phase: 'auth' | 'exec' | 'collecting' = 'auth';
      const responseParts: string[] = [];
      let idleTimer: NodeJS.Timeout | null = null;
      let settled = false;

      const overallTimeout = setTimeout(() => {
        cleanup();
        reject(new Error('RCON request timed out'));
      }, timeoutMs);

      const cleanup = () => {
        if (settled) return;
        settled = true;
        clearTimeout(overallTimeout);
        if (idleTimer) clearTimeout(idleTimer);
        if (!socket.destroyed) socket.destroy();
      };

      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        if (phase === 'collecting') {
          // Wait a short window for additional response packets, then resolve.
          idleTimer = setTimeout(() => {
            resolve(responseParts.join(''));
            cleanup();
          }, 50);
        }
      };

      socket.on('data', (data: Buffer) => {
        if (settled) return;
        try {
          buffer = Buffer.concat([buffer, data]);

          while (buffer.length >= 4) {
            const length = buffer.readInt32LE(0);
            if (length < 10) {
              // Malformed — the remaining payload must be at least 10 bytes
              // (request_id + type + 2 null terminators).
              cleanup();
              reject(new Error('RCON malformed packet: length too short'));
              return;
            }
            if (buffer.length < 4 + length) break;

            const packet = buffer.subarray(4, 4 + length);
            buffer = buffer.subarray(4 + length);

            const rid = packet.readInt32LE(0);
            const type = packet.readInt32LE(4);
            // Payload is null-terminated; find the first 0x00 after offset 8.
            const nullPos = packet.indexOf(0, 8);
            const payload = packet.subarray(8, nullPos >= 0 ? nullPos : undefined).toString('utf-8');

            if (phase === 'auth') {
              // Only care about type-2 auth responses during auth phase.
              if (type === 2) {
                if (rid === -1) {
                  cleanup();
                  reject(new Error('RCON authentication failed'));
                  return;
                }
                if (rid === requestId) {
                  // Auth succeeded — move to exec phase and send the command.
                  phase = 'exec';
                  sendPacket(socket, requestId, 2, command);
                }
              }
              // Ignore type-0 "empty response" packets that some servers send after auth.
            } else if (phase === 'exec') {
              if (type === 0 && rid === requestId) {
                responseParts.push(payload);
                phase = 'collecting';
                resetIdleTimer();
              }
            } else if (phase === 'collecting') {
              if (type === 0 && rid === requestId) {
                responseParts.push(payload);
                resetIdleTimer();
              }
            }
          }
        } catch (err) {
          cleanup();
          reject(err);
        }
      });

      socket.on('error', (err) => {
        cleanup();
        reject(err);
      });

      socket.on('close', () => {
        if (settled) return;
        // If we got here without receiving any response, it's an error.
        cleanup();
        reject(new Error('RCON connection closed unexpectedly'));
      });

      socket.connect(this.port, this.host, () => {
        // Send auth packet (type 3).
        sendPacket(socket, requestId, 3, password);
      });
    });
  }
}

function sendPacket(socket: net.Socket, requestId: number, type: number, payload: string): void {
  const payloadBytes = Buffer.from(payload, 'utf-8');
  const length = 4 + 4 + payloadBytes.length + 2;
  const packet = Buffer.alloc(4 + length);
  packet.writeInt32LE(length, 0);
  packet.writeInt32LE(requestId, 4);
  packet.writeInt32LE(type, 8);
  payloadBytes.copy(packet, 12);
  // Bytes 12+payloadBytes.length and 12+payloadBytes.length+1 are already 0x00
  // because Buffer.alloc zero-fills.
  socket.write(packet);
}
