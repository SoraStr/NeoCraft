import { useEffect, useState } from 'react';
import type { SmpClient } from '../../lib/smp-client';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { ErrorBanner } from '../ui/ErrorBanner';
import { EmptyState } from '../ui/EmptyState';
import { ConfirmDialog } from './ConfirmDialog';

interface AllowlistTabProps {
  client: SmpClient;
}

interface AllowlistEntry {
  player: string;
  name?: string;
}

export function AllowlistTab({ client }: AllowlistTabProps) {
  const [entries, setEntries] = useState<AllowlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchList = async () => {
    try {
      const result = (await client.call('allowlist/list')) as AllowlistEntry[];
      setEntries(Array.isArray(result) ? result : []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch allowlist.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, [client]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setActionError(null);
    try {
      await client.call('allowlist/add', [{ player: name }]);
      setNewName('');
      await fetchList();
    } catch (err: any) {
      setActionError(err.message || 'Failed to add player.');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (entry: AllowlistEntry) => {
    const name = entry.player || entry.name || '';
    setRemoving(name);
    setActionError(null);
    try {
      await client.call('allowlist/remove', [{ player: name }]);
      await fetchList();
    } catch (err: any) {
      setActionError(err.message || 'Failed to remove player.');
    } finally {
      setRemoving(null);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    setActionError(null);
    try {
      await client.call('allowlist/clear');
      await fetchList();
    } catch (err: any) {
      setActionError(err.message || 'Failed to clear allowlist.');
    } finally {
      setClearing(false);
      setClearConfirm(false);
    }
  };

  const playerName = (e: AllowlistEntry) => e.player || e.name || 'Unknown';

  if (loading) return <LoadingSkeleton lines={4} />;
  if (error) return <ErrorBanner message={error} onRetry={fetchList} />;

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-app-text">
          Allowlist ({entries.length})
        </h3>
        <button
          onClick={fetchList}
          className="text-xs font-medium text-app-text-muted hover:text-app-accent transition-colors"
        >
          Refresh
        </button>
      </div>

      {actionError && (
        <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
      )}

      {/* Add form */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Player name..."
          className="flex-1 px-3 py-2 rounded-lg bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus text-sm outline-none transition-colors"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button
          onClick={handleAdd}
          disabled={!newName.trim() || adding}
          className="px-4 py-2 bg-app-accent hover:bg-app-accent-hover disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          {adding ? 'Adding...' : 'Add'}
        </button>
      </div>

      {/* Clear all */}
      {entries.length > 0 && (
        <button
          onClick={() => setClearConfirm(true)}
          disabled={clearing}
          className="text-xs font-medium text-app-red hover:underline transition-colors"
        >
          Clear All
        </button>
      )}

      {entries.length === 0 ? (
        <EmptyState title="Allowlist is empty" description="Add players to restrict server access." />
      ) : (
        <div className="rounded-xl bg-app-surface border border-app-border divide-y divide-app-border-light">
          {entries.map((entry, i) => (
            <div
              key={playerName(entry) || i}
              className="flex items-center justify-between px-4 py-2.5"
            >
              <span className="text-sm font-medium text-app-text">
                {playerName(entry)}
              </span>
              <button
                onClick={() => handleRemove(entry)}
                disabled={removing === playerName(entry)}
                className="px-3 py-1 text-xs font-medium text-app-red hover:bg-app-red-bg rounded-lg transition-colors disabled:opacity-40"
              >
                {removing === playerName(entry) ? 'Removing...' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={clearConfirm}
        title="Clear Allowlist"
        message={`Are you sure you want to remove all ${entries.length} entries from the allowlist?`}
        confirmLabel="Clear All"
        variant="danger"
        onConfirm={handleClear}
        onCancel={() => setClearConfirm(false)}
      />
    </div>
  );
}
