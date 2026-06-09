import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Play,
  Square,
  RotateCcw,
  Terminal,
  Settings,
  Wrench,
  Cpu,
  MemoryStick,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { useInstanceStore } from '../stores/instanceStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton';
import type { ServerType } from '../lib/types';

const SELF_DESCRIBING: ServerType[] = ['forge', 'custom', 'fabric'];

function stateLabel(state: string, t: (k: string) => string) {
  return t(`dashboard.state.${state}`);
}

function stateColors(state: string) {
  switch (state) {
    case 'running': return { dot: 'bg-app-green', text: 'text-app-green', badge: 'bg-app-green-bg text-app-green' };
    case 'starting':
    case 'stopping': return { dot: 'bg-app-amber', text: 'text-app-amber', badge: 'bg-app-amber-bg text-app-amber' };
    case 'crashed': return { dot: 'bg-app-red', text: 'text-app-red', badge: 'bg-app-red-bg text-app-red' };
    default: return { dot: 'bg-app-text-muted', text: 'text-app-text-muted', badge: 'bg-app-border-light text-app-text-secondary' };
  }
}

function serverTypeBadge(type: ServerType) {
  switch (type) {
    case 'paper': return { label: 'Paper', color: 'text-badge-paper bg-badge-paper-bg' };
    case 'vanilla': return { label: 'Vanilla', color: 'text-badge-vanilla bg-badge-vanilla-bg' };
    case 'spigot': return { label: 'Spigot', color: 'text-badge-spigot bg-badge-spigot-bg' };
    case 'fabric': return { label: 'Fabric', color: 'text-badge-fabric bg-badge-fabric-bg' };
    case 'forge': return { label: 'Forge', color: 'text-badge-forge bg-badge-forge-bg' };
    case 'custom': return { label: 'Custom', color: 'text-badge-custom bg-badge-custom-bg' };
  }
}

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { wsConnected, daemonConnected } = useWebSocket();

  const instances = useInstanceStore((s) => s.instances);
  const loading = useInstanceStore((s) => s.loading);
  const error = useInstanceStore((s) => s.error);
  const selectedId = useInstanceStore((s) => s.selectedId);
  const fetchInstances = useInstanceStore((s) => s.fetchInstances);
  const startInstance = useInstanceStore((s) => s.startInstance);
  const stopInstance = useInstanceStore((s) => s.stopInstance);
  const restartInstance = useInstanceStore((s) => s.restartInstance);
  const deleteInstance = useInstanceStore((s) => s.deleteInstance);
  const selectInstance = useInstanceStore((s) => s.selectInstance);
  const stats = useInstanceStore((s) => s.stats);

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);


  if (loading) return <LoadingSkeleton lines={4} />;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      {/* Daemon offline */}
      {!daemonConnected && (
        <div className="mb-6 p-4 rounded-lg bg-app-amber-bg border border-amber-200 dark:border-amber-800 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-app-amber flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800 dark:text-amber-200">{t('dashboard.daemonOfflineTitle')}</p>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">{t('dashboard.daemonOfflineDesc')}</p>
            <code className="inline-block mt-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-md text-xs text-amber-800 dark:text-amber-300 font-mono">
              cd daemon && cargo run
            </code>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6">
          <ErrorBanner message={error} onRetry={fetchInstances} retryLabel={t('status.retry')} />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('dashboard.title')}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-2 h-2 rounded-sm ${daemonConnected ? 'bg-app-green' : wsConnected ? 'bg-app-amber' : 'bg-app-red'}`} />
            <span className="text-sm text-app-text-secondary">
              {daemonConnected ? t('status.daemonConnected') : wsConnected ? t('status.websocketOk') : t('status.disconnected')}
            </span>
          </div>
        </div>
        <button
          onClick={() => navigate('/setup')}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-app-accent hover:bg-app-accent-hover text-white rounded-lg text-sm font-semibold shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t('dashboard.newServer')}
        </button>
      </div>

      {/* Empty state */}
      {instances.length === 0 ? (
        <EmptyState
          title={t('dashboard.noServers')}
          description={t('dashboard.noServersDesc')}
          action={{ label: t('dashboard.createServer'), onClick: () => navigate('/setup') }}
        />
      ) : (
        <div className="grid gap-3">
          {instances.map((inst) => {
            const instStats = stats[inst.id];
            const sc = stateColors(inst.state);
            const badge = serverTypeBadge(inst.type);

            return (
              <div
                key={inst.id}
                onClick={() => selectInstance(selectedId === inst.id ? null : inst.id)}
                className={`group rounded-lg border transition-all cursor-pointer ${
                  selectedId === inst.id
                    ? 'border-app-accent bg-app-accent-bg/50 shadow-sm'
                    : 'border-app-border bg-app-surface hover:border-app-border-hover hover:shadow-app-card-hover'
                }`}
              >
                <div className="p-4 lg:p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${sc.dot}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-app-text truncate">{inst.name}</h3>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${badge.color}`}>
                            {badge.label}
                          </span>
                        </div>
                        <p className="text-sm text-app-text-secondary mt-0.5">
                          {SELF_DESCRIBING.includes(inst.type)
                            ? inst.version
                            : `${t(`serverTypes.${inst.type}`)} ${inst.version}`
                          }
                          <span className="mx-1.5 text-app-border-hover">·</span>
                          {t('dashboard.port')} {inst.port}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      {instStats && (
                        <div className="hidden sm:flex items-center gap-3">
                          <div className="flex items-center gap-1.5 text-xs text-app-text-secondary">
                            <Cpu className="w-3.5 h-3.5" />
                            <span className="font-mono tabular-nums">{instStats.cpuPercent.toFixed(1)}%</span>
                            <div className="w-10 h-1.5 bg-app-border rounded-sm overflow-hidden">
                              <div className="h-full bg-app-accent rounded-sm transition-all" style={{ width: `${Math.min(instStats.cpuPercent, 100)}%` }} />
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-app-text-secondary">
                            <MemoryStick className="w-3.5 h-3.5" />
                            <span className="font-mono tabular-nums">{instStats.memoryMb} MB</span>
                          </div>
                        </div>
                      )}

                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${sc.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-sm ${sc.dot}`} />
                        {stateLabel(inst.state, t)}
                      </span>
                    </div>
                  </div>

                  {/* Expanded actions */}
                  {selectedId === inst.id && (
                    <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-app-border animate-slide-up">
                      {inst.state === 'stopped' || inst.state === 'crashed' ? (
                        <button onClick={(e) => { e.stopPropagation(); startInstance(inst.id); }} className="inline-flex items-center gap-1.5 px-4 py-2 bg-app-accent hover:bg-app-accent-hover text-white rounded-md text-sm font-semibold transition-colors shadow-sm">
                          <Play className="w-3.5 h-3.5" />
                          {t('dashboard.start')}
                        </button>
                      ) : (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); stopInstance(inst.id); }} className="inline-flex items-center gap-1.5 px-4 py-2 bg-app-red hover:bg-red-700 text-white rounded-md text-sm font-semibold transition-colors shadow-sm">
                            <Square className="w-3.5 h-3.5" />
                            {t('dashboard.stop')}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); restartInstance(inst.id); }} className="inline-flex items-center gap-1.5 px-4 py-2 bg-app-amber hover:bg-amber-600 text-white rounded-md text-sm font-semibold transition-colors shadow-sm">
                            <RotateCcw className="w-3.5 h-3.5" />
                            {t('dashboard.restart')}
                          </button>
                        </>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); navigate(`/console/${inst.id}`); }} className="inline-flex items-center gap-1.5 px-4 py-2 bg-app-input hover:bg-app-border text-app-text rounded-md text-sm font-medium transition-colors border border-app-border hover:border-app-border-hover">
                        <Terminal className="w-3.5 h-3.5" />
                        {t('nav.console')}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); navigate(`/config/${inst.id}`); }} className="inline-flex items-center gap-1.5 px-4 py-2 bg-app-input hover:bg-app-border text-app-text rounded-md text-sm font-medium transition-colors border border-app-border hover:border-app-border-hover">
                        <Settings className="w-3.5 h-3.5" />
                        {t('nav.config')}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); navigate(`/manage/${inst.id}`); }} className="inline-flex items-center gap-1.5 px-4 py-2 bg-app-accent hover:bg-app-accent-hover text-white rounded-md text-sm font-semibold transition-colors shadow-sm">
                        <Wrench className="w-3.5 h-3.5" />
                        {t('dashboard.manage')}
                      </button>

                      <div className="ml-auto">
                        {deleteConfirm === inst.id ? (
                          <div className="flex gap-2">
                            <button onClick={async (e) => { e.stopPropagation(); try { await deleteInstance(inst.id); setDeleteConfirm(null); } catch {} }} className="px-4 py-2 bg-app-red hover:bg-red-700 text-white rounded-md text-sm font-semibold transition-colors">
                              {t('dashboard.confirmDelete')}
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); }} className="px-4 py-2 bg-app-input hover:bg-app-border text-app-text-secondary rounded-md text-sm font-medium transition-colors border border-app-border">
                              {t('dashboard.cancel')}
                            </button>
                          </div>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(inst.id); }} className="px-3 py-2 text-app-red hover:bg-app-red-bg rounded-md text-sm font-medium transition-colors flex items-center gap-1.5">
                            <Trash2 className="w-3.5 h-3.5" />
                            {t('dashboard.delete')}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
