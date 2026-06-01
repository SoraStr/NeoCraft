import { useEffect, useState } from 'react';
import type { SmpClient } from '../../lib/smp-client';
import type { UserBanDto } from '../../lib/types';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { ErrorBanner } from '../ui/ErrorBanner';
import { EmptyState } from '../ui/EmptyState';
import { ConfirmDialog } from './ConfirmDialog';

interface BanTabProps {
  client: SmpClient;
}

export function BanTab({ client }: BanTabProps) {
  const [bans, setBans] = useState<UserBanDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [reason, setReason] = useState('');
  const [expires, setExpires] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchBans = async () => {
    try {
      const result = (await client.call('bans/list')) as UserBanDto[];
      setBans(Array.isArray(result) ? result : []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch bans.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBans();
  }, [client]);

  const handleAdd = async () => {
    const name = playerName.trim();
    if (!name) return;
    setAdding(true);
    setActionError(null);
    try {
      const params: any = { player: name };
      if (reason.trim()) params.reason = reason.trim();
      if (expires.trim()) params.expires = expires.trim();
      await client.call('bans/add', [params]);
      setPlayerName('');
      setReason('');
      setExpires('');
      await fetchBans();
    } catch (err: any) {
      setActionError(err.message || 'Failed to add ban.');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (ban: UserBanDto) => {
    const name = ban.player?.name || '';
    setRemoving(name);
    setActionError(null);
    try {
      await client.call('bans/remove', [{ player: name }]);
      await fetchBans();
    } catch (err: any) {
      setActionError(err.message || 'Failed to remove ban.');
    } finally {
      setRemoving(null);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    setActionError(null);
    try {
      await client.call('bans/clear');
      await fetchBans();
    } catch (err: any) {
      setActionError(err.message || 'Failed to clear bans.');
    } finally {
      setClearing(false);
      setClearConfirm(false);
    }
  };

  if (loading) return <LoadingSkeleton lines={4} />;
  if (error) return <ErrorBanner message={error} onRetry={fetchBans} />;

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-app-text">
          Player Bans ({bans.length})
        </h3>
        <button
          onClick={fetchBans}
          className="text-xs font-medium text-app-text-muted hover:text-app-accent transition-colors"
        >
          Refresh
        </button>
      </div>

      {actionError && (
        <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
      )}

      {/* Add ban form */}
      <div className="rounded-xl bg-app-surface border border-app-border p-4 space-y-3">
        <h4 className="text-xs font-semibold text-app-text-muted uppercase tracking-wider">
          Add Ban
        </h4>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Player name"
            className="flex-1 min-w-[120px] px-3 py-2 rounded-lg bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus text-sm outline-none transition-colors"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            className="flex-1 min-w-[120px] px-3 py-2 rounded-lg bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus text-sm outline-none transition-colors"
          />
          <input
            type="text"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
            placeholder="Expires (optional)"
            className="w-40 px-3 py-2 rounded-lg bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus text-sm outline-none transition-colors"
          />
          <button
            onClick={handleAdd}
            disabled={!playerName.trim() || adding}
            className="px-4 py-2 bg-app-red hover:bg-red-700 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            {adding ? 'Adding...' : 'Ban'}
          </button>
        </div>
      </div>

      {/* Clear all */}
      {bans.length > 0 && (
        <button
          onClick={() => setClearConfirm(true)}
          disabled={clearing}
          className="text-xs font-medium text-app-red hover:underline transition-colors"
        >
          Clear All Bans
        </button>
      )}

      {bans.length === 0 ? (
        <EmptyState title="No bans" description="Banned players will appear here." />
      ) : (
        <div className="rounded-xl bg-app-surface border border-app-border divide-y divide-app-border-light">
          {bans.map((ban, i) => {
            const name = ban.player?.name || 'Unknown';
            return (
              <div key={name + i} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-app-text">{name}</span>
                  <div className="flex gap-3 mt-0.5">
                    {ban.reason && (
                      <span className="text-xs text-app-text-muted">
                        Reason: {ban.reason}
                      </span>
                    )}
                    {ban.expires && (
                      <span className="text-xs text-app-amber">
                        Expires: {ban.expires}
                      </span>
                    )}
                    {ban.source && (
                      <span className="text-xs text-app-text-muted">
                        By: {ban.source}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(ban)}
                  disabled={removing === name}
                  className="px-3 py-1.5 text-xs font-semibold text-app-accent hover:bg-app-accent-bg rounded-lg transition-colors disabled:opacity-40 flex-shrink-0 ml-2"
                >
                  {removing === name ? 'Pardoning...' : 'Pardon'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={clearConfirm}
        title="Clear All Bans"
        message={`Are you sure you want to remove all ${bans.length} bans?`}
        confirmLabel="Clear All"
        variant="danger"
        onConfirm={handleClear}
        onCancel={() => setClearConfirm(false)}
      />
    </div>
  );
}
