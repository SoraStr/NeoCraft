import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SmpClient } from '../../lib/smp-client';
import type { PlayerDto } from '../../lib/types';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { ErrorBanner } from '../ui/ErrorBanner';
import { EmptyState } from '../ui/EmptyState';
import { ConfirmDialog } from './ConfirmDialog';

interface PlayersTabProps {
  client: SmpClient;
}

export function PlayersTab({ client }: PlayersTabProps) {
  const { t } = useTranslation();
  const [players, setPlayers] = useState<PlayerDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kicking, setKicking] = useState<string | null>(null);
  const [kickConfirm, setKickConfirm] = useState<PlayerDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchPlayers = async () => {
    try {
      const result = (await client.call('players')) as PlayerDto[];
      setPlayers(Array.isArray(result) ? result : []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch players.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayers();

    // Refresh list when players join/leave
    const unsubJoin = client.onNotification('players/joined', () => {
      fetchPlayers();
    });
    const unsubLeft = client.onNotification('players/left', () => {
      fetchPlayers();
    });

    return () => {
      unsubJoin();
      unsubLeft();
    };
  }, [client]);

  const handleKick = async (player: PlayerDto) => {
    setKicking(player.name);
    setActionError(null);
    try {
      await client.call('players/kick', [[{ player: { name: player.name }, message: { literal: 'Kicked by administrator' } }]]);
      setPlayers((prev) => prev.filter((p) => p.name !== player.name));
    } catch (err: any) {
      setActionError(err.message || 'Failed to kick player.');
    } finally {
      setKicking(null);
      setKickConfirm(null);
    }
  };

  if (loading) return <LoadingSkeleton lines={4} />;
  if (error) return <ErrorBanner message={error} onRetry={fetchPlayers} />;

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-app-text">{t('management.status.players')} ({players.length})</h3>
        <button onClick={fetchPlayers} className="text-xs font-medium text-app-text-muted hover:text-app-accent transition-colors">{t('management.buttons.refresh')}</button>
      </div>

      {actionError && (
        <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
      )}

      {players.length === 0 ? (
        <EmptyState title={t('management.status.noPlayers')} description="Players will appear here when they join the server." />
      ) : (
        <div className="rounded-xl bg-app-surface border border-app-border divide-y divide-app-border-light">
          {players.map((player) => (
            <div key={player.id || player.name} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-app-green" />
                <span className="text-sm font-medium text-app-text">{player.name}</span>
                {player.id && <span className="text-xs text-app-text-muted font-mono">{player.id}</span>}
              </div>
              <button onClick={() => setKickConfirm(player)} disabled={kicking === player.name} className="px-3 py-1.5 text-xs font-semibold text-app-red hover:bg-app-red-bg rounded-lg transition-colors disabled:opacity-40">
                {kicking === player.name ? t('management.buttons.kicking') : t('management.buttons.kick')}
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={kickConfirm !== null}
        title={t('management.confirm.kickTitle')}
        message={`${t('management.confirm.kickMessage')} "${kickConfirm?.name}"?`}
        confirmLabel={t('management.buttons.kick')}
        variant="danger"
        onConfirm={() => kickConfirm && handleKick(kickConfirm)}
        onCancel={() => setKickConfirm(null)}
      />
    </div>
  );
}
