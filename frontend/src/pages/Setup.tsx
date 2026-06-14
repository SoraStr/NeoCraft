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
  Search,
  Server,
  Box,
  Blocks,
  Flame,
  Puzzle,
  FolderInput,
  PackageOpen,
  ExternalLink,
} from 'lucide-react';
import { useInstanceStore } from '../stores/instanceStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { getVersions, resolveDownloadUrl, getFabricLoaderVersions, getFabricInstallerVersions, importModpack, searchModpackMarket, getModpackMarketVersions, getJavaVersions } from '../lib/api';
import type { ServerType, ServerVersion, FabricVersionMeta, IpcEvent, ModpackImportResult, ModpackSearchResult, ModpackVersionEntry, JavaInstallation } from '../lib/types';
import { JvmArgsDialog } from '../components/config/JvmArgsDialog';

function TypeIcon({ type }: { type: ServerType | 'modpack' }) {
  const cls = 'w-5 h-5';
  switch (type) {
    case 'paper': return <Blocks className={cls} />;
    case 'vanilla': return <Box className={cls} />;
    case 'spigot': return <Flame className={cls} />;
    case 'fabric': return <Puzzle className={cls} />;
    case 'forge': return <Flame className={cls} />;
    case 'custom': return <FolderInput className={cls} />;
    case 'modpack': return <PackageOpen className={cls} />;
    default: return <Server className={cls} />;
  }
}

interface JavaPreset {
  key: string;
  labelKey: string;
  description: string;
  args: string;
}

const JAVA_PRESETS: JavaPreset[] = [
  {
    key: 'low',
    labelKey: 'setup.presetLow',
    description: '2G 内存 · 2人',
    args: '-Xmx2G -Xms1G -XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20',
  },
  {
    key: 'medium',
    labelKey: 'setup.presetMedium',
    description: '4G 内存 · 10人',
    args: '-Xmx4G -Xms2G -XX:+UseG1GC -XX:+ParallelRefProcEnabled',
  },
  {
    key: 'high',
    labelKey: 'setup.presetHigh',
    description: '8G 内存 · 50人',
    args: '-Xmx8G -Xms4G -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90',
  },
];

function typeBadgeColors(type: ServerType | 'modpack') {
  switch (type) {
    case 'paper': return 'text-badge-paper bg-badge-paper-bg';
    case 'vanilla': return 'text-badge-vanilla bg-badge-vanilla-bg';
    case 'spigot': return 'text-badge-spigot bg-badge-spigot-bg';
    case 'fabric': return 'text-badge-fabric bg-badge-fabric-bg';
    case 'forge': return 'text-badge-fabric bg-badge-fabric-bg';
    case 'custom': return 'text-badge-custom bg-badge-custom-bg';
    case 'modpack': return 'text-badge-fabric bg-badge-fabric-bg';
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
  const [modpackUrl, setModpackUrl] = useState('');
  const [modpackResult, setModpackResult] = useState<ModpackImportResult | null>(null);
  const [modpackSearchQuery, setModpackSearchQuery] = useState('');
  const [modpackSearchResults, setModpackSearchResults] = useState<ModpackSearchResult[]>([]);
  const [modpackSearching, setModpackSearching] = useState(false);
  const [modpackSelected, setModpackSelected] = useState<ModpackSearchResult | null>(null);
  const [modpackVersions, setModpackVersions] = useState<ModpackVersionEntry[]>([]);
  const [modpackLoadingVersions, setModpackLoadingVersions] = useState(false);
  const [javaVersions, setJavaVersions] = useState<JavaInstallation[]>([]);
  const [javaDetecting, setJavaDetecting] = useState(false);
  const [showJvmDialog, setShowJvmDialog] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const handleDetectJava = async () => {
    setJavaDetecting(true);
    try {
      const versions = await getJavaVersions();
      setJavaVersions(versions);
    } catch {
      setJavaVersions([]);
    } finally {
      setJavaDetecting(false);
    }
  };

  const javaCompatibility = (major: number, mcVersion?: string) => {
    if (!mcVersion) return 'ok';
    const parts = mcVersion.split('.').map(Number);
    const mcMajor = parts[0] || 0;
    const mcMinor = parts[1] || 0;
    // Java 21 required for MC 1.20.5+
    if ((mcMajor === 1 && mcMinor >= 21) || mcMajor >= 2) {
      return major >= 21 ? 'ok' : major >= 17 ? 'warn' : 'bad';
    }
    // Java 17 required for MC 1.18+
    if ((mcMajor === 1 && mcMinor >= 18) || mcMajor >= 2) {
      return major >= 17 ? 'ok' : major >= 11 ? 'warn' : 'bad';
    }
    // MC 1.17+ need Java 16+
    if ((mcMajor === 1 && mcMinor >= 17)) {
      return major >= 17 ? 'ok' : major >= 16 ? 'warn' : 'bad';
    }
    // MC 1.16.5 and below: Java 8+
    return major >= 8 ? 'ok' : 'bad';
  };

  const SERVER_TYPES = useMemo(() => [
    { value: 'paper' as ServerType, label: t('setup.paper'), desc: t('setup.paperDesc'), icon: 'paper' },
    { value: 'vanilla' as ServerType, label: t('setup.vanilla'), desc: t('setup.vanillaDesc'), icon: 'vanilla' },
    { value: 'spigot' as ServerType, label: t('setup.spigot'), desc: t('setup.spigotDesc'), icon: 'spigot' },
    { value: 'fabric' as ServerType, label: t('setup.fabric'), desc: t('setup.fabricDesc'), icon: 'fabric' },
    { value: 'custom' as ServerType, label: t('setup.custom'), desc: t('setup.customDesc'), icon: 'custom' },
    { value: 'modpack' as ServerType, label: t('setup.modpack') || '模组包', desc: t('setup.modpackDesc') || '从 Modrinth 模组包链接一键导入', icon: 'modpack' },
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
          modpack_done: event.data.modpack_done as number | undefined,
          modpack_total: event.data.modpack_total as number | undefined,
          modpack_installed: event.data.modpack_installed as number | undefined,
          modpack_failed: event.data.modpack_failed as number | undefined,
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
    } else if (type === 'modpack' as ServerType) {
      setStep(2);
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

  const handleModpackSearch = async () => {
    if (!modpackSearchQuery.trim() || modpackSearchQuery.trim().length < 2) return;
    setModpackSearching(true);
    setModpackSelected(null);
    setModpackVersions([]);
    try {
      const results = await searchModpackMarket(modpackSearchQuery.trim());
      setModpackSearchResults(results);
    } catch {
      setModpackSearchResults([]);
    } finally {
      setModpackSearching(false);
    }
  };

  const handleSelectModpack = async (item: ModpackSearchResult) => {
    setModpackSelected(item);
    setModpackLoadingVersions(true);
    try {
      const versions = await getModpackMarketVersions(item.id);
      setModpackVersions(versions);
      // Auto-fill the URL with the latest version's download URL
      if (versions.length > 0 && versions[0].downloadUrl) {
        setModpackUrl(versions[0].downloadUrl);
      }
    } catch {
      setModpackVersions([]);
    } finally {
      setModpackLoadingVersions(false);
    }
  };

  const handleSelectModpackVersion = (version: ModpackVersionEntry) => {
    if (version.downloadUrl) {
      setModpackUrl(version.downloadUrl);
    }
  };

  const handleImportModpack = async () => {
    if (!modpackUrl.trim()) return;
    setCreating(true);
    setError(null);
    setDownloadProgress(null);
    setModpackResult(null);
    try {
      setDownloadProgress({
        taskId: 'modpack:pending',
        percent: 0,
        downloaded: 0,
        total: 0,
        phase: 'download',
        status: 'starting',
      });
      const result = await importModpack(modpackUrl.trim()) as ModpackImportResult;
      setModpackResult(result);
      setDownloadProgress(null);
      setCreating(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('setup.createFailed'));
      setDownloadProgress(null);
      setCreating(false);
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

          {/* Modpack import form */}
          {serverType === ('modpack' as ServerType) && (
            <div>
              {/* Market Browser */}
              {!modpackSelected && !modpackResult && (
                <div className="mb-6 p-4 rounded-lg bg-app-surface border border-app-border">
                  <h3 className="text-sm font-semibold text-app-text mb-3 flex items-center gap-2">
                    <Search className="w-4 h-4" />
                    {t('setup.modpackMarket') || '模组包市场'}
                  </h3>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={modpackSearchQuery}
                      onChange={(e) => setModpackSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleModpackSearch()}
                      placeholder={t('setup.modpackSearchPlaceholder') || '搜索模组包...'}
                      className="flex-1 px-3 py-2 rounded-md bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus outline-none text-sm text-app-text transition-colors"
                    />
                    <button
                      onClick={handleModpackSearch}
                      disabled={modpackSearching || modpackSearchQuery.trim().length < 2}
                      className="px-4 py-2 bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 text-white rounded-md text-sm font-medium transition-colors"
                    >
                      {modpackSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </button>
                  </div>

                  {modpackSearchResults.length > 0 && (
                    <div className="grid gap-2 max-h-64 overflow-y-auto">
                      {modpackSearchResults.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleSelectModpack(item)}
                          className="flex items-center gap-3 p-2.5 rounded-md text-left transition-colors bg-app-input hover:bg-app-accent-bg border border-app-border hover:border-app-accent"
                        >
                          {item.iconUrl ? (
                            <img src={item.iconUrl} alt="" className="w-8 h-8 rounded flex-shrink-0" loading="lazy" />
                          ) : (
                            <PackageOpen className="w-8 h-8 text-app-text-muted flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-app-text truncate">{item.name}</div>
                            <div className="text-xs text-app-text-muted truncate">{item.description}</div>
                            <div className="text-xs text-app-text-muted mt-0.5">
                              {item.author && <span>{item.author}</span>}
                              {item.downloads !== undefined && (
                                <span className="ml-2">{item.downloads.toLocaleString()} ↓</span>
                              )}
                              {item.latestVersion && <span className="ml-2">v{item.latestVersion}</span>}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-app-text-muted flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}

                  {modpackSearchResults.length === 0 && !modpackSearching && modpackSearchQuery.trim().length >= 2 && (
                    <p className="text-sm text-app-text-muted text-center py-4">
                      {t('setup.modpackNoResults') || '未找到模组包，请尝试其他关键词'}
                    </p>
                  )}
                </div>
              )}

              {/* Selected modpack detail */}
              {modpackSelected && !modpackResult && (
                <div className="mb-6 p-4 rounded-lg bg-app-surface border border-app-accent">
                  <div className="flex items-center gap-4 mb-4">
                    {modpackSelected.iconUrl ? (
                      <img src={modpackSelected.iconUrl} alt="" className="w-12 h-12 rounded-lg flex-shrink-0" />
                    ) : (
                      <PackageOpen className="w-12 h-12 text-app-text-muted flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-app-text">{modpackSelected.name}</div>
                      <div className="text-sm text-app-text-secondary">{modpackSelected.author}</div>
                      <div className="text-xs text-app-text-muted mt-1">
                        {modpackSelected.downloads?.toLocaleString()} ↓ · {modpackSelected.likes?.toLocaleString()} ♥
                      </div>
                      <a
                        href={modpackSelected.pageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-app-accent hover:underline mt-1"
                      >
                        Modrinth <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <button
                      onClick={() => { setModpackSelected(null); setModpackVersions([]); }}
                      className="text-xs text-app-text-muted hover:text-app-text px-2 py-1 rounded"
                    >
                      ← {t('setup.back')}
                    </button>
                  </div>

                  {modpackLoadingVersions && (
                    <div className="text-center py-4">
                      <Loader2 className="w-5 h-5 text-app-accent animate-spin mx-auto mb-2" />
                      <p className="text-xs text-app-text-muted">{t('setup.modpackLoadingVersions') || '加载版本列表...'}</p>
                    </div>
                  )}

                  {!modpackLoadingVersions && modpackVersions.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-app-text-muted mb-2">
                        {t('setup.modpackSelectVersion') || '选择版本:'}
                      </p>
                      <div className="grid gap-1.5 max-h-48 overflow-y-auto">
                        {modpackVersions.map((v) => (
                          <button
                            key={v.id}
                            onClick={() => handleSelectModpackVersion(v)}
                            className={`flex items-center justify-between p-2 rounded text-left text-sm transition-colors ${
                              v.downloadUrl === modpackUrl
                                ? 'bg-app-accent-bg border border-app-accent'
                                : 'bg-app-input border border-app-border hover:border-app-accent'
                            }`}
                          >
                            <div>
                              <span className="font-medium text-app-text">{v.name}</span>
                              <span className="text-xs text-app-text-muted ml-2">
                                {v.supportedVersions.slice(0, 3).join(', ')}
                              </span>
                            </div>
                            <div className="text-xs text-app-text-muted">
                              {v.fileSize !== undefined && `${(v.fileSize / 1024 / 1024).toFixed(1)} MB`}
                              {v.downloads !== undefined && ` · ${v.downloads.toLocaleString()} ↓`}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* URL input + import */}
              <p className="text-sm text-app-text-secondary mb-4">
                {t('setup.modpackHint') || '输入 Modrinth 模组包的 .mrpack 下载链接，系统会自动下载服务端核心和所有依赖 Mod。'}
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-app-text mb-1">
                    {t('setup.modpackUrl') || '模组包 URL'}
                  </label>
                  <input
                    type="url"
                    value={modpackUrl}
                    onChange={(e) => setModpackUrl(e.target.value)}
                    placeholder="https://cdn.modrinth.com/data/..."
                    className="w-full px-3 py-2.5 rounded-md bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus outline-none text-sm font-mono text-app-text transition-colors"
                  />
                  <p className="text-xs text-app-text-muted mt-1">
                    {t('setup.modpackUrlHint') || '支持 Modrinth 模组包 (.mrpack) 格式，支持 Fabric/Quilt/Forge/NeoForge'}
                  </p>
                </div>

                {error && (
                  <div className="p-3 rounded-md bg-app-red-bg border border-red-200 dark:border-red-800 text-app-red text-sm">{error}</div>
                )}

                {dp && creating && (
                  <div className="p-3 rounded-md bg-app-accent-bg border border-app-accent-border text-app-accent text-sm">
                    {dp.phase === 'download'
                      ? `${t('status.downloadProgress') || '下载中'}: ${dp.total ? `${dp.percent?.toFixed(0)}% (${(dp.downloaded / 1024 / 1024).toFixed(1)} / ${(dp.total / 1024 / 1024).toFixed(1)} MB)` : `${(dp.downloaded / 1024 / 1024).toFixed(1)} MB`}`
                      : dp.phase === 'downloading_mods'
                      ? `${t('setup.downloadingMods') || '下载 Mod 中'}: ${
                          dp.taskId?.startsWith('modpack:')
                            ? `${dp.modpack_done ?? 0}/${dp.modpack_total ?? 0} (${dp.percent?.toFixed(0)}%)${dp.modpack_installed != null ? ' — ' + dp.modpack_installed + ' ' + (t('setup.modSuccess') || '成功') : ''}${(dp.modpack_failed ?? 0) > 0 ? ', ' + dp.modpack_failed + ' ' + (t('setup.modFailed') || '失败') : ''}`
                            : `${dp.percent?.toFixed(0)}%`
                        }`
                      : dp.phase === 'complete'
                      ? `${t('setup.modpackImportComplete') || '模组包导入完成'}: ${dp.modpack_installed ?? 0} Mod ${t('setup.modSuccess') || '成功'}${(dp.modpack_failed ?? 0) > 0 ? ', ' + dp.modpack_failed + ' ' + (t('setup.modFailed') || '失败') : ''}`
                      : t('status.creating')}
                    {dp.status && dp.phase === 'downloading_mods' && (
                      <div className="text-xs text-app-text-muted mt-1 truncate">{dp.status}</div>
                    )}
                  </div>
                )}

                {modpackResult && !creating && (
                  <div className="p-4 rounded-lg bg-app-green-bg border border-app-accent-border text-sm">
                    <div className="font-semibold text-app-green mb-2 flex items-center gap-2">
                      <Check className="w-4 h-4" />
                      {t('setup.modpackImported') || '模组包导入成功'}
                    </div>
                    <div className="space-y-1 text-app-text-secondary">
                      <div>{t('setup.serverName') || '名称'}: {modpackResult.modpack.name}</div>
                      <div>版本: {modpackResult.modpack.version}</div>
                      <div>类型: {modpackResult.modpack.serverType}</div>
                      <div>Mod: {modpackResult.modpack.installedMods}/{modpackResult.modpack.totalMods} 安装成功</div>
                      {modpackResult.modpack.failedMods > 0 && (
                        <div className="text-app-amber">
                          失败: {modpackResult.modpack.failedMods} 个
                          {modpackResult.modpack.failures.slice(0, 3).map((f, i) => (
                            <div key={i} className="text-xs ml-2">{f}</div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => navigate('/')}
                      className="mt-3 px-4 py-2 bg-app-accent hover:bg-app-accent-hover text-white rounded-md text-sm font-medium transition-colors"
                    >
                      {t('setup.backToDashboard') || '返回仪表盘'}
                    </button>
                  </div>
                )}

                {!modpackResult && (
                  <div className="flex gap-3">
                    <button onClick={() => setStep(1)} className="px-4 py-2.5 bg-app-input hover:bg-app-border text-app-text rounded-md text-sm font-medium transition-colors border border-app-border">
                      ← {t('setup.back')}
                    </button>
                    <button
                      onClick={handleImportModpack}
                      disabled={creating || !modpackUrl.trim()}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 text-white rounded-md text-sm font-semibold transition-colors shadow-sm"
                    >
                      {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('status.creating')}</> : <><Download className="w-4 h-4" /> {t('setup.importModpack') || '导入模组包'}</>}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Non-modpack step 2 content */}
          {serverType !== ('modpack' as ServerType) && (<>
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
          </>)}
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
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={handleDetectJava}
                  disabled={javaDetecting}
                  className="px-3 py-2 bg-app-input hover:bg-app-border text-app-text rounded-md text-sm border border-app-border transition-colors flex items-center gap-1.5 flex-shrink-0"
                >
                  {javaDetecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {t('setup.detectJava') || '检测 Java'}
                </button>
                {javaVersions.length > 0 && (
                  <select
                    value={javaPath}
                    onChange={(e) => setJavaPath(e.target.value)}
                    className="flex-1 min-w-0 px-3 py-2 rounded-md bg-app-input border border-app-border focus:border-app-accent outline-none text-sm font-mono text-app-text transition-colors truncate"
                  >
                    <option value="">{t('setup.javaPathPlaceholder')}</option>
                    {javaVersions.map((jv) => {
                      const compat = selectedVersion ? javaCompatibility(jv.major_version, selectedVersion.id) : 'ok';
                      const badge = compat === 'ok' ? ' ✓' : compat === 'warn' ? ' ⚠' : ' ✗';
                      return (
                        <option key={jv.path} value={jv.path}>
                          Java {jv.major_version} ({jv.vendor}) — {jv.path}{badge}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>
              <input
                type="text"
                value={javaPath}
                onChange={(e) => setJavaPath(e.target.value)}
                placeholder={t('setup.javaPathPlaceholder')}
                className="w-full px-3 py-2.5 rounded-md bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus outline-none text-sm font-mono text-app-text transition-colors"
              />
              {javaVersions.length > 0 && selectedVersion && (
                <p className="text-xs text-app-text-muted mt-1">
                  {(() => {
                    const selected = javaVersions.find(jv => jv.path === javaPath);
                    if (!selected) return t('setup.javaPathHint');
                    const compat = javaCompatibility(selected.major_version, selectedVersion.id);
                    if (compat === 'ok') return `✓ Java ${selected.major_version} — ${t('setup.javaCompatible') || '与 Minecraft ' + selectedVersion.id + ' 兼容'}`;
                    if (compat === 'warn') return `⚠ Java ${selected.major_version} — ${t('setup.javaWarn') || '可能不兼容 Minecraft ' + selectedVersion.id + '，建议升级'}`;
                    return `✗ Java ${selected.major_version} — ${t('setup.javaBad') || '不兼容 Minecraft ' + selectedVersion.id}`;
                  })()}
                </p>
              )}
              {javaVersions.length === 0 && (
                <p className="text-xs text-app-text-muted mt-1">{t('setup.javaPathHint')}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-app-text mb-1">{t('setup.javaArgs')}</label>
              <div className="flex gap-2 mb-2 flex-wrap">
                {JAVA_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => setJavaArgs(preset.args)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                      javaArgs === preset.args
                        ? 'bg-app-accent text-white border-app-accent'
                        : 'bg-app-input text-app-text-secondary border-app-border hover:border-app-accent hover:text-app-text'
                    }`}
                    title={preset.description}
                  >
                    {t(preset.labelKey) || preset.description}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowJvmDialog(true)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors bg-app-input text-app-text-secondary border-app-border hover:border-app-accent hover:text-app-text"
                >
                  {t('setup.presetCustom') || '自定义'}
                </button>
              </div>
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
      <JvmArgsDialog
        open={showJvmDialog}
        initialArgs={javaArgs}
        onClose={() => setShowJvmDialog(false)}
        onApply={(args) => { setJavaArgs(args); setShowJvmDialog(false); }}
      />
    </div>
  );
}
