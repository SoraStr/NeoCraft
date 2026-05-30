import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInstanceStore } from '../stores/instanceStore';
import { getVersions } from '../lib/api';
import type { ServerType, ServerVersion } from '../lib/types';

const SERVER_TYPES: { value: ServerType; label: string; desc: string }[] = [
  { value: 'paper', label: 'Paper', desc: 'High performance, plugin support. Recommended.' },
  { value: 'vanilla', label: 'Vanilla', desc: 'Official Mojang server. No mods or plugins.' },
  { value: 'spigot', label: 'Spigot', desc: 'Stable plugin server. Good compatibility.' },
  { value: 'fabric', label: 'Fabric', desc: 'Lightweight modding platform.' },
];

export default function Setup() {
  const navigate = useNavigate();
  const createInstance = useInstanceStore((s) => s.createInstance);
  const [step, setStep] = useState(1);
  const [serverType, setServerType] = useState<ServerType>('paper');
  const [selectedVersion, setSelectedVersion] = useState<ServerVersion | null>(null);
  const [versions, setVersions] = useState<ServerVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [port, setPort] = useState(25565);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    fetchVersions(type);
    setStep(2);
  };

  const handleSelectVersion = (v: ServerVersion) => {
    setSelectedVersion(v);
    setStep(3);
  };

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      await createInstance(
        name || 'My Server',
        serverType,
        selectedVersion?.id || '',
        port,
        selectedVersion?.downloadUrl,
      );
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create server');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create New Server</h1>

      {/* Step indicator */}
      <div className="flex gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`flex-1 h-1 rounded ${s <= step ? 'bg-blue-500' : 'bg-gray-700'}`}
          />
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
            <div className="text-center py-8 text-gray-400">
              <div className="animate-spin inline-block w-6 h-6 border-2 border-gray-600 border-t-blue-500 rounded-full mb-2" />
              <p className="text-sm">Fetching versions from {serverType} API...</p>
            </div>
          )}

          {versionError && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm mb-4">
              Failed to fetch versions: {versionError}
              <button
                onClick={() => fetchVersions(serverType)}
                className="ml-3 underline hover:text-red-300"
              >
                Retry
              </button>
            </div>
          )}

          {!loadingVersions && !versionError && (
            <>
              {versions.length === 0 ? (
                <p className="text-gray-400 py-8 text-center">No versions found.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 mb-4 max-h-96 overflow-y-auto">
                  {versions.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => handleSelectVersion(v)}
                      className={`p-3 rounded-lg border text-center transition-colors ${
                        selectedVersion?.id === v.id
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-gray-700 hover:border-gray-500'
                      }`}
                    >
                      <div className="text-sm font-medium">{v.id}</div>
                      {v.downloadUrl && (
                        <div className="text-xs text-gray-500 mt-1 truncate" title={v.downloadUrl}>
                          ✓ available
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <button onClick={() => setStep(1)} className="text-sm text-gray-400 hover:text-gray-300">
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
            <p className="text-sm text-gray-400">Type: <span className="text-gray-300 capitalize">{serverType}</span></p>
            <p className="text-sm text-gray-400">Version: <span className="text-gray-300">{selectedVersion?.id}</span></p>
            <p className="text-sm text-gray-400">Port: <span className="text-gray-300">{port}</span></p>
            {selectedVersion?.downloadUrl ? (
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

          <div className="flex gap-3 mt-4">
            <button onClick={() => setStep(2)} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-300">
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
