import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Check,
  ChevronRight,
   Download,
   AlertTriangle,
  Loader2,
  Server,
  Box,
  Blocks,
  Flame,
  Puzzle,
  FolderInput,
} from 'lucide-react';
import { useInstanceStore } from '../stores/instanceStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { getVersions, resolveDownloadUrl, getFabricLoaderVersions, getFabricInstallerVersions } from '../lib/api';
import type { ServerType, ServerVersion, FabricVersionMeta, IpcEvent } from '../lib/types';

function TypeIcon({ type }: { type: ServerType }) {
  const cls = 'w-5 h-5';
  switch (type) {
    case 'paper': return <Blocks className={cls} />;
    case 'vanilla': return <Box className={cls} />;
    case 'spigot': return <Flame className={cls} />;
    case 'fabric': return <Puzzle className={cls} />;
    case 'forge': return <Flame className={cls} />;
    case 'custom': return <FolderInput className={cls} />;
    default: return <Server className={cls} />;
  }
}

function typeBadgeColors(type: ServerType) {
  switch (type) {
    case 'paper': return 'text-badge-paper bg-badge-paper-bg';
    case 'vanilla': return 'text-badge-vanilla bg-badge-vanilla-bg';
    case 'spigot': return 'text-badge-spigot bg-badge-spigot-bg';
    case 'fabric': return 'text-badge-fabric bg-badge-fabric-bg';
    case 'forge': return 'text-badge-fabric bg-badge-fabric-bg';
    case 'custom': return 'text-badge-custom bg-badge-custom-bg';
  }
}

const STEPS = [
  { step: 1, label: 'step1' },
  { step: 2, label: 'step2' },
  { step: 3, label: 'step3' },
] as const;

export default function Setup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { onEvent } = useWebSocket();
  const createInstance = useInstanceStore((s) => s.createInstance);
  const downloadProgress = useInstanceStore((s) => s.downloadProgress);
  const setDownloadProgress = useInstanceStore((s) => s.setDownloadProgress);
  const importInstance = useInstanceStore((s) => s.importInstance);

  const [step, setStep] = useState(1);
  const [serverType, setServerType] = useState<ServerType>('paper');
  const [selectedVersion, setSelectedVersion] = useState<ServerVersion | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string>('');
  const [versions, setVersions] = useState<ServerVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [resolvingUrl, setResolvingUrl] = useState(false);
  const [fabricLoaders, setFabricLoaders] = useState<FabricVersionMeta[]>([]);
  const [fabricInstallers, setFabricInstallers] = useState<FabricVersionMeta[]>([]);
  const [fabricLoader, setFabricLoader] = useState('');
  const [fabricInstaller, setFabricInstaller] = useState('');
  const [versionError, setVersionError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [port, setPort] = useState(25565);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceDir, setSourceDir] = useState('');
  const [javaArgs, setJavaArgs] = useState('');
  const [javaPath, setJavaPath] = useState('');

  const abortRef = useRef<AbortController | null>(null);

  const SERVER_TYPES = useMemo(() => [
    { value: 'paper' as ServerType, label: t('setup.paper'), desc: t('setup.paperDesc'), icon: 'paper' },
    { value: 'vanilla' as ServerType, label: t('setup.vanilla'), desc: t('setup.vanillaDesc'), icon: 'vanilla' },
    { value: 'spigot' as ServerType, label: t('setup.spigot'), desc: t('setup.spigotDesc'), icon: 'spigot' },
    { value: 'fabric' as ServerType, label: t('setup.fabric'), desc: t('setup.fabricDesc'), icon: 'fabric' },
    { value: 'custom' as ServerType, label: t('setup.custom'), desc: t('setup.customDesc'), icon: 'custom' },
  ], [t]);

  useEffect(() => {
    return onEvent((event: IpcEvent) => {
      if (event.event === 'download.progress') {
        setDownloadProgress({
          taskId: event.data.task_id as string,
          percent: event.data.percent as number,
          downloaded: event.data.downloaded as number,
          total: event.data.total as number,
          phase: event.data.phase as string | undefined,
          status: event.data.status as string | undefined,
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
    setFabricLoader('');
    setFabricInstaller('');
    if (type === 'custom') {
      setStep(3);
    } else {
      fetchVersions(type);
      if (type === 'fabric') {
        getFabricLoaderVersions().then(setFabricLoaders).catch(() => {});
        getFabricInstallerVersions().then(setFabricInstallers).catch(() => {});
      }
      setStep(2);
    }
  };

  const handleSelectVersion = async (v: ServerVersion) => {
    setSelectedVersion(v);
    if (v.type === 'fabric') {
      setResolvedUrl('');
      return;
    }
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

  const resolveFabricUrl = async () => {
    if (!selectedVersion || !fabricLoader || !fabricInstaller) return;
    setResolvingUrl(true);
    setVersionError(null);
    try {
      const url = await resolveDownloadUrl('fabric', selectedVersion.id, fabricLoader, fabricInstaller);
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
      if (serverType === 'custom') {
        setDownloadProgress({
          taskId: 'import:pending',
          percent: 0,
          downloaded: 0,
          total: 0,
          phase: 'import',
          status: 'detecting',
        });
        const instance = await importInstance(name || 'My Server', sourceDir, port, javaArgs || undefined, javaPath || undefined);
        const base = import.meta.env.VITE_API_HOST ? `${import.meta.env.VITE_API_HOST}/api` : '/api';
        fetch(`${base}/instances/${instance.id}/mods/scan`, { method: 'POST' }).catch(() => {});
      } else {
        await createInstance(name || 'My Server', serverType, selectedVersion?.id || '', port, resolvedUrl, javaPath || undefined);
      }
      setDownloadProgress(null);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('setup.createFailed'));
      setDownloadProgress(null);
      setCreating(false);
    }
  };

  const dp = downloadProgress;

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto animate-fade-in">
      {/* Header */}
      <button onClick={() => navigate('/')} className="inline-flex items-center gap-1.5 text-sm text-app-text-muted hover:text-app-text-secondary transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" />
        {t('setup.back') || '返回'}
      </button>

      <h1 className="text-2xl font-bold tracking-tight mb-8">{t('setup.title')}</h1>

      {/* Steps */}
      <div className="flex items-center gap-3 mb-10">
        {STEPS.map((s, i) => (
          <div key={s.step} className="flex items-center gap-3 flex-1">
            <div className="flex items-center gap-2.5">
              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold transition-colors ${
                s.step <= step ? 'bg-app-accent text-white' : 'bg-app-border text-app-text-muted'
              }`}>
                {s.step < step ? <Check className="w-3.5 h-3.5" /> : s.step}
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

      {/* Step 1 */}
      {step === 1 && (
        <div>
          <h2 className="text-lg font-semibold mb-5">{t('setup.step1')}</h2>
          <div className="grid gap-3">
            {SERVER_TYPES.map((item) => (
              <button
                key={item.value}
                onClick={() => handleSelectType(item.value)}
                className="group flex items-center gap-4 p-4 rounded-lg border-2 text-left transition-all bg-app-surface border-app-border hover:border-app-accent hover:shadow-app-card-hover"
              >
                <div className={`w-10 h-10 rounded-md flex items-center justify-center ${typeBadgeColors(item.value)}`}>
                  <TypeIcon type={item.value} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-app-text group-hover:text-app-accent transition-colors">
                    {item.label}
                  </div>
                  <div className="text-sm text-app-text-secondary mt-0.5">{item.desc}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-app-border-hover group-hover:text-app-accent transition-colors flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold">{t('setup.step2')}</h2>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${typeBadgeColors(serverType)}`}>
              {serverType}
            </span>
          </div>

          {loadingVersions && (
            <div className="text-center py-16">
              <Loader2 className="w-7 h-7 text-app-accent animate-spin mx-auto mb-3" />
              <p className="text-sm text-app-text-secondary">
                {t('setup.fetchingVersions', { type: serverType })}
              </p>
            </div>
          )}

          {resolvingUrl && (
            <div className="text-center py-6">
              <Loader2 className="w-5 h-5 text-app-accent animate-spin mx-auto mb-2" />
              <p className="text-xs text-app-text-secondary">
                {t('setup.resolvingUrl', { version: selectedVersion?.id || '' })}
              </p>
            </div>
          )}

          {versionError && !resolvingUrl && (
            <div className="p-4 rounded-lg bg-app-red-bg border border-red-200 dark:border-red-800 text-app-red text-sm mb-5">
              {versionError}
              <button onClick={() => fetchVersions(serverType)} className="ml-3 underline hover:text-red-800 dark:hover:text-red-300 font-medium">
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
                  className={`p-3 rounded-md border-2 text-center transition-all disabled:opacity-50 ${
                    selectedVersion?.id === v.id
                      ? 'border-app-accent bg-app-accent-bg'
                      : 'border-app-border bg-app-surface hover:border-app-accent hover:shadow-app-card-hover'
                  }`}
                >
                  <div className="text-sm font-semibold text-app-text">{v.id}</div>
                </button>
              ))}
            </div>
          )}

          {/* Fabric loader/installer dropdowns */}
          {serverType === 'fabric' && selectedVersion && (
            <div className="space-y-4 mb-5 p-4 rounded-lg bg-app-input border border-app-border">
              <p className="text-sm font-semibold text-app-text">Minecraft {selectedVersion.id}</p>
              <div>
                <label className="block text-xs font-semibold text-app-text-secondary mb-1.5">{t('setup.fabricLoader')}</label>
                <select value={fabricLoader} onChange={(e) => { setFabricLoader(e.target.value); setFabricInstaller(''); }} className="w-full px-3 py-2 rounded-md bg-app-surface border border-app-border text-sm focus:border-app-accent outline-none">
                  <option value="">{t('setup.selectLoader')}</option>
                  {fabricLoaders.map((l) => <option key={l.version} value={l.version}>{l.version}{l.stable ? ` (${t('setup.stable')})` : ''}</option>)}
                </select>
              </div>
              {fabricLoader && (
                <div>
                  <label className="block text-xs font-semibold text-app-text-secondary mb-1.5">{t('setup.fabricInstaller')}</label>
                  <select value={fabricInstaller} onChange={(e) => setFabricInstaller(e.target.value)} className="w-full px-3 py-2 rounded-md bg-app-surface border border-app-border text-sm focus:border-app-accent outline-none">
                    <option value="">{t('setup.selectInstaller')}</option>
                    {fabricInstallers.map((i) => <option key={i.version} value={i.version}>{i.version}{i.stable ? ` (${t('setup.stable')})` : ''}</option>)}
                  </select>
                </div>
              )}
              {fabricLoader && fabricInstaller && !resolvingUrl && (
                <button onClick={resolveFabricUrl} className="w-full px-4 py-2.5 bg-app-accent hover:bg-app-accent-hover text-white rounded-md text-sm font-semibold transition-colors">
                  {t('setup.continue') || '继续 →'}
                </button>
              )}
            </div>
          )}

          <button onClick={() => setStep(1)} className="mt-4 text-sm text-app-text-muted hover:text-app-text-secondary transition-colors">
            ← {t('setup.back')}
          </button>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div>
          <h2 className="text-lg font-semibold mb-5">{t('setup.step3') || '服务器设置'}</h2>

          {serverType !== 'custom' && resolvedUrl && (
            <div className="mb-5 p-3 rounded-md bg-app-green-bg border border-app-accent-border text-sm text-app-green font-medium flex items-center gap-2">
              <Check className="w-4 h-4" />
              {t('setup.urlResolved')}
            </div>
          )}

          {serverType !== 'custom' && !resolvedUrl && !resolvingUrl && (
            <div className="mb-5 p-3 rounded-md bg-app-amber-bg border border-amber-200 dark:border-amber-800 text-sm text-app-amber font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {t('setup.urlMissing')}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-app-text mb-1">{t('setup.serverName')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('setup.serverNamePlaceholder')}
                className="w-full px-3 py-2.5 rounded-md bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus outline-none text-sm text-app-text transition-colors"
              />
            </div>

            {serverType === 'custom' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-app-text mb-1">{t('setup.sourceDir')}</label>
                  <input
                    type="text"
                    value={sourceDir}
                    onChange={(e) => setSourceDir(e.target.value)}
                    placeholder={t('setup.sourceDirPlaceholder')}
                    className="w-full px-3 py-2.5 rounded-md bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus outline-none text-sm font-mono text-app-text transition-colors"
                  />
                  <p className="text-xs text-app-text-muted mt-1">{t('setup.sourceDirHint')}</p>
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm font-medium text-app-text mb-1">{t('setup.port')}</label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-md bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus outline-none text-sm text-app-text transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-app-text mb-1">{t('setup.javaPath')}</label>
              <input
                type="text"
                value={javaPath}
                onChange={(e) => setJavaPath(e.target.value)}
                placeholder={t('setup.javaPathPlaceholder')}
                className="w-full px-3 py-2.5 rounded-md bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus outline-none text-sm font-mono text-app-text transition-colors"
              />
              <p className="text-xs text-app-text-muted mt-1">{t('setup.javaPathHint')}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-app-text mb-1">{t('setup.javaArgs')}</label>
              <input
                type="text"
                value={javaArgs}
                onChange={(e) => setJavaArgs(e.target.value)}
                placeholder="-Xmx2G -Xms1G"
                className="w-full px-3 py-2.5 rounded-md bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus outline-none text-sm font-mono text-app-text transition-colors"
              />
            </div>
          </div>

          {/* Summary */}
          <div className="mt-6 p-4 rounded-lg bg-app-border-light border border-app-border">
            <h3 className="text-sm font-semibold text-app-text mb-3">{t('setup.summary') || '摘要'}</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-app-text-secondary">{t('setup.type')}</span><span className="font-medium capitalize">{serverType}</span></div>
              {selectedVersion && <div className="flex justify-between"><span className="text-app-text-secondary">{t('setup.version')}</span><span className="font-medium">{selectedVersion.id}</span></div>}
              <div className="flex justify-between"><span className="text-app-text-secondary">{t('setup.port')}</span><span className="font-medium">{port}</span></div>
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-md bg-app-red-bg border border-red-200 dark:border-red-800 text-app-red text-sm">{error}</div>
          )}

          {dp && creating && (
            <div className="mt-4 p-3 rounded-md bg-app-accent-bg border border-app-accent-border text-app-accent text-sm">
              {dp.phase === 'import'
                ? dp.status === 'detecting'
                  ? t('status.importDetecting')
                  : `${t('status.importProgress')} ${(dp.downloaded / 1024 / 1024).toFixed(1)} MB`
                : `${t('status.downloadProgress') || '下载中'}: ${dp.total ? `${dp.percent?.toFixed(0)}% (${(dp.downloaded / 1024 / 1024).toFixed(1)} / ${(dp.total / 1024 / 1024).toFixed(1)} MB)` : `${(dp.downloaded / 1024 / 1024).toFixed(1)} MB`}`}
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <button onClick={() => setStep(serverType === 'custom' ? 1 : 2)} className="px-4 py-2.5 bg-app-input hover:bg-app-border text-app-text rounded-md text-sm font-medium transition-colors border border-app-border">
              ← {t('setup.back')}
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || (serverType !== 'custom' && !resolvedUrl)}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 text-white rounded-md text-sm font-semibold transition-colors shadow-sm"
            >
              {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('setup.creating')}</> : <><Download className="w-4 h-4" /> {t('setup.create') || '创建服务器'}</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
