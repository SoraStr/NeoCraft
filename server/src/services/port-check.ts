import { createServer } from 'node:net';
import { execSync } from 'node:child_process';

export interface PortCheckResult {
  port: number;
  available: boolean;
  processName?: string;
  processPid?: number;
  suggestion?: number;
}

/** Check if a TCP port is available for listening. */
export async function checkPort(port: number): Promise<PortCheckResult> {
  const available = await isPortAvailable(port);
  if (available) {
    return { port, available: true };
  }

  const proc = findPortProcess(port);
  const suggestion = await findAvailablePort(port + 1, port + 100);

  return {
    port,
    available: false,
    processName: proc?.name,
    processPid: proc?.pid,
    suggestion,
  };
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => {
      server.close();
      resolve(false);
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '0.0.0.0');
  });
}

async function findAvailablePort(start: number, end: number): Promise<number> {
  for (let p = start; p <= end; p++) {
    if (await isPortAvailable(p)) return p;
  }
  return 0;
}

function findPortProcess(port: number): { name: string; pid: number } | null {
  try {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      // lsof -ti :<port> returns PID, lsof -P -i :<port> gives details
      const pidStr = execSync(`lsof -ti :${port}`, { encoding: 'utf-8', timeout: 3000 }).trim();
      const pid = parseInt(pidStr.split('\n')[0], 10);
      if (!pid) return null;

      const nameStr = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf-8', timeout: 3000 }).trim();
      return { name: nameStr || 'unknown', pid };
    } else if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8', timeout: 5000 }).trim();
      const match = out.match(/(\d+)\s*$/m);
      if (!match) return null;
      const pid = parseInt(match[1], 10);
      const nameOut = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV`, { encoding: 'utf-8', timeout: 3000 });
      const nameMatch = nameOut.match(/^"([^"]+)"/m);
      return { name: nameMatch?.[1] || 'unknown', pid };
    }
  } catch {
    // lsof or other tools unavailable
  }
  return null;
}
