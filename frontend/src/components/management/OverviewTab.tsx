import { useEffect, useState } from 'react';
import type { SmpClient } from '../../lib/smp-client';
import type { ServerStatus } from '../../lib/types';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { ErrorBanner } from '../ui/ErrorBanner';
import { EmptyState } from '../ui/EmptyState';

interface OverviewTabProps {
  client: SmpClient;
}

interface JoinLeaveEntry {
  type: 'joined' | 'left';
  player: string;
  time: number;
}

export function OverviewTab({ client }: OverviewTabProps) {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<JoinLeaveEntry[]>([]);

  const fetchStatus = async () => {
    try {
      const result = (await client.call('server/status')) as ServerStatus;
      setStatus(result);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch server status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    const unsubJoin = client.onNotification('players/joined', (params: any) => {
      const data = Array.isArray(params) ? params[0] : params;
      const name = data?.player || data?.name || 'Unknown';
      setEvents((prev) => {
        const entry: JoinLeaveEntry = { type: 'joined', player: name, time: Date.now() };
        return [entry, ...prev].slice(0, 20);
      });
    });

    const unsubLeft = client.onNotification('players/left', (params: any) => {
      const data = Array.isArray(params) ? params[0] : params;
      const name = data?.player || data?.name || 'Unknown';
      setEvents((prev) => {
        const entry: JoinLeaveEntry = { type: 'left', player: name, time: Date.now() };
        return [entry, ...prev].slice(0, 20);
      });
    });

    return () => {
      unsubJoin();
      unsubLeft();
    };
  }, [client]);

  if (loading) return <LoadingSkeleton lines={4} />;
  if (error) return <ErrorBanner message={error} onRetry={fetchStatus} />;
  if (!status) return <EmptyState title="No status data" />;

  const running = status.started;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          className="rounded-xl p-4"
          style={{ backgroundColor: '#f0fdf4', border: '1px solid #a7f3d0' }}
        >
          <p className="text-xs font-medium text-app-text-muted uppercase tracking-wider">
            Players
          </p>
          <p className="text-2xl font-bold mt-1" style={{ color: '#16a34a' }}>
            {status.players}
          </p>
        </div>
        <div
          className="rounded-xl p-4"
          style={{ backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0' }}
        >
          <p className="text-xs font-medium text-app-text-muted uppercase tracking-wider">
            Version
          </p>
          <p className="text-2xl font-bold mt-1" style={{ color: '#059669' }}>
            {status.version}
          </p>
        </div>
        <div
          className="rounded-xl p-4"
          style={{
            backgroundColor: running ? '#f0fdf4' : '#f0eeea',
            border: running ? '1px solid #a7f3d0' : '1px solid #e8e6e1',
          }}
        >
          <p className="text-xs font-medium text-app-text-muted uppercase tracking-wider">
            Status
          </p>
          <p
            className="text-2xl font-bold mt-1"
            style={{ color: running ? '#16a34a' : '#a09c94' }}
          >
            {running ? 'Running' : 'Stopped'}
          </p>
        </div>
      </div>

      {/* Notification Events */}
      <div>
        <h3 className="text-sm font-semibold text-app-text mb-3">
          Player Activity
          <span className="text-app-text-muted font-normal ml-2">(live)</span>
        </h3>
        {events.length === 0 ? (
          <p className="text-sm text-app-text-muted py-4 text-center bg-app-surface border border-app-border rounded-xl">
            Waiting for player events...
          </p>
        ) : (
          <div className="rounded-xl bg-app-surface border border-app-border divide-y divide-app-border-light max-h-64 overflow-y-auto">
            {events.map((ev, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    ev.type === 'joined' ? 'bg-app-green' : 'bg-app-red'
                  }`}
                />
                <span className="text-sm font-medium text-app-text">
                  {ev.player}
                </span>
                <span className="text-xs text-app-text-muted">
                  {ev.type === 'joined' ? 'joined' : 'left'}
                </span>
                <span className="text-xs text-app-text-muted ml-auto tabular-nums">
                  {new Date(ev.time).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
