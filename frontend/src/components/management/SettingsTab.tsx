import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SmpClient } from '../../lib/smp-client';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { ErrorBanner } from '../ui/ErrorBanner';
import { EmptyState } from '../ui/EmptyState';

interface SettingsTabProps {
  client: SmpClient;
}

interface SettingDef {
  /** SMP method path suffix, e.g. "max_players" */
  path: string;
  /** Param name for the /set endpoint, e.g. "max" */
  param: string;
  label: string;
  inputType: 'toggle' | 'number' | 'dropdown' | 'text';
  options?: string[];
}

const SETTINGS: SettingDef[] = [
  { path: 'autosave',                       param: 'enable',             label: 'Autosave',                   inputType: 'toggle' },
  { path: 'difficulty',                     param: 'difficulty',         label: 'Difficulty',                 inputType: 'dropdown', options: ['peaceful','easy','normal','hard'] },
  { path: 'enforce_allowlist',              param: 'enforce',            label: 'Enforce Allowlist',          inputType: 'toggle' },
  { path: 'use_allowlist',                  param: 'use',                label: 'Use Allowlist',              inputType: 'toggle' },
  { path: 'max_players',                    param: 'max',                label: 'Max Players',                inputType: 'number' },
  { path: 'pause_when_empty_seconds',       param: 'seconds',            label: 'Pause When Empty (s)',       inputType: 'number' },
  { path: 'player_idle_timeout',            param: 'seconds',            label: 'Player Idle Timeout (s)',    inputType: 'number' },
  { path: 'allow_flight',                   param: 'allowed',            label: 'Allow Flight',               inputType: 'toggle' },
  { path: 'motd',                           param: 'message',            label: 'MOTD',                       inputType: 'text' },
  { path: 'spawn_protection_radius',        param: 'radius',             label: 'Spawn Protection Radius',    inputType: 'number' },
  { path: 'force_game_mode',                param: 'force',              label: 'Force Game Mode',            inputType: 'toggle' },
  { path: 'game_mode',                      param: 'mode',               label: 'Game Mode',                  inputType: 'dropdown', options: ['survival','creative','adventure','spectator'] },
  { path: 'view_distance',                  param: 'distance',           label: 'View Distance',              inputType: 'number' },
  { path: 'simulation_distance',            param: 'distance',           label: 'Simulation Distance',        inputType: 'number' },
  { path: 'accept_transfers',               param: 'accept',             label: 'Accept Transfers',           inputType: 'toggle' },
  { path: 'status_heartbeat_interval',      param: 'seconds',            label: 'Status Heartbeat (s)',       inputType: 'number' },
  { path: 'operator_user_permission_level', param: 'level',              label: 'OP Permission Level',        inputType: 'dropdown', options: ['1','2','3','4'] },
  { path: 'hide_online_players',            param: 'hide',               label: 'Hide Online Players',        inputType: 'toggle' },
  { path: 'status_replies',                 param: 'enable',             label: 'Status Replies',             inputType: 'toggle' },
  { path: 'entity_broadcast_range',         param: 'percentage_points',  label: 'Entity Broadcast Range %',   inputType: 'number' },
];

export function SettingsTab({ client }: SettingsTabProps) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edited, setEdited] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const fetchSettings = async () => {
    try {
      const results = await Promise.all(
        SETTINGS.map(async (def) => {
          try {
            const value = await client.call(`serversettings/${def.path}`);
            return [def.path, value] as const;
          } catch {
            return [def.path, null] as const;
          }
        }),
      );
      const map: Record<string, unknown> = {};
      for (const [key, val] of results) {
        if (val !== null) map[key] = val;
      }
      setValues(map);
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

  const getValue = (path: string): unknown => {
    if (path in edited) return edited[path];
    return values[path];
  };

  const handleChange = (path: string, value: unknown) => {
    const original = values[path];
    if (String(value) === String(original)) {
      setEdited((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
    } else {
      setEdited((prev) => ({ ...prev, [path]: value }));
    }
    setSaved(false);
    setActionError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setActionError(null);
    setSaved(false);
    try {
      for (const [path, value] of Object.entries(edited)) {
        const def = SETTINGS.find((s) => s.path === path)!;
        const paramObj: Record<string, unknown> = {};
        paramObj[def.param] = value;
        await client.call(`serversettings/${path}/set`, [paramObj]);
      }
      setValues((prev) => ({ ...prev, ...edited }));
      setEdited({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setActionError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = Object.keys(edited).length > 0;

  const renderInput = (def: SettingDef) => {
    const value = getValue(def.path);

    switch (def.inputType) {
      case 'toggle':
        return (
          <button onClick={() => handleChange(def.path, !value)} className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${!!value ? 'bg-app-accent' : 'bg-app-border-hover'}`} role="switch" aria-checked={!!value}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${!!value ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        );

      case 'number':
        return (
          <input
            type="number"
            value={value != null ? String(value) : ''}
            onChange={(e) => handleChange(def.path, Number(e.target.value))}
            className="w-24 px-2.5 py-1.5 rounded-lg bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus text-sm outline-none transition-colors font-mono"
          />
        );

      case 'dropdown':
        return (
          <select
            value={value != null ? String(value) : ''}
            onChange={(e) => handleChange(def.path, e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-app-input border border-app-border focus:border-app-accent text-sm outline-none transition-colors min-w-[120px]"
          >
            {def.options?.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );

      default:
        return (
          <input
            type="text"
            value={value != null ? String(value) : ''}
            onChange={(e) => handleChange(def.path, e.target.value)}
            className="w-48 px-2.5 py-1.5 rounded-lg bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus text-sm outline-none transition-colors"
          />
        );
    }
  };

  if (loading) return <LoadingSkeleton lines={8} />;
  if (error) return <ErrorBanner message={error} onRetry={fetchSettings} />;

  return (
    <div className="animate-fade-in space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-app-text">{t('management.tabs.settings')} ({SETTINGS.length})</h3>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm font-semibold text-app-green animate-fade-in">{t('management.buttons.saved')}</span>}
          {actionError && <span className="text-sm text-app-red truncate max-w-48" title={actionError}>{actionError}</span>}
          <button onClick={handleSave} disabled={!hasChanges || saving} className="px-4 py-2 bg-app-accent hover:bg-app-accent-hover disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm">
            {saving ? t('management.buttons.saving') : t('management.buttons.save')}
          </button>
        </div>
      </div>

      {Object.keys(values).length === 0 ? (
        <EmptyState title={t('management.status.noSettings')} description="" />
      ) : (
        <div className="rounded-xl bg-app-surface border border-app-border divide-y divide-app-border-light">
          {SETTINGS.map((def) => {
            const isEdited = def.path in edited;
            return (
              <div
                key={def.path}
                className={`flex items-center justify-between px-4 py-3 transition-colors ${isEdited ? 'bg-app-amber-bg/50' : ''}`}
              >
                <div className="min-w-0 mr-3">
                  <span className="text-sm font-medium text-app-text">{def.label}</span>
                  <p className="text-xs text-app-text-muted font-mono">serversettings/{def.path}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {renderInput(def)}
                  {isEdited && <span className="text-xs text-amber-600">*</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
