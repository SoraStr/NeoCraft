import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', () => {
            // Suppress — the frontend handles server-down gracefully
          });
        },
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', () => {
            // Suppress noisy WS proxy errors when server isn't running
          });
        },
      },
    },
  },
})
