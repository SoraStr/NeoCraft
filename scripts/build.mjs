import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { chmod, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const buildDir = join(root, 'build');
const isWindows = platform() === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';
const daemonExe = `neocraft-daemon${isWindows ? '.exe' : ''}`;

console.log('==> NeoCraft Build');
console.log(`    Output: ${buildDir}`);
console.log('');

await rm(buildDir, { recursive: true, force: true });
await mkdir(buildDir, { recursive: true });

console.log('── Building frontend...');
await run(npm, ['run', 'build'], { cwd: join(root, 'frontend') });
await cp(join(root, 'frontend', 'dist'), join(buildDir, 'frontend-dist'), { recursive: true });

console.log('── Building server...');
await run(npm, ['run', 'build'], { cwd: join(root, 'server') });
const serverOut = join(buildDir, 'server');
await mkdir(serverOut, { recursive: true });
await cp(join(root, 'server', 'dist'), join(serverOut, 'dist'), { recursive: true });
await cp(join(root, 'server', 'package.json'), join(serverOut, 'package.json'));
await cp(join(root, 'server', 'package-lock.json'), join(serverOut, 'package-lock.json'));
await run(npm, ['ci', '--omit=dev', '--ignore-scripts'], { cwd: serverOut });

console.log('── Building daemon...');
await run('cargo', ['build', '--release'], { cwd: join(root, 'daemon') });
await cp(join(root, 'daemon', 'target', 'release', daemonExe), join(buildDir, daemonExe));

await writeFile(join(buildDir, 'start.mjs'), startScript(daemonExe));
if (!isWindows) {
  await chmod(join(buildDir, 'start.mjs'), constants.S_IRWXU | constants.S_IRGRP | constants.S_IROTH);
}

console.log('');
console.log('==> Build complete');
console.log(`    Start: node ${join(buildDir, 'start.mjs')}`);
console.log('    Default URL: http://127.0.0.1:1145');

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

function startScript(daemonBinaryName) {
  return `import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const isWindows = platform() === 'win32';
const dataDir = process.env.NEOCRAFT_DATA_DIR || join(homedir(), '.neocraft');
const daemonBin = join(dir, '${daemonBinaryName}');

if (!existsSync(daemonBin)) {
  throw new Error(\`Missing daemon binary: \${daemonBin}\`);
}

await mkdir(dataDir, { recursive: true });

const env = {
  ...process.env,
  HOST: process.env.HOST || process.env.NEOCRAFT_HOST || '127.0.0.1',
  PORT: process.env.PORT || process.env.NEOCRAFT_PORT || '1145',
  NEOCRAFT_DATA_DIR: dataDir,
  NEOCRAFT_DAEMON_BIN: daemonBin,
  NEOCRAFT_FRONTEND_DIST: join(dir, 'frontend-dist'),
  NEOCRAFT_SOCKET: process.env.NEOCRAFT_SOCKET || (
    isWindows ? String.raw\`\\\\.\\pipe\\neocraft-daemon\` : join(dataDir, 'daemon.sock')
  ),
};

console.log('==> NeoCraft');
console.log(\`    Data: \${dataDir}\`);
console.log(\`    Open: http://\${env.HOST}:\${env.PORT}\`);
console.log('');

const serverDir = join(dir, 'server');
const child = spawn(process.execPath, [join(serverDir, 'dist', 'index.js')], {
  cwd: serverDir,
  env,
  stdio: 'inherit',
  windowsHide: false,
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
`;
}
