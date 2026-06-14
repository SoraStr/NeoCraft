import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface PanelSettings {
  host: string;
  port: number;
  allowedHosts: string[];
}

const DEFAULT_SETTINGS: PanelSettings = {
  host: '127.0.0.1',
  port: 3001,
  allowedHosts: [],
};

let settingsPath: string | null = null;

/** Load panel settings from disk, merging with defaults. */
export function loadPanelSettings(dataDir: string): PanelSettings {
  settingsPath = join(dataDir, 'panel-config.json');
  try {
    if (existsSync(settingsPath)) {
      const raw = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      return {
        host: raw.host || DEFAULT_SETTINGS.host,
        port: typeof raw.port === 'number' ? raw.port : DEFAULT_SETTINGS.port,
        allowedHosts: Array.isArray(raw.allowedHosts) ? raw.allowedHosts : [],
      };
    }
  } catch {
    // Corrupted or missing — use defaults
  }
  return { ...DEFAULT_SETTINGS };
}

/** Save panel settings to disk. */
export function savePanelSettings(settings: PanelSettings): void {
  if (!settingsPath) throw new Error('Panel settings not initialized.');
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

/** Get the current panel settings (for API). */
export function getPanelSettings(): PanelSettings {
  // Return from memory — reload from disk if needed
  return currentSettings;
}

let currentSettings: PanelSettings = { ...DEFAULT_SETTINGS };

export function initPanelSettings(settings: PanelSettings): void {
  currentSettings = { ...settings };
}

export function updatePanelSettings(partial: Partial<PanelSettings>): PanelSettings {
  const updated = { ...currentSettings, ...partial };
  currentSettings = updated;
  savePanelSettings(updated);
  return updated;
}
