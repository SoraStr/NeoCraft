import { useState } from 'react';
import type { SmpClient } from '../../lib/smp-client';
import { ErrorBanner } from '../ui/ErrorBanner';
import { ConfirmDialog } from './ConfirmDialog';

interface MoreTabProps {
  client: SmpClient;
}

export function MoreTab({ client }: MoreTabProps) {
  const [saving, setSaving] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [saveConfirm, setSaveConfirm] = useState(false);
  const [stopConfirm, setStopConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await client.call('server/save');
      showSuccess('World saved successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to save world.');
    } finally {
      setSaving(false);
      setSaveConfirm(false);
    }
  };

  const handleStop = async () => {
    setStopping(true);
    setError(null);
    try {
      await client.call('server/stop');
      showSuccess('Server stop command sent.');
    } catch (err: any) {
      setError(err.message || 'Failed to stop server.');
    } finally {
      setStopping(false);
      setStopConfirm(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-6 max-w-lg">
      <h3 className="text-sm font-semibold text-app-text">Server Actions</h3>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {success && (
        <div className="p-3 rounded-xl bg-app-green-bg border border-app-accent-border flex items-center gap-2.5 animate-fade-in">
          <CheckIcon className="w-4 h-4 text-app-green flex-shrink-0" />
          <span className="text-sm font-medium text-app-green">{success}</span>
        </div>
      )}

      {/* Save All */}
      <div className="rounded-xl bg-app-surface border border-app-border p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold text-app-text">Save World</h4>
            <p className="text-xs text-app-text-secondary mt-1">
              Force-save all world data to disk. This may cause a brief lag.
            </p>
          </div>
          <button
            onClick={() => setSaveConfirm(true)}
            disabled={saving}
            className="px-4 py-2 bg-app-accent hover:bg-app-accent-hover disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm flex-shrink-0"
          >
            {saving ? 'Saving...' : 'Save All'}
          </button>
        </div>
      </div>

      {/* Stop Server */}
      <div className="rounded-xl bg-app-surface border border-app-red/20 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold text-app-text">Stop Server</h4>
            <p className="text-xs text-app-text-secondary mt-1">
              Gracefully stop the Minecraft server. Players will be disconnected.
            </p>
          </div>
          <button
            onClick={() => setStopConfirm(true)}
            disabled={stopping}
            className="px-4 py-2 bg-app-red hover:bg-red-700 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm flex-shrink-0"
          >
            {stopping ? 'Stopping...' : 'Stop Server'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={saveConfirm}
        title="Save World"
        message="Are you sure you want to force-save the world? This may cause a brief server lag."
        confirmLabel="Save All"
        variant="warning"
        onConfirm={handleSave}
        onCancel={() => setSaveConfirm(false)}
      />

      <ConfirmDialog
        open={stopConfirm}
        title="Stop Server"
        message="Are you sure you want to stop the Minecraft server? All players will be disconnected and unsaved progress may be lost."
        confirmLabel="Stop Server"
        variant="danger"
        onConfirm={handleStop}
        onCancel={() => setStopConfirm(false)}
      />
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
