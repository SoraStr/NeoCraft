import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Plugin to suppress noisy WebSocket proxy errors (EPIPE/ECONNRESET)
// when the backend server restarts or is temporarily unavailable.
function suppressWsProxyErrors() {
  return {
    name: 'suppress-ws-proxy-errors',
    configureServer(server: any) {
      server.httpServer?.on('upgrade', (_req: any, socket: any, _head: any) => {
        socket.on('error', (err: any) => {
          if (err.code === 'EPIPE' || err.code === 'ECONNRESET') {
            // Silently ignore — frontend WebSocket hook auto-reconnects
            return;
          }
          console.warn('[vite] ws upgrade error:', err.message);
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), suppressWsProxyErrors()],
  server: {
    port: 1145,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', () => {});
        },
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', () => {});
        },
      },
    },
  },
})
