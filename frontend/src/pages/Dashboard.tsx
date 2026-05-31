import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInstanceStore } from '../stores/instanceStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton';

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { wsConnected, daemonConnected } = useWebSocket();

  // H8: Use granular Zustand selectors to prevent excessive re-renders
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

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  if (loading) return <LoadingSkeleton lines={3} />;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {!daemonConnected && (
        <div className="mb-4 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
          <div className="flex items-start gap-2">
            <span className="text-yellow-400 text-lg">⚠️</span>
            <div>
              <p className="text-yellow-300 font-medium">{t('dashboard.daemonOfflineTitle')}</p>
              <p className="text-sm text-yellow-400/80 mt-1">
                {t('dashboard.daemonOfflineDesc')}
              </p>
              <code className="block mt-2 p-2 bg-black/30 rounded text-xs text-yellow-300 font-mono">
                cd daemon && cargo run
              </code>
              <p className="text-xs text-yellow-400/60 mt-2">
                {t('dashboard.orBuild')} <code className="bg-black/30 px-1 rounded">cd daemon && cargo build --release</code>
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onRetry={fetchInstances} retryLabel={t('status.retry')} />
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
          <p className="text-sm text-gray-400">
            {daemonConnected ? (
              <span className="text-green-400">🟢 {t('status.daemonConnected')}</span>
            ) : wsConnected ? (
              <span className="text-yellow-400">🟡 {t('status.websocketOk')}</span>
            ) : (
              <span className="text-red-400">🔴 {t('status.disconnected')}</span>
            )}
          </p>
        </div>
        <button
          onClick={() => navigate('/setup')}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors"
        >
          {t('dashboard.newServer')}
        </button>
      </div>

      {instances.length === 0 ? (
        <EmptyState
          title={t('dashboard.noServers')}
          description={t('dashboard.noServersDesc')}
          action={{ label: t('dashboard.createServer'), onClick: () => navigate('/setup') }}
        />
      ) : (
        <div className="grid gap-4">
          {instances.map((inst) => {
            const instStats = stats[inst.id];
            const stateColor = {
              running: 'text-green-400', stopped: 'text-gray-400',
              starting: 'text-yellow-400', stopping: 'text-yellow-400',
              crashed: 'text-red-400',
            }[inst.state];

            return (
              <div
                key={inst.id}
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                  selectedId === inst.id
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                }`}
                onClick={() => selectInstance(inst.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{inst.name}</h3>
                    <p className="text-sm text-gray-400">
                      {t(`serverTypes.${inst.type}`)} {inst.version} &middot; {t('dashboard.port')} {inst.port}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {instStats && (
                      <div className="text-right text-xs text-gray-400">
                        <div>{t('dashboard.cpu')}: {instStats.cpuPercent.toFixed(1)}%</div>
                        <div>{t('dashboard.ram')}: {instStats.memoryMb} MB</div>
                      </div>
                    )}
                    <span className={`text-sm font-medium ${stateColor}`}>
                      {t(`dashboard.state.${inst.state}`)}
                    </span>
                  </div>
                </div>

                {selectedId === inst.id && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-700">
                    {inst.state === 'stopped' || inst.state === 'crashed' ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); startInstance(inst.id); }}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm transition-colors"
                      >
                        {t('dashboard.start')}
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); stopInstance(inst.id); }}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm transition-colors"
                        >
                          {t('dashboard.stop')}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); restartInstance(inst.id); }}
                          className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 rounded text-sm transition-colors"
                        >
                          {t('dashboard.restart')}
                        </button>
                      </>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/console/${inst.id}`); }}
                      className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm transition-colors"
                    >
                      {t('nav.console')}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/config/${inst.id}`); }}
                      className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm transition-colors"
                    >
                      {t('nav.config')}
                    </button>
                    {deleteConfirm === inst.id ? (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteInstance(inst.id); setDeleteConfirm(null); }}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm transition-colors"
                        >
                          {t('dashboard.confirmDelete')}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); }}
                          className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm transition-colors"
                        >
                          {t('dashboard.cancel')}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(inst.id); }}
                        className="px-3 py-1 bg-red-600/50 hover:bg-red-600 rounded text-sm transition-colors"
                        title={t('dashboard.delete')}
                      >
                        {t('dashboard.delete')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
