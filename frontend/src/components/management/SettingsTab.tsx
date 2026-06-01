import { useEffect, useState } from 'react';
import type { SmpClient } from '../../lib/smp-client';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { ErrorBanner } from '../ui/ErrorBanner';
import { EmptyState } from '../ui/EmptyState';

interface SettingsTabProps {
  client: SmpClient;
}

interface ServerSetting {
  key: string;
  type: string;
  value: unknown;
}

interface SettingDef {
  key: string;
  label: string;
  inputType: 'toggle' | 'number' | 'dropdown' | 'text';
  options?: string[];
}

const SETTINGS: SettingDef[] = [
  { key: 'max-players', label: 'Max Players', inputType: 'number' },
  { key: 'view-distance', label: 'View Distance', inputType: 'number' },
  { key: 'simulation-distance', label: 'Simulation Distance', inputType: 'number' },
  { key: 'max-tick-time', label: 'Max Tick Time (ms)', inputType: 'number' },
  { key: 'spawn-protection', label: 'Spawn Protection', inputType: 'number' },
  { key: 'max-world-size', label: 'Max World Size', inputType: 'number' },
  { key: 'network-compression-threshold', label: 'Network Compression', inputType: 'number' },
  { key: 'entity-broadcast-range-percentage', label: 'Entity Broadcast %', inputType: 'number' },
  { key: 'op-permission-level', label: 'OP Permission Level', inputType: 'dropdown', options: ['1', '2', '3', '4'] },
  { key: 'function-permission-level', label: 'Function Permission Level', inputType: 'dropdown', options: ['1', '2', '3', '4'] },
  { key: 'gamemode', label: 'Default Gamemode', inputType: 'dropdown', options: ['survival', 'creative', 'adventure', 'spectator'] },
  { key: 'difficulty', label: 'Difficulty', inputType: 'dropdown', options: ['peaceful', 'easy', 'normal', 'hard'] },
  { key: 'level-type', label: 'Level Type', inputType: 'dropdown', options: ['default', 'flat', 'large_biomes', 'amplified'] },
  { key: 'pvp', label: 'PVP', inputType: 'toggle' },
  { key: 'online-mode', label: 'Online Mode', inputType: 'toggle' },
  { key: 'allow-flight', label: 'Allow Flight', inputType: 'toggle' },
  { key: 'allow-nether', label: 'Allow Nether', inputType: 'toggle' },
  { key: 'force-gamemode', label: 'Force Gamemode', inputType: 'toggle' },
  { key: 'spawn-monsters', label: 'Spawn Monsters', inputType: 'toggle' },
  { key: 'spawn-animals', label: 'Spawn Animals', inputType: 'toggle' },
];

export function SettingsTab({ client }: SettingsTabProps) {
  const [settings, setSettings] = useState<ServerSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edited, setEdited] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const fetchSettings = async () => {
    try {
      const result = (await client.call('server_settings/list')) as ServerSetting[];
      const list = Array.isArray(result) ? result : [];
      setSettings(list);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [client]);

  const getValue = (key: string): unknown => {
    if (key in edited) return edited[key];
    const setting = settings.find((s) => s.key === key);
    return setting?.value;
  };

  const handleChange = (key: string, value: unknown) => {
    const setting = settings.find((s) => s.key === key);
    const original = setting?.value;
    if (String(value) === String(original)) {
      setEdited((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else {
      setEdited((prev) => ({ ...prev, [key]: value }));
    }
    setSaved(false);
    setActionError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setActionError(null);
    setSaved(false);
    try {
      for (const [key, value] of Object.entries(edited)) {
        await client.call('server_settings/set', [{ key, value }]);
      }
      setEdited({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await fetchSettings();
    } catch (err: any) {
      setActionError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = Object.keys(edited).length > 0;

  const renderInput = (def: SettingDef) => {
    const value = getValue(def.key);

    switch (def.inputType) {
      case 'toggle':
        return (
          <button
            onClick={() => handleChange(def.key, !value)}
            className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
              value ? 'bg-app-accent' : 'bg-app-border-hover'
            }`}
            role="switch"
            aria-checked={!!value}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                value ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        );

      case 'number':
        return (
          <input
            type="number"
            value={value != null ? String(value) : ''}
            onChange={(e) => handleChange(def.key, Number(e.target.value))}
            className="w-24 px-2.5 py-1.5 rounded-lg bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus text-sm outline-none transition-colors font-mono"
          />
        );

      case 'dropdown':
        return (
          <select
            value={value != null ? String(value) : ''}
            onChange={(e) => handleChange(def.key, e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-app-input border border-app-border focus:border-app-accent text-sm outline-none transition-colors min-w-[120px]"
          >
            {def.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );

      default:
        return (
          <input
            type="text"
            value={value != null ? String(value) : ''}
            onChange={(e) => handleChange(def.key, e.target.value)}
            className="flex-1 px-2.5 py-1.5 rounded-lg bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus text-sm outline-none transition-colors"
          />
        );
    }
  };

  if (loading) return <LoadingSkeleton lines={8} />;
  if (error) return <ErrorBanner message={error} onRetry={fetchSettings} />;

  return (
    <div className="animate-fade-in space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-app-text">
          Server Settings ({SETTINGS.length})
        </h3>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-sm font-semibold text-app-green animate-fade-in">
              Saved!
            </span>
          )}
          {actionError && (
            <span className="text-sm text-app-red truncate max-w-48" title={actionError}>
              {actionError}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="px-4 py-2 bg-app-accent hover:bg-app-accent-hover disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {settings.length === 0 ? (
        <EmptyState title="No server settings" description="Settings will appear here." />
      ) : (
        <div className="rounded-xl bg-app-surface border border-app-border divide-y divide-app-border-light">
          {SETTINGS.map((def) => {
            const isEdited = def.key in edited;
            const value = getValue(def.key);
            return (
              <div
                key={def.key}
                className={`flex items-center justify-between px-4 py-3 transition-colors ${
                  isEdited ? 'bg-app-amber-bg/50' : ''
                }`}
              >
                <div className="min-w-0 mr-3">
                  <span className="text-sm font-medium text-app-text">{def.label}</span>
                  <p className="text-xs text-app-text-muted font-mono">{def.key}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {value != null && !isEdited && (
                    <span className="text-xs text-app-text-muted font-mono">
                      {String(value)}
                    </span>
                  )}
                  {renderInput(def)}
                  {isEdited && (
                    <span className="text-xs text-amber-600" title="Modified">
                      *
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
