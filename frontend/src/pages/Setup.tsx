import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInstanceStore } from '../stores/instanceStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { getVersions, resolveDownloadUrl } from '../lib/api';
import type { ServerType, ServerVersion, IpcEvent } from '../lib/types';

/* ── Icons ── */

function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconBack({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconDownload({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3v7M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 12v1a1 1 0 001 1h8a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ── Helpers ── */

const STEPS = [
  { step: 1, label: 'step1', icon: '1' },
  { step: 2, label: 'step2', icon: '2' },
  { step: 3, label: 'step3', icon: '3' },
] as const;

/* ── Setup ── */

export default function Setup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { onEvent } = useWebSocket();
  const createInstance = useInstanceStore((s) => s.createInstance);
  const downloadProgress = useInstanceStore((s) => s.downloadProgress);
  const setDownloadProgress = useInstanceStore((s) => s.setDownloadProgress);

  const [step, setStep] = useState(1);
  const [serverType, setServerType] = useState<ServerType>('paper');
  const [selectedVersion, setSelectedVersion] = useState<ServerVersion | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string>('');
  const [versions, setVersions] = useState<ServerVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [resolvingUrl, setResolvingUrl] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [port, setPort] = useState(25565);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const SERVER_TYPES = useMemo(() => [
    { value: 'paper' as ServerType, label: t('setup.paper'), desc: t('setup.paperDesc') },
    { value: 'vanilla' as ServerType, label: t('setup.vanilla'), desc: t('setup.vanillaDesc') },
    { value: 'spigot' as ServerType, label: t('setup.spigot'), desc: t('setup.spigotDesc') },
    { value: 'fabric' as ServerType, label: t('setup.fabric'), desc: t('setup.fabricDesc') },
  ], [t]);

  // Download progress via WebSocket
  useEffect(() => {
    return onEvent((event: IpcEvent) => {
      if (event.event === 'download.progress') {
        setDownloadProgress({
          taskId: event.data.task_id as string,
          percent: event.data.percent as number,
          downloaded: event.data.downloaded as number,
          total: event.data.total as number,
        });
      }
    });
  }, [onEvent, setDownloadProgress]);

  const fetchVersions = async (type: ServerType) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoadingVersions(true);
    setVersionError(null);
    try {
      const list = await getVersions(type);
      if (!controller.signal.aborted) setVersions(list);
    } catch (err: unknown) {
      if (!controller.signal.aborted) setVersionError(err instanceof Error ? err.message : t('setup.fetchFailed'));
    } finally {
      if (!controller.signal.aborted) setLoadingVersions(false);
    }
  };

  const handleSelectType = (type: ServerType) => {
    setServerType(type);
    setSelectedVersion(null);
    setResolvedUrl('');
    fetchVersions(type);
    setStep(2);
  };

  const handleSelectVersion = async (v: ServerVersion) => {
    setSelectedVersion(v);
    setResolvingUrl(true);
    setVersionError(null);
    try {
      const url = await resolveDownloadUrl(v.type, v.id);
      setResolvedUrl(url);
      setStep(3);
    } catch (err: unknown) {
      setVersionError(err instanceof Error ? err.message : t('setup.resolveFailed'));
    } finally {
      setResolvingUrl(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    setDownloadProgress(null);
    try {
      await createInstance(name || 'My Server', serverType, selectedVersion?.id || '', port, resolvedUrl);
      setDownloadProgress(null);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('setup.createFailed'));
      setDownloadProgress(null);
      setCreating(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto animate-fade-in">
      <h1 className="text-2xl font-bold tracking-tight mb-8">{t('setup.title')}</h1>

      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-10">
        {STEPS.map((s, i) => (
          <div key={s.step} className="flex items-center gap-3 flex-1">
            <div className="flex items-center gap-2.5">
              <span
                className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${
                  s.step <= step
                    ? 'bg-app-accent text-white'
                    : 'bg-app-border text-app-text-muted'
                }`}
              >
                {s.step < step ? <IconCheck className="w-3.5 h-3.5" /> : s.icon}
              </span>
              <span className={`text-sm font-medium ${s.step <= step ? 'text-app-text' : 'text-app-text-muted'}`}>
                {t(`setup.${s.label}`)}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 rounded-full ${s.step < step ? 'bg-app-accent' : 'bg-app-border'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Server type */}
      {step === 1 && (
        <div>
          <h2 className="text-lg font-semibold mb-5">{t('setup.step1')}</h2>
          <div className="grid gap-3">
            {SERVER_TYPES.map((item) => (
              <button
                key={item.value}
                onClick={() => handleSelectType(item.value)}
                className="group flex items-center justify-between p-4 rounded-xl border-2 text-left transition-all bg-app-surface border-app-border hover:border-app-accent hover:shadow-sm"
              >
                <div>
                  <div className="font-semibold text-app-text group-hover:text-app-accent transition-colors">
                    {item.label}
                  </div>
                  <div className="text-sm text-app-text-secondary mt-0.5">{item.desc}</div>
                </div>
                <IconChevronRight className="w-4 h-4 text-app-border-hover group-hover:text-app-accent transition-colors flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Version selection */}
      {step === 2 && (
        <div>
          <h2 className="text-lg font-semibold mb-1">
            {t('setup.step2')}
          </h2>
          <p className="text-sm text-app-accent font-medium capitalize mb-5">{serverType}</p>

          {loadingVersions && (
            <div className="text-center py-16">
              <div className="inline-block w-7 h-7 border-2 border-app-border border-t-app-accent rounded-full animate-spin mb-3" />
              <p className="text-sm text-app-text-secondary">
                {t('setup.fetchingVersions', { type: serverType })}
              </p>
            </div>
          )}

          {resolvingUrl && (
            <div className="text-center py-6">
              <div className="inline-block w-5 h-5 border-2 border-app-border border-t-app-accent rounded-full animate-spin mb-2" />
              <p className="text-xs text-app-text-secondary">
                {t('setup.resolvingUrl', { version: selectedVersion?.id || '' })}
              </p>
            </div>
          )}

          {versionError && !resolvingUrl && (
            <div className="p-4 rounded-xl bg-app-red-bg border border-red-200 text-red-700 text-sm mb-5">
              {versionError}
              <button onClick={() => fetchVersions(serverType)} className="ml-3 underline hover:text-red-800 font-medium">
                {t('status.retry')}
              </button>
            </div>
          )}

          {!loadingVersions && !resolvingUrl && versions.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5 max-h-96 overflow-y-auto">
              {versions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => handleSelectVersion(v)}
                  disabled={resolvingUrl}
                  className={`p-3 rounded-xl border-2 text-center transition-all disabled:opacity-50 ${
                    selectedVersion?.id === v.id
                      ? 'border-app-accent bg-app-accent-bg'
                      : 'border-app-border bg-app-surface hover:border-app-accent hover:shadow-sm'
                  }`}
                >
                  <div className="text-sm font-semibold text-app-text">{v.id}</div>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => setStep(1)}
            disabled={resolvingUrl}
            className="inline-flex items-center gap-1.5 text-sm text-app-text-secondary hover:text-app-text disabled:opacity-50 transition-colors"
          >
            <IconBack className="w-3.5 h-3.5" />
            {t('setup.back')}
          </button>
        </div>
      )}

      {/* Step 3: Configuration */}
      {step === 3 && (
        <div>
          <h2 className="text-lg font-semibold mb-6">{t('setup.step3')}</h2>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-semibold text-app-text mb-1.5">{t('setup.serverName')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('setup.serverNamePlaceholder')}
                className="w-full px-3.5 py-2.5 rounded-xl bg-app-input border-2 border-app-border focus:border-app-accent focus:bg-app-input-focus outline-none text-sm transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-app-text mb-1.5">{t('setup.port')}</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="w-32 px-3.5 py-2.5 rounded-xl bg-app-input border-2 border-app-border focus:border-app-accent focus:bg-app-input-focus outline-none text-sm transition-colors"
              />
            </div>
          </div>

          {/* Summary card */}
          <div className="p-5 rounded-xl bg-app-input border border-app-border mb-6">
            <h3 className="font-semibold text-app-text mb-3">{t('setup.summary')}</h3>
            <div className="space-y-1.5 text-sm">
              <p className="text-app-text-secondary">
                {t('setup.type')}: <span className="text-app-text font-medium capitalize">{serverType}</span>
              </p>
              <p className="text-app-text-secondary">
                {t('setup.version')}: <span className="text-app-text font-medium">{selectedVersion?.id}</span>
              </p>
              <p className="text-app-text-secondary">
                {t('setup.port')}: <span className="text-app-text font-medium">{port}</span>
              </p>
            </div>

            {/* URL status */}
            <div className={`flex items-center gap-2 mt-3 pt-3 border-t border-app-border text-xs font-medium ${
              resolvedUrl ? 'text-app-green' : 'text-app-amber'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${resolvedUrl ? 'bg-app-green' : 'bg-app-amber'}`} />
              {resolvedUrl ? t('setup.urlResolved') : t('setup.urlMissing')}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3.5 rounded-xl bg-app-red-bg border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Download progress */}
          {creating && downloadProgress && (
            <div className="mb-4 p-5 rounded-xl bg-app-accent-bg border border-app-accent-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-app-accent">{t('status.downloadProgress')}</span>
                <span className="text-sm font-mono text-app-accent tabular-nums">
                  {downloadProgress.total > 0
                    ? `${downloadProgress.percent.toFixed(1)}%`
                    : `${(downloadProgress.downloaded / 1024 / 1024).toFixed(1)} MB`}
                </span>
              </div>
              <div className="w-full h-2 bg-app-border rounded-full overflow-hidden">
                {downloadProgress.total > 0 ? (
                  <div
                    className="h-full bg-app-accent rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(downloadProgress.percent, 100)}%` }}
                  />
                ) : (
                  <div
                    className="h-full bg-app-accent rounded-full animate-pulse transition-all duration-1000"
                    style={{ width: `${Math.min(downloadProgress.percent, 99)}%` }}
                  />
                )}
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-xs text-app-text-secondary tabular-nums">
                  {downloadProgress.total > 0
                    ? t('status.mbTotal', {
                        downloaded: (downloadProgress.downloaded / 1024 / 1024).toFixed(1),
                        total: (downloadProgress.total / 1024 / 1024).toFixed(1),
                      })
                    : t('status.mbDownloaded', {
                        downloaded: (downloadProgress.downloaded / 1024 / 1024).toFixed(1),
                      })}
                </span>
                {downloadProgress.total === 0 && (
                  <span className="text-xs text-app-text-secondary">{t('status.totalUnknown')}</span>
                )}
              </div>
            </div>
          )}

          {creating && !downloadProgress && (
            <div className="mb-4 p-5 rounded-xl bg-app-accent-bg border border-app-accent-border text-center">
              <div className="inline-block w-5 h-5 border-2 border-app-border border-t-app-accent rounded-full animate-spin mr-2 align-middle" />
              <span className="text-sm text-app-accent font-medium">{t('status.creating')}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => setStep(2)}
              disabled={creating}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm text-app-text-secondary hover:text-app-text disabled:opacity-50 transition-colors"
            >
              <IconBack className="w-3.5 h-3.5" />
              {t('setup.back')}
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
            >
              {creating ? (
                t('setup.creating')
              ) : (
                <>
                  <IconDownload className="w-4 h-4" />
                  {t('setup.create')}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
