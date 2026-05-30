import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInstanceStore } from '../stores/instanceStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { getVersions, resolveDownloadUrl } from '../lib/api';
import type { ServerType, ServerVersion, IpcEvent } from '../lib/types';

const SERVER_TYPES: { value: ServerType; label: string; desc: string }[] = [
  { value: 'paper', label: 'Paper', desc: 'High performance, plugin support. Recommended.' },
  { value: 'vanilla', label: 'Vanilla', desc: 'Official Mojang server. No mods or plugins.' },
  { value: 'spigot', label: 'Spigot', desc: 'Stable plugin server. Good compatibility.' },
  { value: 'fabric', label: 'Fabric', desc: 'Lightweight modding platform.' },
];

export default function Setup() {
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
      setVersionError(err instanceof Error ? err.message : 'Failed to fetch versions');
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
      setVersionError(err instanceof Error ? err.message : 'Failed to resolve download URL');
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
      setError(err instanceof Error ? err.message : 'Failed to create server');
      setDownloadProgress(null);
      setCreating(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create New Server</h1>

      <div className="flex gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`flex-1 h-1 rounded ${s <= step ? 'bg-blue-500' : 'bg-gray-700'}`} />
        ))}
      </div>

      {step === 1 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Choose Server Type</h2>
          <div className="grid gap-3">
            {SERVER_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => handleSelectType(t.value)}
                className={`p-4 rounded-lg border text-left transition-colors ${
                  serverType === t.value
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-700 hover:border-gray-500'
                }`}
              >
                <div className="font-medium">{t.label}</div>
                <div className="text-sm text-gray-400">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">
            Choose Version — <span className="text-blue-400 capitalize">{serverType}</span>
          </h2>

          {loadingVersions && (
            <div className="text-center py-12 text-gray-400">
              <div className="animate-spin inline-block w-6 h-6 border-2 border-gray-600 border-t-blue-500 rounded-full mb-2" />
              <p className="text-sm">Fetching versions from {serverType} API...</p>
            </div>
          )}

          {resolvingUrl && (
            <div className="text-center py-4 text-gray-400">
              <div className="animate-spin inline-block w-4 h-4 border-2 border-gray-600 border-t-blue-500 rounded-full mb-1" />
              <p className="text-xs">Resolving download URL for {selectedVersion?.id}...</p>
            </div>
          )}

          {versionError && !resolvingUrl && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm mb-4">
              {versionError}
              <button onClick={() => fetchVersions(serverType)} className="ml-3 underline hover:text-red-300">
                Retry
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
            &larr; Back
          </button>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Server Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Server Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Minecraft Server"
                className="w-full p-2 rounded bg-gray-800 border border-gray-700 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Port</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="w-32 p-2 rounded bg-gray-800 border border-gray-700 focus:border-blue-500 outline-none"
              />
            </div>
          </div>
          <div className="mt-6 p-4 rounded-lg bg-gray-800/50 border border-gray-700">
            <h3 className="font-medium mb-2">Summary</h3>
            <p className="text-sm text-gray-400">
              Type: <span className="text-gray-300 capitalize">{serverType}</span>
            </p>
            <p className="text-sm text-gray-400">
              Version: <span className="text-gray-300">{selectedVersion?.id}</span>
            </p>
            <p className="text-sm text-gray-400">
              Port: <span className="text-gray-300">{port}</span>
            </p>
            {resolvedUrl ? (
              <p className="text-xs text-green-400/70 mt-1">✓ Download URL resolved</p>
            ) : (
              <p className="text-xs text-yellow-400/70 mt-1">⚠ No download URL — server jar must be provided manually</p>
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
                <span className="text-sm text-blue-300">Downloading server JAR...</span>
                <span className="text-sm text-blue-400 font-mono">
                  {downloadProgress.percent.toFixed(1)}%
                </span>
              </div>
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(downloadProgress.percent, 100)}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-gray-500">
                  {downloadProgress.total > 0
                    ? `${(downloadProgress.downloaded / 1024 / 1024).toFixed(1)} MB / ${(downloadProgress.total / 1024 / 1024).toFixed(1)} MB`
                    : `${(downloadProgress.downloaded / 1024 / 1024).toFixed(1)} MB downloaded`}
                </span>
              </div>
            </div>
          )}

          {creating && !downloadProgress && (
            <div className="mt-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/30 text-center">
              <div className="animate-spin inline-block w-4 h-4 border-2 border-gray-600 border-t-blue-500 rounded-full mr-2" />
              <span className="text-sm text-blue-300">Creating server...</span>
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setStep(2)}
              disabled={creating}
              className="px-4 py-2 text-sm text-gray-400 hover:text-gray-300 disabled:opacity-50"
            >
              &larr; Back
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              {creating ? 'Creating...' : 'Create Server'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
