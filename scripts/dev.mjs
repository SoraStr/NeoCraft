import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const isWindows = platform() === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';
const daemonExe = `neocraft-daemon${isWindows ? '.exe' : ''}`;
const daemonBin = join(root, 'daemon', 'target', 'debug', daemonExe);
const dataDir = process.env.NEOCRAFT_DATA_DIR || join(homedir(), '.neocraft-dev');
const socket = process.env.NEOCRAFT_SOCKET || (
  isWindows ? String.raw`\\.\pipe\neocraft-daemon-dev` : join(dataDir, 'daemon.sock')
);

const children = new Set();

console.log('=== NeoCraft Development ===');
console.log('');
console.log('[1/3] Building Rust daemon...');
await run('cargo', ['build'], { cwd: join(root, 'daemon') });

if (!existsSync(daemonBin)) {
  throw new Error(`Daemon binary was not produced: ${daemonBin}`);
}

await mkdir(dataDir, { recursive: true });

const serverEnv = {
  ...process.env,
  NEOCRAFT_DAEMON_BIN: daemonBin,
  NEOCRAFT_DATA_DIR: dataDir,
  NEOCRAFT_SOCKET: socket,
};

console.log('[2/3] Starting API server...');
spawnTracked(npm, ['run', 'dev'], {
  cwd: join(root, 'server'),
  env: serverEnv,
  name: 'server',
});

console.log('[3/3] Starting frontend dev server...');
spawnTracked(npm, ['run', 'dev'], {
  cwd: join(root, 'frontend'),
  env: process.env,
  name: 'frontend',
});

console.log('');
console.log('=== Ready ===');
console.log('Frontend:  http://localhost:1145');
console.log('API:       http://localhost:3001');
console.log(`Data:      ${dataDir}`);
console.log(`IPC:       ${socket}`);
console.log('');
console.log('Press Ctrl+C to stop.');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(signal));
}

process.stdin.resume();

function spawnTracked(command, args, options) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: 'inherit',
    windowsHide: false,
  });
  children.add(child);
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (code !== 0 && signal === null) {
      console.error(`[${options.name}] exited with code ${code}`);
      shutdown('SIGTERM', code ?? 1);
    }
  });
  return child;
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: 'inherit',
      windowsHide: false,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
    child.on('error', reject);
  });
}

let shuttingDown = false;
function shutdown(signal, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('');
  console.log('Shutting down...');
  for (const child of children) {
    child.kill(signal);
  }
  setTimeout(() => process.exit(code), 500).unref();
}
