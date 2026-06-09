import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SmpClient } from '../../lib/smp-client';
import { ErrorBanner } from '../ui/ErrorBanner';
import { ConfirmDialog } from './ConfirmDialog';

interface MoreTabProps {
  client: SmpClient;
}

export function MoreTab({ client }: MoreTabProps) {
  const { t } = useTranslation();
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
      await client.call('server/save', [true]);
      showSuccess(t('management.action.worldSaved'));
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
      showSuccess(t('management.action.stopCommandSent'));
    } catch (err: any) {
      setError(err.message || 'Failed to stop server.');
    } finally {
      setStopping(false);
      setStopConfirm(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-6 max-w-lg">
      <h3 className="text-sm font-semibold text-app-text">{t('management.tabs.more')}</h3>

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
            <h4 className="text-sm font-semibold text-app-text">{t('management.action.saveWorld')}</h4>
            <p className="text-xs text-app-text-secondary mt-1">{t('management.action.saveWorldDesc')}</p>
          </div>
          <button onClick={() => setSaveConfirm(true)} disabled={saving} className="px-4 py-2 bg-app-accent hover:bg-app-accent-hover disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm flex-shrink-0">
            {saving ? t('management.buttons.saving') : t('management.buttons.saveAll')}
          </button>
        </div>
      </div>

      {/* Stop Server */}
      <div className="rounded-xl bg-app-surface border border-app-red/20 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold text-app-text">{t('management.action.stopServer')}</h4>
            <p className="text-xs text-app-text-secondary mt-1">{t('management.action.stopServerDesc')}</p>
          </div>
          <button onClick={() => setStopConfirm(true)} disabled={stopping} className="px-4 py-2 bg-app-red hover:bg-red-700 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm flex-shrink-0">
            {stopping ? t('management.buttons.stopping') : t('management.buttons.stopServer')}
          </button>
        </div>
      </div>

      <ConfirmDialog open={saveConfirm} title={t('management.confirm.saveWorldTitle')} message={t('management.confirm.saveWorldMessage')} confirmLabel={t('management.buttons.saveAll')} variant="warning" onConfirm={handleSave} onCancel={() => setSaveConfirm(false)} />
      <ConfirmDialog open={stopConfirm} title={t('management.confirm.stopServerTitle')} message={t('management.confirm.stopServerMessage')} confirmLabel={t('management.buttons.stopServer')} variant="danger" onConfirm={handleStop} onCancel={() => setStopConfirm(false)} />
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
