import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  deleteFile,
  getMods,
  getPluginMarketDetails,
  getPluginMarketVersions,
  installPluginFromMarket,
  listFiles,
  scanMods,
  searchPluginMarket,
  toggleFileDisabled,
  uploadFile,
} from '../../lib/api';
import type {
  PluginMarketDetails,
  PluginMarketProvider,
  PluginMarketResult,
  PluginMarketVersion,
  ServerType,
} from '../../lib/types';

/* ── Types ── */

interface ModInfo {
  fileName: string;
  name: string;
  modid: string;
  version: string;
  loader: string;
  size: number;
  disabled: boolean;
  description?: string;
  authors?: string[];
}

interface FileEntry {
  name: string;
  size: number;
  modified: number;
  disabled: boolean;
}

interface Props {
  instanceId: string;
  serverType: ServerType;
}

/* ── Helpers ── */

const MOD_TYPES: ServerType[] = ['fabric', 'forge', 'custom'];
const PLUGIN_TYPES: ServerType[] = ['paper', 'spigot'];

function getDefaultDir(type: ServerType): string {
  if (MOD_TYPES.includes(type)) return 'mods';
  if (PLUGIN_TYPES.includes(type)) return 'plugins';
  return 'mods';
}

function getDirLabel(dir: string, t: (k: string) => string): string {
  return dir === 'mods' ? t('mods.mods') : t('mods.plugins');
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCount(value: number | undefined): string {
  if (value === undefined) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function truncateList(values: string[], limit = 5): string {
  if (values.length === 0) return '';
  const shown = values.slice(0, limit).join(', ');
  return values.length > limit ? `${shown} +${values.length - limit}` : shown;
}

function formatAuthors(authors: string[] | undefined): string {
  if (!authors || authors.length === 0) return '';
  return truncateList(authors.filter(Boolean), 3);
}

function providerLabel(provider: PluginMarketProvider): string {
  switch (provider) {
    case 'spiget': return 'Spiget';
    case 'modrinth': return 'Modrinth';
    case 'hangar': return 'Hangar';
  }
}

function loaderBadge(loader: string, t: (k: string) => string): { bg: string; text: string; label: string } {
  switch (loader) {
    case 'forge': return { bg: 'bg-orange-100', text: 'text-orange-700', label: t('mods.loaderForge') };
    case 'fabric': return { bg: 'bg-yellow-100', text: 'text-yellow-700', label: t('mods.loaderFabric') };
    case 'neoforge': return { bg: 'bg-purple-100', text: 'text-purple-700', label: t('mods.loaderNeoForge') };
    case 'bukkit': return { bg: 'bg-green-100', text: 'text-green-700', label: t('mods.loaderBukkit') };
    case 'spigot': return { bg: 'bg-emerald-100', text: 'text-emerald-700', label: t('mods.loaderSpigot') };
    case 'paper': return { bg: 'bg-sky-100', text: 'text-sky-700', label: t('mods.loaderPaper') };
    default: return { bg: 'bg-gray-100', text: 'text-gray-600', label: t('mods.loaderUnknown') };
  }
}

/* ── Component ── */

export function ModsTab({ instanceId, serverType }: Props) {
  const { t } = useTranslation();
  const defaultDir = getDefaultDir(serverType);
  const supportsPluginMarket = PLUGIN_TYPES.includes(serverType);
  const [dir, setDir] = useState(defaultDir);
  const [mods, setMods] = useState<ModInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [view, setView] = useState<'installed' | 'market'>('installed');
  const [marketProvider, setMarketProvider] = useState<PluginMarketProvider>('modrinth');
  const [marketQuery, setMarketQuery] = useState('worldedit');
  const [marketResults, setMarketResults] = useState<PluginMarketResult[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [detailsById, setDetailsById] = useState<Record<string, PluginMarketDetails>>({});
  const [versionsById, setVersionsById] = useState<Record<string, PluginMarketVersion[]>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [installingVersionId, setInstallingVersionId] = useState<string | null>(null);
  const [installedMessage, setInstalledMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const marketAutoSearchKeyRef = useRef<string | null>(null);

  const fetchMods = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMods(instanceId);
      setMods(data);
    } catch (err: any) {
      // Fall back to raw file listing if mod cache not available
      try {
        const files = await listFiles(instanceId, dir);
        setMods(files.map((f: FileEntry) => ({
          fileName: f.name,
          name: f.name.replace(/\.jar$|\.jar\.disabled$/, ''),
          modid: f.name.replace(/\.jar$|\.jar\.disabled$/, ''),
          version: '',
          loader: 'unknown',
          size: f.size,
          disabled: f.disabled,
        })));
      } catch {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [instanceId, dir]);

  useEffect(() => {
    fetchMods();
  }, [fetchMods]);

  const handleMarketSearch = useCallback(async () => {
    const query = marketQuery.trim();
    if (query.length < 2) return;
    setMarketLoading(true);
    setMarketError(null);
    setExpandedProjectId(null);
    try {
      const results = await searchPluginMarket(marketProvider, query);
      setMarketResults(results);
    } catch (err: any) {
      setMarketError(err.message);
    } finally {
      setMarketLoading(false);
    }
  }, [marketProvider, marketQuery]);

  useEffect(() => {
    if (!supportsPluginMarket || view !== 'market') return;
    if (marketAutoSearchKeyRef.current === marketProvider) return;
    marketAutoSearchKeyRef.current = marketProvider;
    handleMarketSearch();
  }, [handleMarketSearch, marketProvider, supportsPluginMarket, view]);

  const handleExpandMarketResult = async (entry: PluginMarketResult) => {
    const key = `${entry.provider}:${entry.id}`;
    if (expandedProjectId === key) {
      setExpandedProjectId(null);
      return;
    }

    setExpandedProjectId(key);
    if (detailsById[key] && versionsById[key]) return;

    setDetailLoadingId(key);
    setMarketError(null);
    try {
      const [details, versions] = await Promise.all([
        getPluginMarketDetails(entry.provider, entry.id),
        getPluginMarketVersions(entry.provider, entry.id),
      ]);
      setDetailsById(prev => ({ ...prev, [key]: details }));
      setVersionsById(prev => ({ ...prev, [key]: versions }));
    } catch (err: any) {
      setMarketError(err.message);
    } finally {
      setDetailLoadingId(null);
    }
  };

  const handleInstallVersion = async (entry: PluginMarketResult, version: PluginMarketVersion) => {
    const key = `${entry.provider}:${entry.id}:${version.id}`;
    setInstallingVersionId(key);
    setMarketError(null);
    setInstalledMessage(null);
    try {
      const result = await installPluginFromMarket(instanceId, entry.provider, entry.id, version.id);
      setMods(result.mods);
      setInstalledMessage(t('mods.installedFile', { file: result.fileName }));
      setView('installed');
    } catch (err: any) {
      setMarketError(err.message);
    } finally {
      setInstallingVersionId(null);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    try {
      await scanMods(instanceId);
      await fetchMods();
    } catch (err: any) {
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        setError(t('mods.scanTimeout'));
      } else {
        setError(err.message);
      }
    } finally {
      setScanning(false);
    }
  };

  const handleDelete = async (fileName: string) => {
    setMods(prev => prev.filter(m => m.fileName !== fileName));
    setDeleteTarget(null);
    try {
      await deleteFile(instanceId, `${dir}/${fileName}`);
      await handleScan();
    } catch (err: any) {
      setError(err.message);
      await handleScan();
    }
  };

  const handleToggle = async (entry: ModInfo) => {
    const newName = entry.disabled
      ? entry.fileName.replace(/\.disabled$/, '')
      : `${entry.fileName}.disabled`;
    const newDisabled = !entry.disabled;

    setMods(prev => prev.map(m =>
      m.fileName === entry.fileName ? { ...m, fileName: newName, disabled: newDisabled } : m,
    ));

    try {
      const oldPath = `${dir}/${entry.fileName}`;
      const newPath = `${dir}/${newName}`;
      await toggleFileDisabled(instanceId, oldPath, newPath);
      await handleScan();
    } catch (err: any) {
      setMods(prev => prev.map(m =>
        m.fileName === newName ? { ...m, fileName: entry.fileName, disabled: entry.disabled } : m,
      ));
      setError(err.message);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_MB = 100;
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(t('mods.fileTooLarge', { max: MAX_MB }));
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const reader = new FileReader();
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const b64 = result.split(',')[1] || result;
          resolve(b64);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
      await uploadFile(instanceId, dir, file.name, dataBase64);
      // Auto-scan after upload to parse the new mod
      await handleScan();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const showDirSwitch = serverType === 'custom';

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">
            {getDirLabel(dir, t)}
          </h2>
          {showDirSwitch && (
            <select
              value={dir}
              onChange={(e) => setDir(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-app-input border border-app-border text-sm focus:border-app-accent outline-none"
            >
              <option value="mods">{t('mods.mods')}</option>
              <option value="plugins">{t('mods.plugins')}</option>
            </select>
          )}
          <span className="text-xs text-app-text-secondary">
            {mods.length} {t('mods.fileCount')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {supportsPluginMarket && (
            <div className="flex rounded-lg border border-app-border bg-app-input p-0.5">
              <button
                onClick={() => setView('installed')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${view === 'installed' ? 'bg-app-surface text-app-text shadow-sm' : 'text-app-text-muted hover:text-app-text'}`}
              >
                {t('mods.installed')}
              </button>
              <button
                onClick={() => setView('market')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${view === 'market' ? 'bg-app-surface text-app-text shadow-sm' : 'text-app-text-muted hover:text-app-text'}`}
              >
                {t('mods.market')}
              </button>
            </div>
          )}
          {view === 'installed' && (
            <>
              <button
                onClick={handleScan}
                disabled={scanning}
                className="px-3 py-1.5 text-xs text-app-text-secondary hover:text-app-text transition-colors disabled:opacity-50"
              >
                {scanning ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-3 h-3 border-2 border-app-border border-t-app-accent rounded-full animate-spin" />
                    {t('mods.scanning')}
                  </span>
                ) : (
                  t('mods.rescan')
                )}
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {uploading ? (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M8 3v7M5 8l3 3 3-3M3 12v1a1 1 0 001 1h8a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {t('mods.upload')}
              </button>
            </>
          )}
          <input ref={fileInputRef} type="file" accept=".jar,.zip" onChange={handleUpload} className="hidden" />
        </div>
      </div>

      {view === 'market' && supportsPluginMarket && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              value={marketProvider}
              onChange={(e) => setMarketProvider(e.target.value as PluginMarketProvider)}
              className="h-10 rounded-lg border border-app-border bg-app-input px-3 text-sm text-app-text outline-none focus:border-app-accent"
            >
              <option value="modrinth">Modrinth</option>
              <option value="hangar">Hangar</option>
              <option value="spiget">Spiget</option>
            </select>
            <form
              className="flex min-w-0 flex-1 gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                handleMarketSearch();
              }}
            >
              <input
                value={marketQuery}
                onChange={(event) => setMarketQuery(event.target.value)}
                placeholder={t('mods.marketSearchPlaceholder')}
                className="min-w-0 flex-1 rounded-lg border border-app-border bg-app-input px-3 py-2 text-sm text-app-text outline-none transition-colors focus:border-app-accent focus:bg-app-input-focus"
              />
              <button
                type="submit"
                disabled={marketLoading || marketQuery.trim().length < 2}
                className="inline-flex items-center justify-center rounded-lg bg-app-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-app-accent-hover disabled:opacity-50"
              >
                {marketLoading ? t('mods.searching') : t('mods.search')}
              </button>
            </form>
          </div>

          {installedMessage && (
            <div className="rounded-lg border border-green-200 bg-app-green-bg p-3 text-sm text-app-green">
              {installedMessage}
            </div>
          )}

          {marketError && (
            <div className="rounded-lg border border-red-200 bg-app-red-bg p-3 text-sm text-red-700">
              {marketError}
            </div>
          )}

          {marketLoading && (
            <div className="py-12 text-center text-sm text-app-text-secondary">
              <span className="mr-2 inline-block h-4 w-4 align-middle rounded-full border-2 border-app-border border-t-app-accent animate-spin" />
              {t('mods.searching')}
            </div>
          )}

          {!marketLoading && marketResults.length === 0 && (
            <div className="py-12 text-center text-sm text-app-text-secondary">
              {t('mods.marketEmpty')}
            </div>
          )}

          {!marketLoading && marketResults.length > 0 && (
            <div className="space-y-2">
              {marketResults.map((entry) => {
                const key = `${entry.provider}:${entry.id}`;
                const expanded = expandedProjectId === key;
                const details = detailsById[key];
                const versions = versionsById[key] ?? [];
                const versionText = truncateList(entry.supportedVersions);
                return (
                  <div key={key} className="rounded-lg border border-app-border bg-app-input transition-colors hover:border-app-border-hover">
                    <button
                      type="button"
                      onClick={() => handleExpandMarketResult(entry)}
                      className="flex w-full items-center gap-3 px-3 py-3 text-left"
                    >
                      {entry.iconUrl ? (
                        <img src={entry.iconUrl} alt="" className="h-10 w-10 flex-shrink-0 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-app-accent-bg text-xs font-bold text-app-accent">
                          {entry.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-app-text">{entry.name}</p>
                          <span className="rounded bg-app-surface px-1.5 py-0.5 text-[10px] font-semibold text-app-text-secondary">
                            {providerLabel(entry.provider)}
                          </span>
                          {entry.external && (
                            <span className="rounded bg-app-amber-bg px-1.5 py-0.5 text-[10px] font-semibold text-app-amber">
                              {t('mods.external')}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-app-text-muted">{entry.description || t('mods.noDescription')}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-app-text-secondary">
                          <span>{t('mods.downloads')}: {formatCount(entry.downloads)}</span>
                          {entry.likes !== undefined && <span>{t('mods.likes')}: {formatCount(entry.likes)}</span>}
                          {versionText && <span className="truncate">{t('mods.versions')}: {versionText}</span>}
                        </div>
                      </div>
                      <span className="flex-shrink-0 text-xs font-semibold text-app-accent">
                        {expanded ? t('mods.collapse') : t('mods.details')}
                      </span>
                    </button>

                    {expanded && (
                      <div className="border-t border-app-border-light px-3 py-3">
                        {detailLoadingId === key ? (
                          <div className="py-5 text-center text-sm text-app-text-secondary">
                            <span className="mr-2 inline-block h-4 w-4 align-middle rounded-full border-2 border-app-border border-t-app-accent animate-spin" />
                            {t('mods.loadingDetails')}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <a
                                href={details?.pageUrl ?? entry.pageUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center rounded-md border border-app-border bg-app-surface px-2.5 py-1 text-xs font-semibold text-app-text-secondary transition-colors hover:border-app-accent hover:text-app-accent"
                              >
                                {t('mods.openProject')}
                              </a>
                              {details?.links.slice(0, 4).map((link) => (
                                <a
                                  key={`${link.label}:${link.url}`}
                                  href={link.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center rounded-md border border-app-border bg-app-surface px-2.5 py-1 text-xs font-medium text-app-text-muted transition-colors hover:border-app-accent hover:text-app-accent"
                                >
                                  {link.label}
                                </a>
                              ))}
                            </div>

                            {details?.license && (
                              <p className="text-xs text-app-text-secondary">{t('mods.license')}: {details.license}</p>
                            )}

                            {versions.length > 0 ? (
                              <div className="overflow-hidden rounded-lg border border-app-border-light">
                                {versions.slice(0, 5).map((version, idx) => (
                                  <div
                                    key={version.id}
                                    className={`flex items-center gap-3 px-3 py-2 ${idx < Math.min(versions.length, 5) - 1 ? 'border-b border-app-border-light' : ''}`}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="truncate text-xs font-semibold text-app-text">{version.name}</span>
                                        {version.channel && <span className="rounded bg-app-surface px-1.5 py-0.5 text-[10px] text-app-text-muted">{version.channel}</span>}
                                      </div>
                                      <div className="mt-0.5 flex flex-wrap gap-3 text-[11px] text-app-text-muted">
                                        {version.fileName && <span className="font-mono">{version.fileName}</span>}
                                        {version.fileSize !== undefined && <span>{formatSize(version.fileSize)}</span>}
                                        {version.supportedVersions.length > 0 && <span>{truncateList(version.supportedVersions, 4)}</span>}
                                      </div>
                                    </div>
                                    {!version.external ? (
                                      <button
                                        type="button"
                                        onClick={() => handleInstallVersion(entry, version)}
                                        disabled={installingVersionId !== null}
                                        className="flex-shrink-0 rounded-md bg-app-accent px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-app-accent-hover disabled:opacity-50"
                                      >
                                        {installingVersionId === `${entry.provider}:${entry.id}:${version.id}` ? t('mods.installing') : t('mods.install')}
                                      </button>
                                    ) : version.downloadUrl ? (
                                      <a
                                        href={version.downloadUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex-shrink-0 rounded-md bg-app-amber-bg px-2.5 py-1 text-xs font-semibold text-app-amber transition-colors hover:bg-amber-100"
                                      >
                                        {t(version.external ? 'mods.manualDownload' : 'mods.download')}
                                      </a>
                                    ) : (
                                      <span className="flex-shrink-0 rounded-md bg-app-surface px-2.5 py-1 text-xs font-medium text-app-text-muted">
                                        {t('mods.notInstallable')}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-app-text-muted">{t('mods.noVersions')}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {view === 'installed' && (
        <>
      {installedMessage && (
        <div className="mb-4 rounded-lg border border-green-200 bg-app-green-bg p-3 text-sm text-app-green">
          {installedMessage}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-app-red-bg border border-red-200 text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-2">✕</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-12 text-app-text-secondary text-sm">
          <span className="inline-block w-4 h-4 border-2 border-app-border border-t-app-accent rounded-full animate-spin mr-2 align-middle" />
          {t('mods.loading')}
        </div>
      )}

      {/* Empty */}
      {!loading && mods.length === 0 && (
        <div className="text-center py-12">
          <p className="text-app-text-secondary text-sm">{t('mods.empty', { dir: getDirLabel(dir, t) })}</p>
          <button onClick={handleScan} className="mt-3 text-sm text-app-accent hover:underline">
            {t('mods.scanNow')}
          </button>
        </div>
      )}

      {/* Mod list */}
      {!loading && mods.length > 0 && (
        <div className="space-y-2">
          {mods.map((entry, index) => {
            const badge = loaderBadge(entry.loader, t);
            const authors = formatAuthors(entry.authors);
            return (
              <div
                key={`${entry.fileName}:${index}`}
                className={`rounded-lg border transition-colors ${
                  entry.disabled
                    ? 'bg-app-amber-bg/30 border-amber-100'
                    : 'bg-app-input border-app-border hover:border-app-border-hover'
                }`}
              >
                <div className="flex items-center gap-3 px-3 py-3">
                  {/* Mod icon placeholder */}
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold ${badge.bg} ${badge.text}`}>
                    {entry.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-semibold truncate ${entry.disabled ? 'text-app-text-muted line-through' : 'text-app-text'}`}>
                        {entry.name}
                      </p>
                      {entry.loader !== 'unknown' && (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                      )}
                      {entry.version && (
                        <span className="text-[11px] text-app-text-muted font-mono">{entry.version}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[11px] text-app-text-muted font-mono truncate max-w-[200px]">
                        {entry.modid}
                      </span>
                      <span className="text-[11px] text-app-text-secondary">{formatSize(entry.size)}</span>
                      {authors && (
                        <span className="text-[11px] text-app-text-secondary truncate max-w-[220px]">
                          {t('mods.authors')}: {authors}
                        </span>
                      )}
                      {entry.disabled && (
                        <span className="text-[11px] text-app-amber font-medium">{t('mods.disabled')}</span>
                      )}
                    </div>
                    {entry.description && (
                      <p className="text-[11px] text-app-text-muted mt-1 line-clamp-2">{entry.description}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleToggle(entry)}
                      title={entry.disabled ? t('mods.enable') : t('mods.disable')}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        entry.disabled
                          ? 'bg-app-green-bg text-app-green hover:bg-green-100'
                          : 'bg-app-amber-bg text-app-amber hover:bg-amber-100'
                      }`}
                    >
                      {entry.disabled ? t('mods.enable') : t('mods.disable')}
                    </button>

                    {deleteTarget === entry.fileName ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleDelete(entry.fileName)}
                          className="px-2.5 py-1 bg-app-red hover:bg-red-700 text-white rounded text-xs font-semibold transition-colors"
                        >
                          {t('mods.confirmDelete')}
                        </button>
                        <button
                          onClick={() => setDeleteTarget(null)}
                          className="px-2.5 py-1 bg-app-input hover:bg-app-border text-app-text-secondary rounded text-xs transition-colors"
                        >
                          {t('mods.cancel')}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteTarget(entry.fileName)}
                        className="p-1.5 text-app-text-muted hover:text-app-red rounded transition-colors"
                        title={t('mods.delete')}
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="M3 5h10M6 5V3.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V5M5.5 7.5v5a.5.5 0 00.5.5h4a.5.5 0 00.5-.5v-5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
        </>
      )}
    </div>
  );
}
