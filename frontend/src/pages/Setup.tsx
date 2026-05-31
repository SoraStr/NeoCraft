import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInstanceStore } from '../stores/instanceStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { getVersions, resolveDownloadUrl } from '../lib/api';
import type { ServerType, ServerVersion, IpcEvent } from '../lib/types';

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

  const SERVER_TYPES = useMemo(() => [
    { value: 'paper' as ServerType, label: t('setup.paper'), desc: t('setup.paperDesc') },
    { value: 'vanilla' as ServerType, label: t('setup.vanilla'), desc: t('setup.vanillaDesc') },
    { value: 'spigot' as ServerType, label: t('setup.spigot'), desc: t('setup.spigotDesc') },
    { value: 'fabric' as ServerType, label: t('setup.fabric'), desc: t('setup.fabricDesc') },
  ], [t]);

  // Listen for download progress events via WebSocket
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
    setLoadingVersions(true);
    setVersionError(null);
    try {
      const list = await getVersions(type);
      setVersions(list);
    } catch (err: unknown) {
      setVersionError(err instanceof Error ? err.message : t('setup.fetchFailed'));
    } finally {
      setLoadingVersions(false);
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
      await createInstance(
        name || 'My Server',
        serverType,
        selectedVersion?.id || '',
        port,
        resolvedUrl,
      );
      setDownloadProgress(null);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('setup.createFailed'));
      setDownloadProgress(null);
      setCreating(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">{t('setup.title')}</h1>

      <div className="flex gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`flex-1 h-1 rounded ${s <= step ? 'bg-blue-500' : 'bg-gray-700'}`} />
        ))}
      </div>

      {step === 1 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">{t('setup.step1')}</h2>
          <div className="grid gap-3">
            {SERVER_TYPES.map((item) => (
              <button
                key={item.value}
                onClick={() => handleSelectType(item.value)}
                className={`p-4 rounded-lg border text-left transition-colors ${
                  serverType === item.value
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-700 hover:border-gray-500'
                }`}
              >
                <div className="font-medium">{item.label}</div>
                <div className="text-sm text-gray-400">{item.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">
            {t('setup.step2')} — <span className="text-blue-400 capitalize">{serverType}</span>
          </h2>

          {loadingVersions && (
            <div className="text-center py-12 text-gray-400">
              <div className="animate-spin inline-block w-6 h-6 border-2 border-gray-600 border-t-blue-500 rounded-full mb-2" />
              <p className="text-sm">{t('setup.fetchingVersions', { type: serverType })}</p>
            </div>
          )}

          {resolvingUrl && (
            <div className="text-center py-4 text-gray-400">
              <div className="animate-spin inline-block w-4 h-4 border-2 border-gray-600 border-t-blue-500 rounded-full mb-1" />
              <p className="text-xs">{t('setup.resolvingUrl', { version: selectedVersion?.id || '' })}</p>
            </div>
          )}

          {versionError && !resolvingUrl && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm mb-4">
              {versionError}
              <button onClick={() => fetchVersions(serverType)} className="ml-3 underline hover:text-red-300">
                {t('status.retry')}
              </button>
            </div>
          )}

          {!loadingVersions && !resolvingUrl && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4 max-h-96 overflow-y-auto">
              {versions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => handleSelectVersion(v)}
                  disabled={resolvingUrl}
                  className={`p-3 rounded-lg border text-center transition-colors disabled:opacity-50 ${
                    selectedVersion?.id === v.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-700 hover:border-gray-500'
                  }`}
                >
                  <div className="text-sm font-medium">{v.id}</div>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => setStep(1)}
            disabled={resolvingUrl}
            className="text-sm text-gray-400 hover:text-gray-300 disabled:opacity-50"
          >
            {t('setup.back')}
          </button>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">{t('setup.step3')}</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('setup.serverName')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('setup.serverNamePlaceholder')}
                className="w-full p-2 rounded bg-gray-800 border border-gray-700 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('setup.port')}</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="w-32 p-2 rounded bg-gray-800 border border-gray-700 focus:border-blue-500 outline-none"
              />
            </div>
          </div>
          <div className="mt-6 p-4 rounded-lg bg-gray-800/50 border border-gray-700">
            <h3 className="font-medium mb-2">{t('setup.summary')}</h3>
            <p className="text-sm text-gray-400">
              {t('setup.type')}: <span className="text-gray-300 capitalize">{serverType}</span>
            </p>
            <p className="text-sm text-gray-400">
              {t('setup.version')}: <span className="text-gray-300">{selectedVersion?.id}</span>
            </p>
            <p className="text-sm text-gray-400">
              {t('setup.port')}: <span className="text-gray-300">{port}</span>
            </p>
            {resolvedUrl ? (
              <p className="text-xs text-green-400/70 mt-1">{t('setup.urlResolved')}</p>
            ) : (
              <p className="text-xs text-yellow-400/70 mt-1">{t('setup.urlMissing')}</p>
            )}
          </div>

          {error && (
            <div className="mt-4 p-3 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Download progress bar */}
          {creating && downloadProgress && (
            <div className="mt-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-blue-300">{t('status.downloadProgress')}</span>
                <span className="text-sm text-blue-400 font-mono">
                  {downloadProgress.total > 0
                    ? `${downloadProgress.percent.toFixed(1)}%`
                    : `${(downloadProgress.downloaded / 1024 / 1024).toFixed(1)} MB`}
                </span>
              </div>
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                {downloadProgress.total > 0 ? (
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(downloadProgress.percent, 100)}%` }}
                  />
                ) : (
                  <div
                    className="h-full bg-blue-500 rounded-full animate-pulse transition-all duration-1000"
                    style={{ width: `${Math.min(downloadProgress.percent, 99)}%` }}
                  />
                )}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-gray-500">
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
                  <span className="text-xs text-gray-500">{t('status.totalUnknown')}</span>
                )}
              </div>
            </div>
          )}

          {creating && !downloadProgress && (
            <div className="mt-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/30 text-center">
              <div className="animate-spin inline-block w-4 h-4 border-2 border-gray-600 border-t-blue-500 rounded-full mr-2" />
              <span className="text-sm text-blue-300">{t('status.creating')}</span>
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setStep(2)}
              disabled={creating}
              className="px-4 py-2 text-sm text-gray-400 hover:text-gray-300 disabled:opacity-50"
            >
              {t('setup.back')}
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              {creating ? t('setup.creating') : t('setup.create')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
