# NeoCraft — Minecraft Server Control Panel Design

> **Date:** 2026-05-30  
> **Status:** Approved  
> **Tech Stack:** React + TypeScript (Frontend), Node.js + Fastify (API), Rust (Daemon)

## Overview

A macOS-native web-based control panel for managing Minecraft Java Edition servers. Provides one-click server installation, lifecycle management (start/stop/restart), real-time console log streaming, and system resource monitoring.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser                          │
│              (React + TypeScript)                   │
│         http://localhost:3000                       │
└──────────┬──────────────────────┬───────────────────┘
           │ HTTP/REST            │ WebSocket
           ▼                      ▼
┌─────────────────────────────────────────────────────┐
│              Node.js API Server                     │
│  - Fastify HTTP server                              │
│  - Serve React static files                         │
│  - WebSocket server (log + monitor push)            │
│  - Business logic (version list, config validation) │
│  - IPC client → Rust daemon                         │
└──────────────────────┬──────────────────────────────┘
                       │ Unix Domain Socket (JSON Lines)
                       ▼
┌─────────────────────────────────────────────────────┐
│              Rust Daemon (守护进程)                   │
│  - MC subprocess lifecycle management                │
│  - Server jar downloader                             │
│  - System resource monitoring (CPU/RAM/Disk)         │
│  - File system operations (config, world files)      │
│  - Stdout/stderr pipeline → log stream              │
└─────────────────────────────────────────────────────┘
```

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| MC Edition | Java Edition | Largest ecosystem, Paper/Spigot/Fabric support |
| Client | Web UI (React) | No install required, accessible from any device |
| Scope | Local macOS only | Simplifies auth, networking, security |
| Rust/Node.js | Rust daemon + Node.js API | Rust for system ops, Node.js for web layer |
| IPC | Unix Domain Socket + JSON Lines | Zero network overhead, bi-directional streaming |
| Instances | Single instance MVP, multi-instance data model | Future-proof without complexity tax |
| Features | MVP: install, start/stop, logs, monitor, config | Core workflow covered, extensible |

## Tech Stack Details

### Frontend
- React 19 + TypeScript 5
- Tailwind CSS 4 + shadcn/ui (dashboard components)
- React Router v7 (client-side routing)
- Zustand (state management)
- Monaco Editor (config file editing)

### Node.js API Server
- Fastify 5 (HTTP framework, faster than Express)
- `@fastify/websocket` (WebSocket support)
- `@fastify/static` (serve React build)
- `undici` (HTTP client for external APIs)
- `pino` (structured logging)

### Rust Daemon
- `tokio` (async runtime)
- `tokio-stream` (stream processing)
- `serde` / `serde_json` (JSON serialization)
- `clap` (CLI arg parsing, for daemon binary)
- `reqwest` (HTTP client for jar downloads)
- `sysinfo` (system resource monitoring)
- `sha2` (SHA hash verification)
- `zip` / `flate2` (compression for backups, future)

## Directory Structure

```
NeoCraft/
├── docs/plans/                          # Design docs & plans
├── frontend/                            # React app
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/                  # AppShell, Sidebar, Header
│   │   │   ├── dashboard/              # ServerStatusCard, ResourceChart
│   │   │   ├── console/                # ConsoleLog, CommandInput
│   │   │   ├── config/                 # ConfigEditor, PropertiesForm
│   │   │   └── setup/                  # VersionPicker, InstallWizard
│   │   ├── hooks/                      # useWebSocket, useInstance, useMetrics
│   │   ├── stores/                     # Zustand stores
│   │   ├── lib/                        # API client, type definitions
│   │   ├── pages/                      # Dashboard, Console, Config, Setup
│   │   └── App.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.ts
├── server/                              # Node.js API server
│   ├── src/
│   │   ├── routes/                     # instances, versions, config
│   │   ├── services/                   # ipc-client, version-service, config-service
│   │   ├── websocket/                  # ws-hub, connection manager
│   │   ├── plugins/                    # Fastify plugins
│   │   └── index.ts                    # Entry point
│   ├── tests/
│   │   ├── routes/
│   │   ├── services/
│   │   └── integration/
│   ├── package.json
│   └── tsconfig.json
├── daemon/                              # Rust daemon
│   ├── src/
│   │   ├── main.rs                     # Entry point, CLI args
│   │   ├── ipc.rs                      # Unix socket server, protocol
│   │   ├── instance.rs                 # Instance manager, process lifecycle
│   │   ├── downloader.rs              # Jar download with progress
│   │   ├── monitor.rs                  # Resource monitoring
│   │   ├── logpipe.rs                  # Stdout/stderr pipeline
│   │   ├── files.rs                    # Config read/write, directory setup
│   │   └── protocol.rs                 # Request/Response/Event types
│   ├── tests/
│   │   └── integration.rs
│   ├── Cargo.toml
│   └── build.rs
└── package.json                         # Root workspace scripts
```

## IPC Protocol

### Transport
Unix Domain Socket at `~/.neocraft/daemon.sock`, JSON Lines format (one JSON object per line, newline-delimited).

### Message Types

```typescript
// Request (Node.js → Rust)
{
  "id": "uuid-v4",
  "method": "instance.start" | "instance.stop" | "instance.restart" |
            "download.start" | "download.cancel" |
            "config.get" | "config.set" |
            "monitor.subscribe" | "monitor.unsubscribe",
  "params": { ... }
}

// Response (Rust → Node.js)
{
  "id": "uuid-v4",     // matches request id
  "result": { ... }     // or "error": { "code": "...", "message": "..." }
}

// Event (Rust → Node.js, unsolicited)
{
  "event": "instance.log" | "instance.state_change" |
            "instance.stats" | "download.progress" |
            "daemon.status",
  "data": { ... }
}
```

### Method Catalog

| Method | Params | Result |
|--------|--------|--------|
| `instance.start` | `{ id: string }` | `{ pid: number }` |
| `instance.stop` | `{ id: string }` | `{ exitCode: number }` |
| `instance.restart` | `{ id: string }` | `{ pid: number }` |
| `download.start` | `{ version: string, type: string, dir: string }` | `{ taskId: string }` |
| `download.cancel` | `{ taskId: string }` | `{}` |
| `config.get` | `{ instanceId: string }` | `{ properties: object }` |
| `config.set` | `{ instanceId: string, properties: object }` | `{}` |
| `monitor.subscribe` | `{ instanceId: string }` | `{}` |
| `monitor.unsubscribe` | `{ instanceId: string }` | `{}` |

### Event Catalog

| Event | Data | Trigger |
|-------|------|---------|
| `instance.log` | `{ instanceId: string, line: string, timestamp: number }` | MC process outputs a line |
| `instance.state_change` | `{ instanceId: string, state: "starting"\|"running"\|"stopping"\|"stopped"\|"crashed" }` | State transition |
| `instance.stats` | `{ instanceId: string, cpu_percent: f64, memory_mb: u64, uptime_secs: u64 }` | Every 1s while running |
| `download.progress` | `{ taskId: string, downloaded: u64, total: u64, percent: f64 }` | During download |
| `daemon.status` | `{ version: string, uptime_secs: u64 }` | On connect + periodic |

## Data Models

### Instance (stored in `~/.neocraft/instances/<id>/instance.json`)
```typescript
interface Instance {
  id: string;            // uuid
  name: string;          // display name
  type: ServerType;      // "vanilla" | "paper" | "spigot" | "fabric"
  version: string;       // e.g. "1.21.5"
  port: number;          // default 25565
  workDir: string;       // ~/.neocraft/instances/<id>/
  state: InstanceState;  // "stopped" | "starting" | "running" | "stopping" | "crashed"
  javaArgs: string;      // -Xmx2G -Xms1G
  createdAt: string;     // ISO 8601
}
```

### Daemon State (persisted to `~/.neocraft/state.json`)
```typescript
interface DaemonState {
  version: string;
  instances: string[];   // list of instance IDs
  socket: string;        // path to unix socket
}
```

## Error Handling

| Error Type | Examples | Handler |
|------------|----------|---------|
| User Error | Port occupied, Java not installed | Node.js pre-validation + friendly UI message |
| System Error | Disk full, permission denied | Rust detection → structured error → Node.js translation |
| MC Internal | Plugin crash, OOM | Rust exit code detection → log tail → crash summary in UI |
| IPC Disconnect | Daemon process dies | Exponential backoff reconnection, UI shows "Daemon Offline" |
| Daemon Crash | Rust panic | Node.js auto-restarts daemon, recovers state from disk |

### Graceful Shutdown
1. Node.js receives SIGTERM
2. Notify Rust daemon via IPC
3. Rust sends `stop` command to MC process via stdin
4. Wait up to 60s for clean shutdown
5. Timeout → SIGKILL MC process
6. Rust daemon exits
7. Node.js exits

## REST API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/instances` | List all instances |
| `POST` | `/api/instances` | Create new instance (triggers download) |
| `GET` | `/api/instances/:id` | Get instance details |
| `DELETE` | `/api/instances/:id` | Delete instance |
| `POST` | `/api/instances/:id/start` | Start server |
| `POST` | `/api/instances/:id/stop` | Stop server |
| `POST` | `/api/instances/:id/restart` | Restart server |
| `GET` | `/api/instances/:id/config` | Get server.properties |
| `PUT` | `/api/instances/:id/config` | Update server.properties |
| `GET` | `/api/versions` | List available MC versions |
| `GET` | `/api/versions/:type` | List versions for server type |
| `WS` | `/ws` | WebSocket for real-time events |

## Testing Strategy

### Rust (`cargo test`)
- Unit tests per module: protocol parsing, config generation, port validation, log pipeline
- Integration tests: Instance Manager lifecycle with mock java script
- Target coverage: ≥ 80%

### Node.js (Vitest)
- Unit: Config service, version service, IPC protocol serialization
- API: Each endpoint with Supertest (valid request, error cases)
- WebSocket: Connection lifecycle, message broadcast
- IPC integration: Mock Rust daemon socket server
- Target coverage: ≥ 70%

### Frontend (Vitest + React Testing Library)
- Component tests: ConsoleLog, ResourceMonitor, ConfigEditor, SetupWizard
- E2E: Playwright for install → start → view log → stop flow
- Target coverage: components ≥ 60%, E2E covers core flows

### TDD Mandate
Every implementation task follows: write failing test → confirm fail → implement → confirm pass → commit.

## Future Considerations (Out of MVP Scope)
- Multi-instance management (data model already supports it)
- World backup/restore with compression
- Scheduled tasks (cron-style restart/backup)
- Rcon integration for remote commands
- Player management (list, kick, ban)
- Plugin/mod management UI
