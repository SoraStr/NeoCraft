import { useTranslation } from 'react-i18next';
import type { ActivityEntry, ActivityType } from '../../hooks/useSmpActivity';
import type { ServerStatus } from '../../lib/types';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { ErrorBanner } from '../ui/ErrorBanner';
import { EmptyState } from '../ui/EmptyState';

interface OverviewTabProps {
  status: ServerStatus | null;
  loading: boolean;
  error: string | null;
  events: ActivityEntry[];
  onRetry: () => void;
}

export function OverviewTab({ status, loading, error, events, onRetry }: OverviewTabProps) {
  const { t } = useTranslation();

  if (loading) return <LoadingSkeleton lines={4} />;
  if (error) return <ErrorBanner message={error} onRetry={onRetry} />;
  if (!status) return <EmptyState title="No status data" />;

  const running = status.started;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl p-4" style={{ backgroundColor: '#f0fdf4', border: '1px solid #a7f3d0' }}>
          <p className="text-xs font-medium text-app-text-muted uppercase tracking-wider">{t('management.overview.players')}</p>
          <p className="text-2xl font-bold mt-1" style={{ color: '#16a34a' }}>{status.players?.length ?? 0}</p>
        </div>
        <div className="rounded-xl p-4" style={{ backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0' }}>
          <p className="text-xs font-medium text-app-text-muted uppercase tracking-wider">{t('management.overview.version')}</p>
          <p className="text-2xl font-bold mt-1" style={{ color: '#059669' }}>{status.version?.name ?? 'Unknown'}</p>
        </div>
        <div className="rounded-xl p-4" style={{ backgroundColor: running ? '#f0fdf4' : '#f0eeea', border: running ? '1px solid #a7f3d0' : '1px solid #e8e6e1' }}>
          <p className="text-xs font-medium text-app-text-muted uppercase tracking-wider">{t('management.overview.status')}</p>
          <p className="text-2xl font-bold mt-1" style={{ color: running ? '#16a34a' : '#a09c94' }}>{running ? t('management.overview.running') : t('management.overview.stopped')}</p>
        </div>
      </div>

      {/* Notification Events */}
      <div>
        <h3 className="text-sm font-semibold text-app-text mb-3">{t('management.status.serverActivity')} <span className="text-app-text-muted font-normal ml-2">({t('management.status.live')})</span></h3>
        {events.length === 0 ? (
          <p className="text-sm text-app-text-muted py-4 text-center bg-app-surface border border-app-border rounded-xl">{t('management.status.waitingForEvents')}</p>
        ) : (
          <div className="rounded-xl bg-app-surface border border-app-border divide-y divide-app-border-light max-h-64 overflow-y-auto">
            {events.map((ev, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${activityDotClass(ev.type)}`} />
                <span className="text-sm font-medium text-app-text">{ev.subject}</span>
                <span className="text-xs text-app-text-muted">
                  {ev.type === 'custom' ? ev.label : t(`management.overview.events.${ev.type}`)}
                </span>
                <span className="text-xs text-app-text-muted ml-auto tabular-nums">{new Date(ev.time).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function activityDotClass(type: ActivityType): string {
  if (type === 'joined' || type === 'serverStarted' || type === 'operatorAdded' || type === 'allowlistAdded') {
    return 'bg-app-green';
  }

  if (type === 'left' || type === 'serverStopping' || type === 'banAdded' || type === 'ipBanAdded') {
    return 'bg-app-red';
  }

  return 'bg-app-accent';
}
