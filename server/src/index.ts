import { buildApp } from './app.js';
import { loadListenConfig } from './config.js';
import { getPanelSettings } from './services/panel-settings.js';

async function main() {
  const { server } = await buildApp();
  const listenConfig = loadListenConfig();
  const panelSettings = getPanelSettings();

  // Panel settings override defaults (saved from UI)
  const host = process.env.HOST || panelSettings.host || listenConfig.host;
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : panelSettings.port || listenConfig.port;

  await server.listen({ port, host });
  server.log.info(`NeoCraft API server listening on http://${host}:${port}`);
  server.log.info(`WebSocket endpoint: ws://${host}:${port}/ws`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
