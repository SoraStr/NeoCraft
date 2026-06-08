# NeoCraft

A cross-platform Minecraft server control panel with a beautiful web UI. Manage multiple Minecraft servers from a single dashboard — create, start, stop, monitor, and configure them all through your browser.

[简体中文](README-ZH.md)

## Features

### Server Management
- **Multi-instance support** — Run multiple Minecraft servers simultaneously, each with isolated configurations
- **One-click installation** — Download and set up Vanilla, Paper, Spigot, Fabric, Forge, or custom servers
- **Process lifecycle** — Start, stop, and restart servers from the web panel
- **Import existing servers** — Import an existing server directory with a single click
- **Download caching** — JAR files are cached and reused across instances to save bandwidth

### Real-time Monitoring
- **Live console** — Watch server logs stream in real time, with command input support
- **Resource monitoring** — Track CPU and memory usage per instance
- **State tracking** — See server states at a glance (running, starting, stopping, crashed, stopped)

### Configuration
- **Config editor** — Edit `server.properties` with a clean form UI, including an MOTD generator
- **File manager** — Browse, read, edit, and delete server files through the web interface
- **Java args editor** — Customize JVM arguments per instance
- **Custom Java path** — Specify which Java binary to use for each server

### Server Administration
- **SMP (Server Management Protocol)** — Full management for Minecraft 1.21.9+ servers:
  - Overview dashboard, Player management (kick, ban, op), Chat monitoring and sending
  - Allowlist (whitelist) management, Ban/IP-ban management, Operator management
  - Gamerules editor, Server settings
- **RCON** — Remote console for older Minecraft versions with quick-action commands
- **Mod management** — Scan and view installed mods for Fabric/Forge servers

### User Experience
- **Multiple themes** — Light, Dark, Minecraft Classic, and Minecraft Modern themes
- **Internationalization** — English, 简体中文 (zh-CN), and 日本語 (ja) translations
- **Command history** — Console command history persisted across sessions
- **Responsive design** — Works on desktop and tablet screens

### Security
- **Token-based authentication** — Secure daemon-to-server communication
- **API authentication** — Optional Bearer token auth for the REST API
- **Rate limiting** — Built-in request rate limiter
- **TLS support** — Encrypted SMP connections

## Architecture

```
┌─────────────────┐     HTTP/WS      ┌──────────────────┐     Unix Socket /      ┌───────────────────┐
│   Browser (React)│ ←──────────────→ │ Node.js API      │ ←───────────────────→ │ Rust Daemon (tokio)│
│                  │                 │ (Fastify)         │    Named Pipe (Win)    │                   │
│  • Dashboard     │                 │                   │                        │  • Process mgmt    │
│  • Console       │                 │ • REST API        │  JSON-Lines Protocol   │  • Log capture     │
│  • Config        │                 │ • WebSocket Hub   │                        │  • Resource monitor│
│  • Management    │                 │ • Static Serving  │                        │  • Download cache  │
│  • Setup         │                 │ • Version Service │                        │  • SMP/RCON proxy  │
└─────────────────┘                 └──────────────────┘                        └───────────────────┘
```

The frontend communicates with the Node.js API server via REST and WebSocket. The API server proxies requests to the Rust daemon over a Unix socket (macOS/Linux) or named pipe (Windows) using a JSON-Lines protocol. The daemon manages Minecraft server processes directly, capturing their output and monitoring resource usage.

## Prerequisites

- **macOS**, **Linux**, or **Windows**
- **Node.js** ≥ 22
- **Rust** (install via [rustup](https://rustup.rs))
- **Java** ≥ 21 (for running Minecraft servers)

## Quick Start

```bash
# Clone and enter the project
git clone <repo-url> && cd NeoCraft

# Install dependencies
npm install
cd server && npm install && cd ..
cd frontend && npm install && cd ..

# Start all components in dev mode
npm run dev
```

Then open **http://localhost:1145** in your browser.

## Production Build

```bash
# Build all components
npm run build

# Start the production server
node build/start.mjs
```

The build output includes:
- Compiled frontend assets (static files)
- Compiled Node.js server (JavaScript)
- Production server dependencies
- Rust daemon binary

## Manual Start (3 terminals)

**Terminal 1 — Daemon:**
```bash
cd daemon && cargo run
```

**Terminal 2 — API Server:**
```bash
cd server && npm run dev
```

**Terminal 3 — Frontend:**
```bash
cd frontend && npm run dev
```

## Project Structure

```
NeoCraft/
├── daemon/                    # Rust daemon — Minecraft process management
│   ├── src/
│   │   ├── main.rs            # Entry point, CLI argument parsing
│   │   ├── lib.rs             # Module declarations
│   │   ├── handler.rs         # IPC request dispatcher
│   │   ├── ipc.rs             # JSON-Lines IPC server with auth
│   │   ├── transport.rs       # Unix socket / Windows named pipe abstraction
│   │   ├── instance.rs        # Server instance lifecycle management
│   │   ├── protocol.rs        # Request/Response/Event message types
│   │   ├── monitor.rs         # CPU & memory resource monitoring
│   │   ├── logpipe.rs         # Stdout/stderr capture and streaming
│   │   ├── downloader.rs      # JAR downloader with progress and caching
│   │   ├── detect.rs          # Server type auto-detection
│   │   ├── files.rs           # Server configuration file read/write
│   │   ├── instance_files.rs  # Safe file operations for instance directories
│   │   ├── java_args.rs       # JVM argument builder
│   │   ├── management.rs      # SMP/RCON provisioning and configuration
│   │   ├── paths.rs           # Path resolution utilities
│   │   ├── auth.rs            # Token generation and validation
│   │   └── util.rs            # Shared utility functions
│   └── tests/                 # Rust integration and unit tests
├── server/                    # Node.js API server (Fastify)
│   ├── src/
│   │   ├── app.ts             # App assembly — plugins, hooks, routes
│   │   ├── index.ts           # Entry point
│   │   ├── config.ts          # Runtime configuration and path resolution
│   │   ├── routes/
│   │   │   ├── config.ts      # Server configuration CRUD endpoints
│   │   │   ├── instances.ts   # Instance lifecycle + file management endpoints
│   │   │   └── versions.ts    # Minecraft version listing endpoints
│   │   ├── services/
│   │   │   ├── ipc-client.ts  # Unix socket / named pipe client for daemon communication
│   │   │   ├── daemon-runtime.ts  # Daemon lifecycle management (auto-start/stop)
│   │   │   ├── version-service.ts # Minecraft version metadata fetching
│   │   │   ├── rcon-client.ts     # RCON protocol client
│   │   │   └── mod-service.ts     # Mod scanning and parsing service
│   │   └── websocket/
│   │       └── hub.ts         # WebSocket client hub for real-time events
│   └── tests/
├── frontend/                  # React SPA (Vite + Tailwind CSS)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx  # Instance overview — list, start/stop, resource stats
│   │   │   ├── Setup.tsx      # New server creation wizard
│   │   │   ├── Console.tsx    # Real-time log viewer with command input
│   │   │   ├── Config.tsx     # server.properties editor with MOTD generator
│   │   │   └── Management.tsx # SMP/RCON server administration panel
│   │   ├── components/
│   │   │   ├── layout/        # Sidebar navigation
│   │   │   ├── management/    # SMP/RCON tabs (Overview, Players, Chat, etc.)
│   │   │   ├── config/        # MOTD generator dialog
│   │   │   └── ui/            # Shared UI components (EmptyState, ErrorBanner, etc.)
│   │   ├── hooks/             # useWebSocket, useSmpConnection
│   │   ├── stores/            # Zustand state management (instanceStore)
│   │   ├── contexts/          # ThemeContext (light/dark/mc-classic/mc-modern)
│   │   ├── lib/               # API client, SMP client, types, utilities
│   │   └── i18n/              # Translation files (en, zh-CN, ja)
│   └── ...
├── scripts/                   # Dev, build, and utility scripts
├── docs/                      # Design documents
├── package.json               # Monorepo root — workspace scripts
└── .gitignore
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check (daemon connection status) |
| GET | `/api/instances` | List all server instances |
| POST | `/api/instances` | Create a new server instance |
| GET | `/api/instances/:id` | Get instance details |
| DELETE | `/api/instances/:id` | Delete an instance |
| POST | `/api/instances/:id/start` | Start the server |
| POST | `/api/instances/:id/stop` | Stop the server |
| POST | `/api/instances/:id/restart` | Restart the server |
| POST | `/api/instances/:id/command` | Send a console command |
| POST | `/api/instances/:id/import` | Import an existing server directory |
| GET | `/api/instances/:id/config` | Get `server.properties` |
| PUT | `/api/instances/:id/config` | Update `server.properties` |
| GET | `/api/instances/:id/files` | List files in instance directory |
| GET | `/api/instances/:id/files/read` | Read a file's contents |
| PUT | `/api/instances/:id/files/write` | Write to a file |
| DELETE | `/api/instances/:id/files` | Delete a file |
| PUT | `/api/instances/:id/files/rename` | Rename a file |
| POST | `/api/instances/:id/rcon` | Send an RCON command |
| POST | `/api/instances/:id/mods/scan` | Scan for installed mods |
| GET | `/api/instances/:id/mods` | List installed mods |
| GET | `/api/versions` | List available Minecraft versions |
| GET | `/api/versions/fabric` | List available Fabric loader versions |
| WS | `/ws` | Real-time events (logs, stats, state changes, download progress) |

## Daemon IPC Protocol

The daemon communicates via a JSON-Lines protocol over Unix sockets (macOS/Linux) or named pipes (Windows). Each message is a single JSON object terminated by a newline.

### Supported Methods

| Method | Description |
|--------|-------------|
| `instance.list` | List all instances |
| `instance.create` | Create a new instance |
| `instance.get` | Get instance details |
| `instance.delete` | Delete an instance |
| `instance.start` | Start an instance |
| `instance.stop` | Stop an instance |
| `instance.restart` | Restart an instance |
| `instance.command` | Send a console command |
| `instance.import` | Import an existing server |
| `download.start` | Start downloading a server JAR |
| `download.cancel` | Cancel an active download |
| `config.get` | Read `server.properties` |
| `config.set` | Write `server.properties` |
| `monitor.subscribe` | Subscribe to resource stats |
| `monitor.unsubscribe` | Unsubscribe from resource stats |
| `files.list` | List directory contents |
| `files.read` | Read file contents |
| `files.write` | Write to a file |
| `files.delete` | Delete a file |
| `files.rename` | Rename a file |

### Events (Push)

| Event | Description |
|-------|-------------|
| `instance.log` | Server log line |
| `instance.state_change` | Server state transition |
| `download.progress` | JAR download progress |
| `instance.stats` | CPU/memory/uptime stats |

## Testing

```bash
# Run all tests
npm test

# Per-component
npm run test:daemon    # Rust daemon (cargo test)
npm run test:server    # Node.js API server (vitest)
npm run test:frontend  # Frontend (vitest)
```

## Configuration

### Daemon CLI Options

```
neocraft-daemon [OPTIONS]
  --socket <PATH>     IPC socket path / pipe name (default: platform-specific)
  --data-dir <PATH>   Data directory for instances and configs (default: ~/.neocraft)
```

### Server Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server listen port | `1145` |
| `HOST` | API server listen host | `127.0.0.1` |
| `IPC_SOCKET_PATH` | Path to daemon IPC socket | Platform default |
| `FRONTEND_DIST` | Path to frontend static files | `../frontend/dist` |
| `AUTO_START_DAEMON` | Auto-start daemon on server boot | `true` |
| `AUTH_TOKEN` | API Bearer token (disabled if empty) | (empty) |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | `http://localhost:5173` |

## Supported Server Types

| Type | Description | Auto-download |
|------|-------------|:---:|
| **Vanilla** | Official Mojang Minecraft server | ✓ |
| **Paper** | High-performance fork with plugin support | ✓ |
| **Spigot** | Popular Bukkit-based server | ✓ |
| **Fabric** | Lightweight modding platform | ✓ |
| **Forge** | Classic modding platform | ✓ |
| **Custom** | Any server JAR (manual URL required) | ✓ |

## License

MIT
