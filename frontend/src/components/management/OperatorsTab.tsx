import { useEffect, useState } from 'react';
import type { SmpClient } from '../../lib/smp-client';
import type { OperatorDto } from '../../lib/types';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { ErrorBanner } from '../ui/ErrorBanner';
import { EmptyState } from '../ui/EmptyState';

interface OperatorsTabProps {
  client: SmpClient;
}

const PERMISSION_LEVELS = [
  { value: 1, label: '1 — Bypass spawn protection' },
  { value: 2, label: '2 — Command blocks + level 1' },
  { value: 3, label: '3 — Manage players (host)' },
  { value: 4, label: '4 — All commands (admin)' },
];

export function OperatorsTab({ client }: OperatorsTabProps) {
  const [operators, setOperators] = useState<OperatorDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [permissionLevel, setPermissionLevel] = useState(4);
  const [bypassesLimit, setBypassesLimit] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchOperators = async () => {
    try {
      const result = (await client.call('operators/list')) as OperatorDto[];
      setOperators(Array.isArray(result) ? result : []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch operators.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOperators();
  }, [client]);

  const handleAdd = async () => {
    const name = playerName.trim();
    if (!name) return;
    setAdding(true);
    setActionError(null);
    try {
      await client.call('operators/add', [
        {
          player: name,
          permissionLevel,
          bypassesPlayerLimit: bypassesLimit,
        },
      ]);
      setPlayerName('');
      await fetchOperators();
    } catch (err: any) {
      setActionError(err.message || 'Failed to add operator.');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (op: OperatorDto) => {
    const name = op.player?.name || '';
    setRemoving(name);
    setActionError(null);
    try {
      await client.call('operators/remove', [{ player: name }]);
      await fetchOperators();
    } catch (err: any) {
      setActionError(err.message || 'Failed to remove operator.');
    } finally {
      setRemoving(null);
    }
  };

  if (loading) return <LoadingSkeleton lines={4} />;
  if (error) return <ErrorBanner message={error} onRetry={fetchOperators} />;

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-app-text">
          Operators ({operators.length})
        </h3>
        <button
          onClick={fetchOperators}
          className="text-xs font-medium text-app-text-muted hover:text-app-accent transition-colors"
        >
          Refresh
        </button>
      </div>

      {actionError && (
        <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
      )}

      {/* Add form */}
      <div className="rounded-xl bg-app-surface border border-app-border p-4 space-y-3">
        <h4 className="text-xs font-semibold text-app-text-muted uppercase tracking-wider">
          Add Operator
        </h4>
        <div className="flex flex-wrap items-end gap-2">
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Player name"
            className="flex-1 min-w-[140px] px-3 py-2 rounded-lg bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus text-sm outline-none transition-colors"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <div className="flex flex-col gap-1">
            <label className="text-xs text-app-text-muted">Level</label>
            <select
              value={permissionLevel}
              onChange={(e) => setPermissionLevel(Number(e.target.value))}
              className="px-3 py-2 rounded-lg bg-app-input border border-app-border focus:border-app-accent text-sm outline-none transition-colors"
            >
              {PERMISSION_LEVELS.map((pl) => (
                <option key={pl.value} value={pl.value}>
                  {pl.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <input
              type="checkbox"
              id="bypasses-limit"
              checked={bypassesLimit}
              onChange={(e) => setBypassesLimit(e.target.checked)}
              className="w-4 h-4 rounded border-app-border text-app-accent focus:ring-app-accent"
            />
            <label htmlFor="bypasses-limit" className="text-xs text-app-text-secondary cursor-pointer select-none">
              Bypass player limit
            </label>
          </div>
          <button
            onClick={handleAdd}
            disabled={!playerName.trim() || adding}
            className="px-4 py-2 bg-app-accent hover:bg-app-accent-hover disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            {adding ? 'Adding...' : 'Add OP'}
          </button>
        </div>
      </div>

      {operators.length === 0 ? (
        <EmptyState title="No operators" description="Server operators will appear here." />
      ) : (
        <div className="rounded-xl bg-app-surface border border-app-border divide-y divide-app-border-light">
          {operators.map((op, i) => {
            const name = op.player?.name || 'Unknown';
            const level = op.permissionLevel ?? 0;
            return (
              <div key={name + i} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-app-text">{name}</span>
                  <div className="flex gap-3 mt-0.5">
                    <span className="text-xs text-app-text-muted">
                      Level: {level}
                    </span>
                    {op.bypassesPlayerLimit && (
                      <span className="text-xs text-app-green font-medium">
                        Bypasses limit
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(op)}
                  disabled={removing === name}
                  className="px-3 py-1.5 text-xs font-semibold text-app-red hover:bg-app-red-bg rounded-lg transition-colors disabled:opacity-40 flex-shrink-0 ml-2"
                >
                  {removing === name ? 'Removing...' : 'Deop'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
