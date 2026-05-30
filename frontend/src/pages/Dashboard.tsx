import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInstanceStore } from '../stores/instanceStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton';
import type { IpcEvent } from '../lib/types';

export default function Dashboard() {
  const navigate = useNavigate();
  const { wsConnected, daemonConnected, onEvent } = useWebSocket();
  const {
    instances, loading, error,
    fetchInstances, startInstance, stopInstance, restartInstance,
    updateInstanceState, updateStats, appendLog, selectedId, selectInstance,
  } = useInstanceStore();

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  useEffect(() => {
    return onEvent((event: IpcEvent) => {
      if (event.event === 'instance.state_change') {
        updateInstanceState(event.data.instance_id as string, event.data.state as 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed');
      } else if (event.event === 'instance.stats') {
        updateStats(event.data.instance_id as string, {
          instanceId: event.data.instance_id as string,
          cpuPercent: event.data.cpu_percent as number,
          memoryMb: event.data.memory_mb as number,
          uptimeSecs: event.data.uptime_secs as number,
        });
      } else if (event.event === 'instance.log') {
        // Capture logs globally so Console page has history when opened
        appendLog(event.data.instance_id as string, {
          instanceId: event.data.instance_id as string,
          line: event.data.line as string,
          timestamp: event.data.timestamp as number,
        });
      }
    });
  }, [onEvent, updateInstanceState, updateStats, appendLog]);

  if (loading) return <LoadingSkeleton lines={3} />;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {!daemonConnected && (
        <div className="mb-4 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
          <div className="flex items-start gap-2">
            <span className="text-yellow-400 text-lg">⚠️</span>
            <div>
              <p className="text-yellow-300 font-medium">Daemon Offline</p>
              <p className="text-sm text-yellow-400/80 mt-1">
                The Rust daemon isn't running. Start it in a terminal:
              </p>
              <code className="block mt-2 p-2 bg-black/30 rounded text-xs text-yellow-300 font-mono">
                cd daemon && cargo run
              </code>
              <p className="text-xs text-yellow-400/60 mt-2">
                Or build first: <code className="bg-black/30 px-1 rounded">cd daemon && cargo build --release</code>
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onRetry={fetchInstances} />
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-gray-400">
            {daemonConnected ? (
              <span className="text-green-400">🟢 Daemon Connected</span>
            ) : wsConnected ? (
              <span className="text-yellow-400">🟡 WebSocket OK — Daemon Offline</span>
            ) : (
              <span className="text-red-400">🔴 Disconnected</span>
            )}
          </p>
        </div>
        <button
          onClick={() => navigate('/setup')}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors"
        >
          + New Server
        </button>
      </div>

      {instances.length === 0 ? (
        <EmptyState
          title="No servers yet"
          description="Create your first Minecraft server to get started"
          action={{ label: 'Create Server', onClick: () => navigate('/setup') }}
        />
      ) : (
        <div className="grid gap-4">
          {instances.map((inst) => {
            const stats = useInstanceStore.getState().stats[inst.id];
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
                      {inst.type} {inst.version} &middot; Port {inst.port}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {stats && (
                      <div className="text-right text-xs text-gray-400">
                        <div>CPU: {stats.cpuPercent.toFixed(1)}%</div>
                        <div>RAM: {stats.memoryMb} MB</div>
                      </div>
                    )}
                    <span className={`text-sm font-medium ${stateColor}`}>
                      {inst.state.toUpperCase()}
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
                        Start
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); stopInstance(inst.id); }}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm transition-colors"
                        >
                          Stop
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); restartInstance(inst.id); }}
                          className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 rounded text-sm transition-colors"
                        >
                          Restart
                        </button>
                      </>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/console/${inst.id}`); }}
                      className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm transition-colors"
                    >
                      Console
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/config/${inst.id}`); }}
                      className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm transition-colors"
                    >
                      Config
                    </button>
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
