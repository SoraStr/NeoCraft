import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInstanceStore } from '../stores/instanceStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton';

/* ── Inline icons ── */

function IconCpu({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <rect x="5.5" y="1.5" width="5" height="2" fill="currentColor" opacity="0.6" />
      <rect x="5.5" y="12.5" width="5" height="2" fill="currentColor" opacity="0.6" />
      <rect x="1.5" y="5.5" width="2" height="5" fill="currentColor" opacity="0.6" />
      <rect x="12.5" y="5.5" width="2" height="5" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

function IconMemory({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="1.5" width="12" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 5h12M2 8.5h12M2 12h12" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
      <rect x="5" y="6" width="3" height="1.5" rx="0.5" fill="currentColor" />
      <rect x="9" y="6" width="3" height="1.5" rx="0.5" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

function IconArrowRight({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Helpers ── */

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

/* ── Dashboard ── */

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

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  if (loading) return <LoadingSkeleton lines={4} />;

  return (
    <div className="p-8 max-w-5xl mx-auto animate-fade-in">
      {/* Daemon offline warning */}
      {!daemonConnected && (
        <div className="mb-6 p-4 rounded-xl bg-app-amber-bg border border-amber-200">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-app-amber flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 6.5V11M10 13.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <div>
              <p className="font-semibold text-amber-800">{t('dashboard.daemonOfflineTitle')}</p>
              <p className="text-sm text-amber-700 mt-1">{t('dashboard.daemonOfflineDesc')}</p>
              <code className="inline-block mt-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 font-mono">
                cd daemon && cargo run
              </code>
              <p className="text-xs text-amber-600 mt-2">
                {t('dashboard.orBuild')} <code className="bg-amber-50 px-1 rounded">cd daemon && cargo build --release</code>
              </p>
            </div>
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
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`w-2 h-2 rounded-full ${daemonConnected ? 'bg-app-green' : wsConnected ? 'bg-app-amber' : 'bg-app-red'}`} />
            <span className="text-sm text-app-text-secondary">
              {daemonConnected
                ? t('status.daemonConnected')
                : wsConnected
                ? t('status.websocketOk')
                : t('status.disconnected')}
            </span>
          </div>
        </div>
        <button
          onClick={() => navigate('/setup')}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-app-accent hover:bg-app-accent-hover text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 5v10M5 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
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

            return (
              <div
                key={inst.id}
                onClick={() => selectInstance(selectedId === inst.id ? null : inst.id)}
                className={`group rounded-xl border-2 transition-all cursor-pointer ${
                  selectedId === inst.id
                    ? 'border-app-accent bg-app-accent-bg/50 shadow-sm'
                    : 'border-app-border bg-app-surface hover:border-app-border-hover hover:shadow-md'
                }`}
              >
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    {/* Left: info */}
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Status dot */}
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sc.dot}`} />

                      <div className="min-w-0">
                        <h3 className="font-semibold text-app-text truncate">{inst.name}</h3>
                        <p className="text-sm text-app-text-secondary mt-0.5">
                          {t(`serverTypes.${inst.type}`)} {inst.version}
                          <span className="mx-1.5 text-app-border-hover">·</span>
                          {t('dashboard.port')} {inst.port}
                        </p>
                      </div>
                    </div>

                    {/* Right: stats + status */}
                    <div className="flex items-center gap-4 flex-shrink-0">
                      {/* Stats */}
                      {instStats && (
                        <div className="hidden sm:flex items-center gap-4">
                          <div className="flex items-center gap-1.5 text-xs text-app-text-secondary">
                            <IconCpu className="w-3.5 h-3.5" />
                            <span className="font-mono tabular-nums">{instStats.cpuPercent.toFixed(1)}%</span>
                            {/* Mini bar */}
                            <div className="w-10 h-1.5 bg-app-border rounded-full overflow-hidden">
                              <div
                                className="h-full bg-app-accent rounded-full transition-all"
                                style={{ width: `${Math.min(instStats.cpuPercent, 100)}%` }}
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-app-text-secondary">
                            <IconMemory className="w-3.5 h-3.5" />
                            <span className="font-mono tabular-nums">{instStats.memoryMb} MB</span>
                          </div>
                        </div>
                      )}

                      {/* State badge */}
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${sc.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                        {stateLabel(inst.state, t)}
                      </span>

                      {/* Expand chevron */}
                      <IconArrowRight
                        className={`w-4 h-4 text-app-text-muted transition-transform hidden sm:block ${
                          selectedId === inst.id ? 'rotate-90' : ''
                        }`}
                      />
                    </div>
                  </div>

                  {/* Action buttons (expanded) */}
                  {selectedId === inst.id && (
                    <div className="flex gap-2 mt-4 pt-4 border-t border-app-border animate-slide-up">
                      {inst.state === 'stopped' || inst.state === 'crashed' ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); startInstance(inst.id); }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-app-accent hover:bg-app-accent-hover text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="M5 3l9 5-9 5V3z" fill="currentColor" />
                          </svg>
                          {t('dashboard.start')}
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); stopInstance(inst.id); }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-app-red hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                              <rect x="3" y="3" width="10" height="10" rx="1" fill="currentColor" />
                            </svg>
                            {t('dashboard.stop')}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); restartInstance(inst.id); }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-app-amber hover:bg-amber-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                              <path d="M3 8a5 5 0 015-5 4.9 4.9 0 013.5 1.5M13 8a5 5 0 01-5 5 4.9 4.9 0 01-3.5-1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                              <path d="M11.5 2.5V6h-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            {t('dashboard.restart')}
                          </button>
                        </>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/console/${inst.id}`); }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-app-input hover:bg-app-border text-app-text rounded-lg text-sm font-medium transition-colors border border-app-border hover:border-app-border-hover"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                          <path d="M5 6.5l2 1.5-2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {t('nav.console')}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/config/${inst.id}`); }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-app-input hover:bg-app-border text-app-text rounded-lg text-sm font-medium transition-colors border border-app-border hover:border-app-border-hover"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
                          <path d="M8 3v1.5M8 11.5V13M3 8h1.5M11.5 8H13M5.1 5.1l1 1M9.9 9.9l1 1M5.1 10.9l1-1M9.9 6.1l1-1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                        {t('nav.config')}
                      </button>
                      {inst.state === 'running' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/manage/${inst.id}`); }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-app-input hover:bg-app-border text-app-text rounded-lg text-sm font-medium transition-colors border border-app-border hover:border-app-border-hover"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="M5.5 4.5l-3-3L4 0l3 3a4.5 4.5 0 016.56 6.06l-2.12 2.12A4.5 4.5 0 015.5 4.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                            <circle cx="10.5" cy="10.5" r="1.2" fill="currentColor" />
                          </svg>
                          {t('dashboard.manage')}
                        </button>
                      )}

                      {/* Delete */}
                      <div className="ml-auto">
                        {deleteConfirm === inst.id ? (
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteInstance(inst.id); setDeleteConfirm(null); }}
                              className="px-4 py-2 bg-app-red hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors"
                            >
                              {t('dashboard.confirmDelete')}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); }}
                              className="px-4 py-2 bg-app-input hover:bg-app-border text-app-text-secondary rounded-lg text-sm font-medium transition-colors border border-app-border"
                            >
                              {t('dashboard.cancel')}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(inst.id); }}
                            className="px-4 py-2 text-app-red hover:bg-app-red-bg rounded-lg text-sm font-medium transition-colors"
                          >
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
