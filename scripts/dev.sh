#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== NeoCraft Development Server ==="
echo ""

# Cleanup on exit
cleanup() {
  echo ""
  echo "Shutting down..."
  kill $DAEMON_PID 2>/dev/null || true
  kill $SERVER_PID 2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  wait 2>/dev/null
  echo "All processes stopped."
}
trap cleanup EXIT INT TERM

# Build daemon
echo "[1/3] Building Rust daemon..."
cd "$PROJECT_DIR/daemon"
cargo build --release 2>&1 | tail -1
DAEMON_BIN="$PROJECT_DIR/daemon/target/release/neocraft-daemon"

# Start daemon
echo "[2/3] Starting daemon..."
DATA_DIR="$HOME/.neocraft-dev"
mkdir -p "$DATA_DIR"
"$DAEMON_BIN" --socket "$DATA_DIR/daemon.sock" --data-dir "$DATA_DIR" &
DAEMON_PID=$!
sleep 1

# Start Node.js server
echo "[3/3] Starting API server + frontend dev server..."
cd "$PROJECT_DIR/server"
npm run dev &
SERVER_PID=$!

cd "$PROJECT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "=== Ready! ==="
echo "Frontend:  http://localhost:5173"
echo "API:       http://localhost:3001"
echo "Daemon:    $DATA_DIR/daemon.sock"
echo ""
echo "Press Ctrl+C to stop all services."

# Wait for any to exit
wait
