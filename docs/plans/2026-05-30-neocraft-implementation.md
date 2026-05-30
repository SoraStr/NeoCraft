# NeoCraft Implementation Plan

> **For implementer:** Use TDD throughout. Write failing test first. Watch it fail. Then implement.

**Goal:** Build a macOS Minecraft server control panel (React + Node.js + Rust) with install, start/stop, real-time logs, resource monitoring, and config editing.

**Architecture:** Rust daemon manages MC subprocess lifecycle via Unix Domain Socket IPC. Node.js Fastify server bridges IPC to REST/WebSocket. React frontend consumes API.

**Tech Stack:** React 19 + TS 5 + Tailwind 4 + shadcn/ui, Fastify 5 + Vitest, Rust + tokio + cargo test

---

## Task Dependency Graph

```
Phase A: Scaffolding (A1–A4) — parallel
    ↓
Phase B: Rust Daemon Core (B1–B8) — sequential within, parallel to C1
    ↓
Phase C: Node.js Server Core (C1–C8) — sequential
    ↓
Phase D: Frontend Core (D1–D8) — sequential
    ↓
Phase E: Integration & Polish (E1–E4) — sequential
```

---

## Phase A: Project Scaffolding

### Task A1: Root Monorepo Setup

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.node-version`

**Step 1: Write `package.json`**
```json
{
  "name": "neocraft",
  "private": true,
  "description": "Minecraft server control panel for macOS",
  "scripts": {
    "dev": "concurrently \"npm run dev:daemon\" \"npm run dev:server\" \"npm run dev:frontend\"",
    "dev:server": "cd server && npm run dev",
    "dev:frontend": "cd frontend && npm run dev",
    "build:daemon": "cd daemon && cargo build --release",
    "test": "npm run test:daemon && npm run test:server && npm run test:frontend",
    "test:daemon": "cd daemon && cargo test",
    "test:server": "cd server && npm test",
    "test:frontend": "cd frontend && npm test"
  }
}
```

**Step 2: Write `.gitignore`**
```
node_modules/
dist/
target/
.env
*.log
.DS_Store
~/.neocraft/instances/
```

**Step 3: Write `.node-version`**
```
22
```

**Step 4: `npm install` for root workspace tools**
```bash
npm install --save-dev concurrently
```

**Step 5: Commit**
```bash
git add package.json package-lock.json .gitignore .node-version && git commit -m "scaffold: root monorepo setup"
```

---

### Task A2: Rust Daemon Scaffold

**Files:**
- Create: `daemon/Cargo.toml`
- Create: `daemon/src/main.rs`
- Create: `daemon/src/lib.rs`
- Create: `daemon/src/protocol.rs`
- Create: `daemon/src/ipc.rs`
- Create: `daemon/src/instance.rs`
- Create: `daemon/src/downloader.rs`
- Create: `daemon/src/monitor.rs`
- Create: `daemon/src/logpipe.rs`
- Create: `daemon/src/files.rs`

**Step 1: `Cargo.toml`**
```toml
[package]
name = "neocraft-daemon"
version = "0.1.0"
edition = "2024"

[dependencies]
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4"] }
reqwest = { version = "0.12", features = ["json", "stream"] }
sysinfo = "0.33"
sha2 = "0.10"
thiserror = "2"
tracing = "0.1"
tracing-subscriber = "0.3"
dirs = "6"
clap = { version = "4", features = ["derive"] }

[dev-dependencies]
tempfile = "3"
tokio-test = "0.4"
```

**Step 2: `main.rs` skeleton**
```rust
use clap::Parser;

#[derive(Parser)]
#[command(name = "neocraft-daemon")]
struct Cli {
    /// Path to Unix domain socket
    #[arg(long, default_value = "~/.neocraft/daemon.sock")]
    socket: String,
}

fn main() {
    tracing_subscriber::fmt::init();
    let cli = Cli::parse();
    tracing::info!("NeoCraft daemon starting, socket: {}", cli.socket);
}
```

**Step 3: `lib.rs` — module declarations**
```rust
pub mod protocol;
pub mod ipc;
pub mod instance;
pub mod downloader;
pub mod monitor;
pub mod logpipe;
pub mod files;
```

**Step 4: Verify it compiles**
```bash
cd daemon && cargo check
```
Expected: Compilation succeeds with warnings about unused imports (OK for scaffold).

**Step 5: Commit**
```bash
git add daemon/ && git commit -m "scaffold: Rust daemon skeleton"
```

---

### Task A3: Node.js Server Scaffold

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/vitest.config.ts`
- Create: `server/src/index.ts`
- Create: `server/src/plugins/`
- Create: `server/src/routes/`
- Create: `server/src/services/`
- Create: `server/src/websocket/`

**Step 1: `server/package.json`**
```json
{
  "name": "neocraft-server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "fastify": "^5.0.0",
    "@fastify/websocket": "^11.0.0",
    "@fastify/static": "^8.0.0",
    "@fastify/cors": "^10.0.0",
    "pino": "^9.0.0",
    "pino-pretty": "^13.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "tsx": "^4.0.0",
    "vitest": "^3.0.0",
    "@types/node": "^22.0.0",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.0"
  }
}
```

**Step 2: `server/tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 3: `server/vitest.config.ts`**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

**Step 4: `server/src/index.ts` skeleton**
```typescript
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';

const server = Fastify({ logger: true });

async function main() {
  await server.register(cors);
  await server.register(websocket);

  server.get('/api/health', async () => ({ status: 'ok' }));

  await server.listen({ port: 3001, host: '127.0.0.1' });
  server.log.info('NeoCraft API server listening on :3001');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Step 5: Verify server starts**
```bash
cd server && npm install && npx tsx src/index.ts
```
Expected: "NeoCraft API server listening on :3001" (Ctrl+C to stop).

**Step 6: Commit**
```bash
git add server/ && git commit -m "scaffold: Node.js API server skeleton"
```

---

### Task A4: Frontend Scaffold

**Files:**
- Create: `frontend/` via Vite
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/index.css`

**Step 1: Scaffold with Vite**
```bash
cd frontend && npm create vite@latest . -- --template react-ts
npm install
npm install react-router-dom zustand tailwindcss @tailwindcss/vite @shadcn/ui
```

**Step 2: Configure Tailwind in `vite.config.ts`**

**Step 3: `src/index.css`**
```css
@import "tailwindcss";
```

**Step 4: `src/App.tsx` — minimal router**
```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
```

**Step 5: `src/pages/Dashboard.tsx` — placeholder**
```tsx
export function Dashboard() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">NeoCraft</h1>
      <p className="text-muted-foreground">Minecraft Server Panel</p>
    </div>
  );
}
```

**Step 6: Verify dev server**
```bash
cd frontend && npm run dev
```
Expected: Vite dev server starts, open http://localhost:5173 to see dashboard placeholder.

**Step 7: Commit**
```bash
git add frontend/ && git commit -m "scaffold: React frontend skeleton"
```

---

## Phase B: Rust Daemon Core

### Task B1: Protocol Types & Serialization

**Files:**
- Create: `daemon/src/protocol.rs`
- Create: `daemon/tests/protocol_tests.rs`

**Tests (write first, must fail):**
```rust
use neocraft_daemon::protocol::{Request, Response, Event, Method, InstanceState};

#[test]
fn test_deserialize_request() {
    let json = r#"{"id":"abc","method":"instance.start","params":{"id":"inst1"}}"#;
    let req: Request = serde_json::from_str(json).unwrap();
    assert_eq!(req.id, "abc");
    assert!(matches!(req.method, Method::InstanceStart));
}

#[test]
fn test_serialize_response() {
    let resp = Response { id: "abc".into(), result: Some(serde_json::json!({"pid": 42})), error: None };
    let json = serde_json::to_string(&resp).unwrap();
    assert!(json.contains("\"pid\":42"));
}

#[test]
fn test_serialize_event() {
    let ev = Event::InstanceStateChange { instance_id: "i1".into(), state: InstanceState::Running };
    let json = serde_json::to_string(&ev).unwrap();
    assert!(json.contains("instance.state_change"));
    assert!(json.contains("\"running\""));
}

#[test]
fn test_error_response() {
    let resp = Response { id: "abc".into(), result: None, error: Some(neocraft_daemon::protocol::Error { code: "NOT_FOUND".into(), message: "Instance not found".into() }) };
    let json = serde_json::to_string(&resp).unwrap();
    assert!(json.contains("NOT_FOUND"));
}
```

**Implementation:**

`daemon/src/protocol.rs` — Define all types matching the design doc's IPC protocol:
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Request {
    pub id: String,
    pub method: Method,
    pub params: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Method {
    InstanceStart,
    InstanceStop,
    InstanceRestart,
    DownloadStart,
    DownloadCancel,
    ConfigGet,
    ConfigSet,
    MonitorSubscribe,
    MonitorUnsubscribe,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Response {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<Error>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Error {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum Event {
    InstanceLog {
        instance_id: String,
        line: String,
        timestamp: u64,
    },
    InstanceStateChange {
        instance_id: String,
        state: InstanceState,
    },
    InstanceStats {
        instance_id: String,
        cpu_percent: f64,
        memory_mb: u64,
        uptime_secs: u64,
    },
    DownloadProgress {
        task_id: String,
        downloaded: u64,
        total: u64,
        percent: f64,
    },
    DaemonStatus {
        version: String,
        uptime_secs: u64,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InstanceState {
    Starting,
    Running,
    Stopping,
    Stopped,
    Crashed,
}
```

**Step: Run tests → confirm pass**
```bash
cd daemon && cargo test protocol
```

**Commit:**
```bash
git add daemon/ && git commit -m "feat(daemon): protocol types with serde serialization"
```

---

### Task B2: IPC Server (Unix Socket)

**Files:**
- Modify: `daemon/src/ipc.rs`
- Create: `daemon/tests/ipc_tests.rs`

**Tests:**
```rust
use tokio::net::UnixStream;
use tokio::io::{AsyncWriteExt, BufReader, AsyncBufReadExt};
use std::time::Duration;

#[tokio::test]
async fn test_ipc_server_accepts_connection() {
    // Start daemon IPC server on temp socket
    // Connect with UnixStream
    // Verify connection accepted
}

#[tokio::test]
async fn test_ipc_send_receive_json_line() {
    // Write a JSON line, read response
    // Verify round-trip
}

#[tokio::test]
async fn test_ipc_multiple_clients() {
    // Connect two clients, verify both work
}

#[tokio::test]
async fn test_ipc_invalid_json_returns_error() {
    // Send malformed JSON, expect error response
}
```

**Implementation:**

`daemon/src/ipc.rs` — Unix socket listener that:
1. Binds to `~/.neocraft/daemon.sock` (expand tilde, create parent dirs)
2. Accepts multiple concurrent clients
3. Reads JSON Lines from each client
4. Dispatches to method handlers (via channel/trait)
5. Writes JSON Lines responses and events back
6. On shutdown signal, cleanly closes all connections

**Key structures:**
```rust
pub struct IpcServer {
    socket_path: PathBuf,
    listener: Option<tokio::net::UnixListener>,
    shutdown_tx: tokio::sync::broadcast::Sender<()>,
}

impl IpcServer {
    pub async fn bind(socket_path: PathBuf) -> Result<Self, IpcError> { ... }
    pub async fn run(&mut self, handler: Arc<dyn RequestHandler>) -> Result<(), IpcError> { ... }
}

#[async_trait]
pub trait RequestHandler: Send + Sync {
    async fn handle(&self, request: Request) -> Response;
    async fn subscribe_events(&self) -> tokio::sync::broadcast::Receiver<Event>;
}
```

**Step: Run tests → confirm pass**
```bash
cd daemon && cargo test ipc
```

**Commit:**
```bash
git add daemon/ && git commit -m "feat(daemon): IPC server with Unix socket + JSON Lines"
```

---

### Task B3: Instance Manager — Data Model & Create

**Files:**
- Modify: `daemon/src/instance.rs`
- Modify: `daemon/src/files.rs`
- Create: `daemon/tests/instance_tests.rs`

**Tests:**
```rust
#[tokio::test]
async fn test_create_instance_directory() {
    // Create temp dir, call instance::create()
    // Verify directory structure: workDir/, eula.txt, server.properties template
    // Verify instance.json is written with correct fields
}

#[tokio::test]
async fn test_create_instance_duplicate_id_rejected() {
    // Create instance with same ID twice, expect error
}

#[tokio::test]
async fn test_instance_state_starts_as_stopped() {
    let inst = instance::create(...).await.unwrap();
    assert_eq!(inst.state, InstanceState::Stopped);
}
```

**Implementation:**

`daemon/src/instance.rs` — Instance struct and manager:
```rust
pub struct InstanceManager {
    data_dir: PathBuf,
    instances: HashMap<String, Instance>,
    event_tx: tokio::sync::broadcast::Sender<Event>,
}

impl InstanceManager {
    pub fn new(data_dir: PathBuf, event_tx: broadcast::Sender<Event>) -> Self;
    pub async fn create(&mut self, name: String, server_type: ServerType, version: String, port: u16) -> Result<Instance>;
    pub async fn delete(&mut self, id: &str) -> Result<()>;
    pub fn get(&self, id: &str) -> Option<&Instance>;
    pub fn list(&self) -> Vec<&Instance>;
    pub async fn start(&mut self, id: &str) -> Result<()>;
    pub async fn stop(&mut self, id: &str) -> Result<()>;
    pub async fn restart(&mut self, id: &str) -> Result<()>;
}
```

`daemon/src/files.rs` — File system operations:
```rust
pub fn ensure_data_dir(path: &Path) -> Result<()>;
pub fn write_properties_template(path: &Path, port: u16) -> Result<()>;
pub fn write_eula(path: &Path) -> Result<()>;
pub fn read_properties(path: &Path) -> Result<HashMap<String, String>>;
pub fn write_properties(path: &Path, props: &HashMap<String, String>) -> Result<()>;
pub fn save_instance_state(path: &Path, instance: &Instance) -> Result<()>;
pub fn load_instance_state(path: &Path) -> Result<Instance>;
```

**Step: Run tests → confirm pass**
```bash
cd daemon && cargo test instance
```

**Commit:**
```bash
git add daemon/ && git commit -m "feat(daemon): instance manager data model and create"
```

---

### Task B4: Instance Manager — Start / Stop / Restart

**Files:**
- Modify: `daemon/src/instance.rs`
- Add tests to: `daemon/tests/instance_tests.rs`

**Tests:**
```rust
#[tokio::test]
async fn test_start_mock_java_process() {
    // Create instance, start with mock java (shell script that echoes + sleeps)
    // Verify process is spawned, PID recorded
    // Verify instance state transitions to Running
    // Verify state_change event emitted
}

#[tokio::test]
async fn test_stop_mock_java_process() {
    // Start mock process, then stop it
    // Verify stdout receives "stop\n"
    // Verify process exits cleanly
    // Verify state transitions to Stopped
}

#[tokio::test]
async fn test_restart_stops_then_starts() {
    // Start mock, restart, verify old process killed, new one spawned
}

#[tokio::test]
async fn test_stop_already_stopped_is_noop() {
    // Stop when not running, expect success (idempotent)
}

#[tokio::test]
async fn test_crash_detection() {
    // Start mock that exits with code 1 immediately
    // Verify state transitions to Crashed
    // Verify crash event emitted
}
```

**Implementation:** Extend `InstanceManager` with process lifecycle:
- `start()`: Build `java` command with args (`-Xmx`, `-jar`, `nogui`), spawn via `tokio::process::Command`, store `Child` handle, spawn log pipe task, spawn monitor task
- `stop()`: Write "stop\n" to stdin, wait for graceful exit (60s timeout), then kill
- `restart()`: Call `stop()` then `start()`
- Background task: await `child.wait()`, detect exit code, emit state_change event

**Step: Run tests → confirm pass**
```bash
cd daemon && cargo test instance
```

**Commit:**
```bash
git add daemon/ && git commit -m "feat(daemon): instance start/stop/restart lifecycle"
```

---

### Task B5: Log Pipeline

**Files:**
- Modify: `daemon/src/logpipe.rs`
- Create: `daemon/tests/logpipe_tests.rs`

**Tests:**
```rust
#[tokio::test]
async fn test_logpipe_captures_stdout_lines() {
    // Spawn echo "line1\nline2" process
    // Pipe stdout through logpipe
    // Verify two lines received via channel
    // Verify each line has correct instance_id and timestamp
}

#[tokio::test]
async fn test_logpipe_handles_stderr() {
    // Spawn process that writes to stderr
    // Verify stderr lines also captured
}

#[tokio::test]
async fn test_logpipe_backpressure_does_not_block_process() {
    // Slow consumer, verify process doesn't hang
}
```

**Implementation:** `daemon/src/logpipe.rs`
```rust
pub struct LogPipe {
    instance_id: String,
    event_tx: broadcast::Sender<Event>,
}

impl LogPipe {
    pub fn new(instance_id: String, event_tx: broadcast::Sender<Event>) -> Self;

    /// Pipe stdout of a child process, emitting one Event::InstanceLog per line
    pub async fn pipe_stdout(&self, stdout: ChildStdout);

    /// Pipe stderr similarly
    pub async fn pipe_stderr(&self, stderr: ChildStderr);
}
```

Uses `tokio::io::BufReader::lines()` to read line by line, emits `Event::InstanceLog` for each.

**Step: Run tests → confirm pass**
```bash
cd daemon && cargo test logpipe
```

**Commit:**
```bash
git add daemon/ && git commit -m "feat(daemon): log pipeline for stdout/stderr capture"
```

---

### Task B6: Resource Monitor

**Files:**
- Modify: `daemon/src/monitor.rs`
- Create: `daemon/tests/monitor_tests.rs`

**Tests:**
```rust
#[tokio::test]
async fn test_monitor_emits_stats_periodically() {
    // Start a mock process that runs for 3 seconds
    // Subscribe to monitor
    // Verify at least 2 stats events received (at 1s interval)
    // Verify cpu_percent and memory_mb are > 0
}

#[tokio::test]
async fn test_monitor_stops_when_cancelled() {
    // Start monitor, cancel after 1 second
    // Verify no more events after cancel
}
```

**Implementation:** `daemon/src/monitor.rs`
```rust
pub struct ResourceMonitor {
    instance_id: String,
    pid: u32,
    event_tx: broadcast::Sender<Event>,
    sys: sysinfo::System,
}

impl ResourceMonitor {
    pub fn new(instance_id: String, pid: u32, event_tx: broadcast::Sender<Event>) -> Self;

    /// Start polling CPU/memory every 1 second, emitting InstanceStats events
    pub async fn run(&mut self, mut cancel: tokio::sync::watch::Receiver<bool>);
}
```

Uses `sysinfo::System` to get process CPU% and memory. Polls at 1s intervals, emits `Event::InstanceStats`.

**Step: Run tests → confirm pass**
```bash
cd daemon && cargo test monitor
```

**Commit:**
```bash
git add daemon/ && git commit -m "feat(daemon): resource monitor for CPU/memory stats"
```

---

### Task B7: Config Manager

**Files:**
- Modify: `daemon/src/files.rs`
- Create: `daemon/tests/config_tests.rs`
- Create test fixture: `daemon/tests/fixtures/server.properties`

**Tests:**
```rust
#[test]
fn test_read_properties() {
    let props = files::read_properties(Path::new("tests/fixtures/server.properties")).unwrap();
    assert_eq!(props.get("server-port"), Some(&"25565".to_string()));
    assert_eq!(props.get("motd"), Some(&"A Minecraft Server".to_string()));
}

#[test]
fn test_write_properties_preserves_comments() {
    // Write then read back, verify key=value pairs correct
    // Verify comments (lines starting with #) are preserved
}

#[test]
fn test_parse_malformed_properties_returns_error() {
    let input = "key_without_equals\nkey2=val2";
    // Should error on the malformed line
}
```

**Implementation:** Extend `daemon/src/files.rs` with proper `java.util.Properties` format parser:
- Lines starting with `#` or `!` are comments (preserved)
- `key=value` or `key:value` format
- Unicode escapes `\uXXXX`
- Preserves comment order and blank lines when writing back
- Returns `HashMap<String, String>` for key-value pairs

**Step: Run tests → confirm pass**
```bash
cd daemon && cargo test config
```

**Commit:**
```bash
git add daemon/ && git commit -m "feat(daemon): server.properties config read/write"
```

---

### Task B8: Daemon Main — Wire Everything Together

**Files:**
- Modify: `daemon/src/main.rs`

**Tests:** Integration test that starts the full daemon and exercises its IPC interface.
```rust
// daemon/tests/integration.rs
#[tokio::test]
async fn test_full_lifecycle() {
    // 1. Start daemon on temp socket
    // 2. Connect via UnixStream
    // 3. Create instance (download.start with mock URL)
    // 4. Start instance
    // 5. Verify state_change → Running
    // 6. Verify log events arrive
    // 7. Verify stats events arrive
    // 8. Stop instance
    // 9. Verify state_change → Stopped
}
```

**Implementation:** Wire together in `main.rs`:
1. Parse CLI args
2. Initialize tracing
3. Create data dir (`~/.neocraft/`)
4. Create `InstanceManager`
5. Create `IpcServer`, passing instance manager as handler
6. Handle shutdown signal (SIGTERM/SIGINT) → graceful shutdown
7. Load existing instances from disk on startup

**Step: Run tests → confirm pass**
```bash
cd daemon && cargo test
```

**Commit:**
```bash
git add daemon/ && git commit -m "feat(daemon): wire up main binary with full IPC lifecycle"
```

---

## Phase C: Node.js Server Core

### Task C1: IPC Client

**Files:**
- Create: `server/src/services/ipc-client.ts`
- Create: `server/tests/services/ipc-client.test.ts`

**Tests:** Create a mock Unix socket server that responds to predefined requests, then test the IPC client against it.

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { IpcClient } from '../../src/services/ipc-client';
import { createMockDaemon } from '../helpers/mock-daemon';

describe('IpcClient', () => {
  let mock: Awaited<ReturnType<typeof createMockDaemon>>;
  let client: IpcClient;

  beforeAll(async () => {
    mock = await createMockDaemon();
    client = new IpcClient(mock.socketPath);
    await client.connect();
  });

  afterAll(async () => {
    await client.disconnect();
    await mock.cleanup();
  });

  it('should send request and receive response', async () => {
    const resp = await client.request('instance.list', {});
    expect(resp.result).toBeDefined();
  });

  it('should receive events via subscription', async () => {
    const events: any[] = [];
    const unsub = client.onEvent((ev) => events.push(ev));
    await client.request('monitor.subscribe', { instanceId: 'test' });
    await new Promise(r => setTimeout(r, 200));
    expect(events.length).toBeGreaterThan(0);
    unsub();
  });

  it('should timeout on no response', async () => {
    await expect(client.request('slow.method', {}, { timeout: 100 }))
      .rejects.toThrow('timeout');
  });

  it('should reconnect on disconnect', async () => {
    await mock.restart();
    // Client should automatically reconnect
    const resp = await client.request('instance.list', {});
    expect(resp.result).toBeDefined();
  });
});
```

**Implementation:** `server/src/services/ipc-client.ts`
```typescript
import { createConnection, Socket } from 'node:net';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

interface IpcRequest {
  id: string;
  method: string;
  params: Record<string, unknown>;
}

interface IpcResponse {
  id: string;
  result?: unknown;
  error?: { code: string; message: string };
}

interface IpcEvent {
  event: string;
  data: Record<string, unknown>;
}

export class IpcClient extends EventEmitter {
  private socket: Socket | null = null;
  private pending = new Map<string, { resolve: Function; reject: Function; timer: NodeJS.Timeout }>();
  private reconnectDelay = 100;
  private maxReconnectDelay = 30000;

  constructor(private socketPath: string) { super(); }

  async connect(): Promise<void> { /* Unix socket connect + JSON Lines readline */ }
  async disconnect(): Promise<void> { /* cleanup */ }
  async request(method: string, params: Record<string, unknown>, opts?: { timeout?: number }): Promise<IpcResponse> { /* send + await response */ }
  private handleLine(line: string): void { /* dispatch response or event */ }
  private reconnect(): void { /* exponential backoff */ }
}
```

**Step: Run tests → confirm pass**
```bash
cd server && npx vitest run tests/services/ipc-client.test.ts
```

**Commit:**
```bash
git add server/ && git commit -m "feat(server): IPC client for Unix socket communication"
```

---

### Task C2: Version Service

**Files:**
- Create: `server/src/services/version-service.ts`
- Create: `server/tests/services/version-service.test.ts`

**Tests:**
```typescript
describe('VersionService', () => {
  it('should fetch vanilla versions from Mojang API', async () => {
    const versions = await versionService.getVanillaVersions();
    expect(versions.length).toBeGreaterThan(0);
    expect(versions[0]).toHaveProperty('id');
    expect(versions[0]).toHaveProperty('url');
  });

  it('should fetch Paper versions from PaperMC API', async () => {
    const versions = await versionService.getPaperVersions();
    expect(versions.length).toBeGreaterThan(0);
    expect(versions[0]).toMatch(/^1\.\d+/);
  });

  it('should cache results for 5 minutes', async () => {
    const v1 = await versionService.getVanillaVersions();
    const v2 = await versionService.getVanillaVersions();
    // Second call should return cached (same array reference if using simple cache)
  });

  it('should return sorted versions (newest first)', async () => {
    const versions = await versionService.getVanillaVersions();
    // Check versions are in descending order
  });
});
```

**Implementation:** Fetches from:
- Mojang: `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json`
- PaperMC: `https://api.papermc.io/v2/projects/paper`
- In-memory cache with 5 min TTL

**Step: Run tests → confirm pass**
```bash
cd server && npx vitest run tests/services/version-service.test.ts
```

**Commit:**
```bash
git add server/ && git commit -m "feat(server): version service for Mojang/PaperMC APIs"
```

---

### Task C3: Instance Routes (CRUD)

**Files:**
- Create: `server/src/routes/instances.ts`
- Create: `server/tests/routes/instances.test.ts`

**Tests:**
```typescript
import { buildApp } from '../../src/app';
import supertest from 'supertest';

describe('POST /api/instances', () => {
  it('should create an instance and return 201', async () => {
    const app = await buildApp({ mockIpc: true });
    const res = await supertest(app.server)
      .post('/api/instances')
      .send({ name: 'My Server', type: 'paper', version: '1.21.5' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('My Server');
  });

  it('should return 400 for invalid server type', async () => {
    const app = await buildApp({ mockIpc: true });
    const res = await supertest(app.server)
      .post('/api/instances')
      .send({ name: 'Bad', type: 'invalid', version: '1.21.5' });
    expect(res.status).toBe(400);
  });

  it('should return 400 for missing required fields', async () => {
    const app = await buildApp({ mockIpc: true });
    const res = await supertest(app.server)
      .post('/api/instances')
      .send({ name: 'Incomplete' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/instances', () => {
  it('should list all instances', async () => { ... });
  it('should return empty array when no instances', async () => { ... });
});

describe('GET /api/instances/:id', () => {
  it('should return instance details', async () => { ... });
  it('should return 404 for unknown instance', async () => { ... });
});

describe('DELETE /api/instances/:id', () => {
  it('should delete instance and return 204', async () => { ... });
  it('should return 404 for unknown instance', async () => { ... });
  it('should return 409 when trying to delete running instance', async () => { ... });
});
```

**Implementation:** Fastify routes with Zod (or manual) validation, delegates to IpcClient.

**Step: Run tests → confirm pass**
```bash
cd server && npx vitest run tests/routes/instances.test.ts
```

**Commit:**
```bash
git add server/ && git commit -m "feat(server): instance CRUD routes"
```

---

### Task C4: Instance Lifecycle Routes (Start/Stop/Restart)

**Files:**
- Modify: `server/src/routes/instances.ts`
- Add tests to: `server/tests/routes/instances.test.ts`

**Tests:**
```typescript
describe('POST /api/instances/:id/start', () => {
  it('should start a stopped instance', async () => {
    // Create instance first, then start
    const res = await supertest(app.server)
      .post('/api/instances/test-id/start');
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('starting');
  });

  it('should return 409 if already running', async () => { ... });
  it('should return 404 for unknown instance', async () => { ... });
});

describe('POST /api/instances/:id/stop', () => {
  it('should stop a running instance', async () => { ... });
  it('should return 409 if already stopped', async () => { ... });
});

describe('POST /api/instances/:id/restart', () => {
  it('should restart a running instance', async () => { ... });
  it('should return 409 if not running', async () => { ... });
});
```

**Implementation:** Add start/stop/restart handlers that delegate to IPC.

**Step: Run tests → confirm pass**
```bash
cd server && npx vitest run tests/routes/instances.test.ts
```

**Commit:**
```bash
git add server/ && git commit -m "feat(server): instance start/stop/restart routes"
```

---

### Task C5: Config Routes

**Files:**
- Create: `server/src/routes/config.ts`
- Create: `server/tests/routes/config.test.ts`

**Tests:**
```typescript
describe('GET /api/instances/:id/config', () => {
  it('should return server.properties as object', async () => { ... });
  it('should return 404 for unknown instance', async () => { ... });
});

describe('PUT /api/instances/:id/config', () => {
  it('should update properties and return updated object', async () => {
    const res = await supertest(app.server)
      .put('/api/instances/test-id/config')
      .send({ 'server-port': '25566', 'motd': 'Custom MOTD' });
    expect(res.body['server-port']).toBe('25566');
    expect(res.body['motd']).toBe('Custom MOTD');
  });

  it('should return 409 when editing config of running instance', async () => {
    // Start instance first, then try to edit config
    const res = await supertest(app.server)
      .put('/api/instances/test-id/config')
      .send({ 'server-port': '25566' });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('running');
  });
});
```

**Implementation:** Config GET/PUT routes, validates properties format, prevents editing port while running.

**Step: Run tests → confirm pass**
```bash
cd server && npx vitest run tests/routes/config.test.ts
```

**Commit:**
```bash
git add server/ && git commit -m "feat(server): config get/update routes"
```

---

### Task C6: WebSocket Hub

**Files:**
- Create: `server/src/websocket/hub.ts`
- Create: `server/tests/websocket/hub.test.ts`

**Tests:**
```typescript
import WebSocket from 'ws';

describe('WebSocket Hub', () => {
  it('should accept connection and send welcome message', async () => {
    const ws = new WebSocket('ws://localhost:3001/ws');
    await new Promise<void>((resolve) => {
      ws.on('open', resolve);
    });
    // First message should be daemon status
    const msg = await waitForMessage(ws);
    expect(JSON.parse(msg)).toHaveProperty('event', 'daemon.status');
  });

  it('should forward IPC events to connected clients', async () => {
    // Connect WS, trigger an IPC event, verify it arrives at client
  });

  it('should handle client disconnect gracefully', async () => { ... });

  it('should broadcast to multiple clients', async () => {
    // Connect 3 clients, trigger event, verify all 3 receive it
  });
});
```

**Implementation:** `server/src/websocket/hub.ts`
```typescript
export class WebSocketHub {
  private clients = new Set<WebSocket>();

  addClient(ws: WebSocket): void { /* register + send current state */ }
  removeClient(ws: WebSocket): void { /* unregister */ }
  broadcast(event: IpcEvent): void { /* send to all connected clients */ }
  getConnectedCount(): number;
}
```

**Step: Run tests → confirm pass**
```bash
cd server && npx vitest run tests/websocket/hub.test.ts
```

**Commit:**
```bash
git add server/ && git commit -m "feat(server): WebSocket hub for real-time event broadcast"
```

---

### Task C7: Wire Server Together

**Files:**
- Modify: `server/src/index.ts` → refactor to `server/src/app.ts` + `server/src/index.ts`
- Create: `server/src/plugins/ipc-plugin.ts`

**Implementation:** Extract `buildApp()` function that:
1. Creates Fastify instance
2. Registers plugins (cors, websocket, static)
3. Creates IpcClient, connects to daemon
4. Creates WebSocketHub, subscribes to IPC events
5. Registers all route modules
6. Returns `{ server, ipc, wsHub }` for testability

**`server/src/index.ts`** becomes thin:
```typescript
import { buildApp } from './app.js';

const app = await buildApp();
await app.server.listen({ port: 3001, host: '127.0.0.1' });
```

**Step: Run all server tests**
```bash
cd server && npx vitest run
```
Expected: All tests pass.

**Commit:**
```bash
git add server/ && git commit -m "feat(server): wire up app with IPC + WS + routes"
```

---

## Phase D: Frontend Core

### Task D1: API Client & Types

**Files:**
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/types.ts`
- Create: `frontend/src/lib/api.test.ts`

**Implementation:** `types.ts` — Mirror the server types:
```typescript
export interface Instance {
  id: string;
  name: string;
  type: 'vanilla' | 'paper' | 'spigot' | 'fabric';
  version: string;
  port: number;
  state: 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed';
  javaArgs: string;
  createdAt: string;
}

export interface ServerVersion {
  id: string;
  type: 'vanilla' | 'paper';
  url?: string;
}
```

`api.ts` — Typed fetch wrapper:
```typescript
const BASE = 'http://localhost:3001/api';

export async function getInstances(): Promise<Instance[]> { ... }
export async function createInstance(data: CreateInstanceInput): Promise<Instance> { ... }
export async function startInstance(id: string): Promise<void> { ... }
export async function stopInstance(id: string): Promise<void> { ... }
export async function getConfig(id: string): Promise<Record<string, string>> { ... }
export async function updateConfig(id: string, props: Record<string, string>): Promise<void> { ... }
export async function getVersions(type: string): Promise<ServerVersion[]> { ... }
```

**Commit:**
```bash
git add frontend/ && git commit -m "feat(frontend): API client and TypeScript types"
```

---

### Task D2: WebSocket Hook & Zustand Store

**Files:**
- Create: `frontend/src/hooks/useWebSocket.ts`
- Create: `frontend/src/stores/instanceStore.ts`
- Create: `frontend/src/hooks/useWebSocket.test.ts`

**Implementation:**

`useWebSocket.ts`:
```typescript
export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3001/ws');
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      handleEvent(msg); // dispatch to store
    };
    wsRef.current = ws;
    return () => ws.close();
  }, []);

  return { connected, send: wsRef.current?.send.bind(wsRef.current) };
}
```

`instanceStore.ts` (Zustand):
```typescript
interface InstanceStore {
  instances: Instance[];
  selectedId: string | null;
  logs: Record<string, LogEntry[]>;
  stats: Record<string, InstanceStats>;
  setInstances: (instances: Instance[]) => void;
  updateInstance: (instance: Instance) => void;
  appendLog: (instanceId: string, entry: LogEntry) => void;
  updateStats: (instanceId: string, stats: InstanceStats) => void;
}
```

**Commit:**
```bash
git add frontend/ && git commit -m "feat(frontend): WebSocket hook and Zustand store"
```

---

### Task D3: Dashboard Page

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`
- Create: `frontend/src/components/dashboard/ServerStatusCard.tsx`
- Create: `frontend/src/components/dashboard/ResourceChart.tsx`

**Implementation:** Dashboard shows:
- Server status card (name, state badge, uptime, player count placeholder)
- CPU/Memory charts (simple bar or sparkline)
- Quick actions: Start/Stop/Restart buttons
- Empty state when no instance exists ("Create your first server")

**Commit:**
```bash
git add frontend/ && git commit -m "feat(frontend): dashboard page with status and resource charts"
```

---

### Task D4: Setup/Install Page

**Files:**
- Create: `frontend/src/pages/Setup.tsx`
- Create: `frontend/src/components/setup/VersionPicker.tsx`
- Create: `frontend/src/components/setup/InstallProgress.tsx`

**Implementation:** Multi-step wizard:
1. Select server type (Vanilla/Paper/Spigot/Fabric) — card grid with descriptions
2. Select version — dropdown or searchable list, fetched from API
3. Name your server + set port
4. Review & install — shows download progress
5. Success → navigate to Dashboard

**Commit:**
```bash
git add frontend/ && git commit -m "feat(frontend): setup wizard for server installation"
```

---

### Task D5: Console Page

**Files:**
- Create: `frontend/src/pages/Console.tsx`
- Create: `frontend/src/components/console/LogViewer.tsx`
- Create: `frontend/src/components/console/CommandInput.tsx`

**Implementation:**
- `LogViewer`: Virtualized log display (auto-scroll to bottom, monospace font, ANSI color support, search/filter)
- `CommandInput`: Text input + Send button, sends command to MC server stdin (future Rcon)
- Real-time log update from WebSocket events

**Commit:**
```bash
git add frontend/ && git commit -m "feat(frontend): console page with real-time log viewer"
```

---

### Task D6: Config Page

**Files:**
- Create: `frontend/src/pages/Config.tsx`
- Create: `frontend/src/components/config/PropertiesEditor.tsx`

**Implementation:**
- Table/form view of all `server.properties` entries
- Each row: property name | current value | edit input
- Save button → PUT `/api/instances/:id/config`
- Show warning if editing config of running server (restart required)
- Group common properties at top, advanced below fold

**Commit:**
```bash
git add frontend/ && git commit -m "feat(frontend): config editor for server.properties"
```

---

### Task D7: App Shell & Navigation

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/layout/AppShell.tsx`
- Create: `frontend/src/components/layout/Sidebar.tsx`

**Implementation:**
- Sidebar navigation: Dashboard, Console, Config, Settings
- Instance selector (dropdown for future multi-instance)
- Connection status indicator (daemon online/offline)
- Dark theme by default (Minecraft aesthetic)

**Commit:**
```bash
git add frontend/ && git commit -m "feat(frontend): app shell with sidebar navigation"
```

---

### Task D8: Error & Loading States

**Files:**
- Modify: all pages and components as needed
- Create: `frontend/src/components/ui/ErrorBanner.tsx`
- Create: `frontend/src/components/ui/LoadingSkeleton.tsx`

**Implementation:**
- Wrap each page in error boundary
- Loading skeletons for data fetches
- Error banners with retry buttons
- Toast notifications for mutations (sonner or similar)
- Empty state components for each page

**Commit:**
```bash
git add frontend/ && git commit -m "feat(frontend): error boundaries, loading skeletons, toast notifications"
```

---

## Phase E: Integration & Polish

### Task E1: End-to-End Test (Playwright)

**Files:**
- Create: `e2e/install-and-start.spec.ts`
- Create: `e2e/fixtures/`

**Test:**
```typescript
test('full install → start → console → stop flow', async ({ page }) => {
  // 1. Open app, see empty dashboard
  await page.goto('http://localhost:5173');
  await expect(page.getByText('Create your first server')).toBeVisible();

  // 2. Navigate to setup
  await page.getByRole('button', { name: 'Add Server' }).click();

  // 3. Select Paper, pick version, name it
  await page.getByText('Paper').click();
  await page.getByRole('combobox').click();
  await page.getByText('1.21.5').click();
  await page.getByLabel('Server Name').fill('E2E Test Server');
  await page.getByRole('button', { name: 'Install' }).click();

  // 4. Wait for install to complete (mock or real download)
  await expect(page.getByText('Installation complete')).toBeVisible({ timeout: 60000 });

  // 5. Navigate to dashboard, start server
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText('Running')).toBeVisible();

  // 6. Check console for log output
  await page.getByText('Console').click();
  await expect(page.getByText('[Server] Done')).toBeVisible({ timeout: 30000 });

  // 7. Stop server
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText('Stopped')).toBeVisible();
});
```

**Step: Run E2E test**
```bash
npx playwright test
```

**Commit:**
```bash
git add e2e/ && git commit -m "test(e2e): full install-to-stop flow with Playwright"
```

---

### Task E2: Daemon Lifecycle Script

**Files:**
- Create: `scripts/start-daemon.sh`
- Create: `scripts/dev.sh`

**`scripts/dev.sh`** — Starts daemon → server → frontend in correct order with proper cleanup on SIGINT.

**Commit:**
```bash
git add scripts/ && git commit -m "feat: dev startup script with proper process lifecycle"
```

---

### Task E3: README & Documentation

**Files:**
- Create: `README.md`

**Content:** Quick start guide, prerequisites (Node 22, Rust, Java 21+), architecture overview, development setup.

**Commit:**
```bash
git add README.md && git commit -m "docs: README with quick start and architecture"
```

---

### Task E4: Final Polish & Edge Cases

- Handle Java not installed → show setup guide in UI
- Handle port already in use → suggest alternative
- Handle daemon offline → show reconnecting indicator
- Handle very long log output → virtual scrolling works
- Test with actual PaperMC server jar

**Final test suite run:**
```bash
npm test          # all unit + integration tests
npm run build:daemon  # release build
```

**Commit:**
```bash
git add -A && git commit -m "chore: final polish and edge case handling"
```

---

## Implementation Order Summary

```
A1 → A2,A3,A4 (parallel)
A2 → B1 → B2 → B3 → B4 → B5 → B6 → B7 → B8
A3 → C1 → C2 → C3 → C4 → C5 → C6 → C7
A4 → D1 → D2 → D3 → D4 → D5 → D6 → D7 → D8
B8 + C7 + D8 → E1 → E2 → E3 → E4
```

B-series and C-series can start in parallel after A2/A3 respectively. D-series follows C-series.
