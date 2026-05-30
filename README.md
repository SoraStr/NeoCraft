# NeoCraft

A macOS-native Minecraft server control panel with a beautiful web UI. Built with React + Node.js + Rust.

![NeoCraft](docs/neocraft-preview.png)

## Features

- **One-click server installation** — Download and set up Paper, Vanilla, Spigot, or Fabric servers
- **Real-time console** — Watch server logs stream live in your browser
- **Resource monitoring** — Track CPU and memory usage in real time
- **Config editor** — Edit `server.properties` with a clean form UI
- **Process lifecycle** — Start, stop, and restart your server from the web panel
- **Dark theme** — Easy on the eyes, looks great on any display

## Architecture

```
Browser (React) ←→ Node.js API (Fastify) ←→ Rust Daemon (tokio)
     ↕ WebSocket         ↕ REST/WS              ↕ Unix Socket IPC
  Real-time logs      Business logic        MC process management
```

## Prerequisites

- **macOS** (primary target)
- **Node.js** ≥ 22
- **Rust** (install via [rustup](https://rustup.rs))
- **Java** ≥ 21 (for running Minecraft servers)

## Quick Start

```bash
# Clone and enter
git clone <repo-url> && cd NeoCraft

# Install dependencies
npm install
cd server && npm install && cd ..
cd frontend && npm install && cd ..

# Build the daemon
cd daemon && cargo build --release && cd ..

# Start everything
./scripts/dev.sh
```

Then open **http://localhost:5173** in your browser.

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
├── daemon/              # Rust daemon (process management, IPC)
│   ├── src/
│   │   ├── main.rs      # Entry point, CLI args
│   │   ├── ipc.rs       # Unix socket server
│   │   ├── instance.rs  # MC process lifecycle
│   │   ├── protocol.rs  # IPC message types
│   │   ├── monitor.rs   # Resource monitoring
│   │   ├── logpipe.rs   # Stdout/stderr capture
│   │   └── files.rs     # Config read/write
│   └── tests/
├── server/              # Node.js API server (Fastify)
│   ├── src/
│   │   ├── app.ts       # App assembly
│   │   ├── routes/      # REST API routes
│   │   ├── services/    # IPC client, version service
│   │   └── websocket/   # WebSocket hub
│   └── tests/
├── frontend/            # React web UI (Vite + Tailwind)
│   ├── src/
│   │   ├── pages/       # Dashboard, Console, Config, Setup
│   │   ├── components/  # Sidebar, UI components
│   │   ├── hooks/       # useWebSocket
│   │   ├── stores/      # Zustand state
│   │   └── lib/         # API client, types
│   └── ...
├── scripts/             # Dev scripts
└── docs/                # Design documents
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/instances` | List all servers |
| POST | `/api/instances` | Create a new server |
| GET | `/api/instances/:id` | Get server details |
| DELETE | `/api/instances/:id` | Delete a server |
| POST | `/api/instances/:id/start` | Start server |
| POST | `/api/instances/:id/stop` | Stop server |
| POST | `/api/instances/:id/restart` | Restart server |
| GET | `/api/instances/:id/config` | Get server.properties |
| PUT | `/api/instances/:id/config` | Update server.properties |
| GET | `/api/versions` | List available MC versions |
| WS | `/ws` | Real-time events (logs, stats, state) |

## Testing

```bash
# All tests
npm test

# Per-component
cd daemon && cargo test          # Rust daemon (44 tests)
cd server && npm test            # Node.js API  (31 tests)
cd frontend && npx vitest run    # React UI
```

## License

MIT
