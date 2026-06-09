import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SmpClient } from '../../lib/smp-client';
import type { TypedRule } from '../../lib/types';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { ErrorBanner } from '../ui/ErrorBanner';
import { EmptyState } from '../ui/EmptyState';

interface GamerulesTabProps { client: SmpClient; }

export function GamerulesTab({ client }: GamerulesTabProps) {
  const { t } = useTranslation();
  const [rules, setRules] = useState<TypedRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchRules = async () => {
    try {
      const result = (await client.call('gamerules')) as TypedRule[];
      setRules(Array.isArray(result) ? result : []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch gamerules.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, [client]);

  const handleUpdate = async (rule: TypedRule, newValue: unknown) => {
    setActionError(null);
    setUpdating(rule.key);
    try {
      await client.call('gamerules/update', [{ key: rule.key, value: newValue }]);
      setRules((prev) =>
        prev.map((r) => (r.key === rule.key ? { ...r, value: newValue } : r)),
      );
    } catch (err: any) {
      setActionError(err.message || `Failed to update ${rule.key}.`);
    } finally {
      setUpdating(null);
    }
  };

  const renderInput = (rule: TypedRule) => {
    const isUpdating = updating === rule.key;
    const disabled = isUpdating;

    if (rule.type === 'boolean' || typeof rule.value === 'boolean') {
      return (
        <button onClick={() => handleUpdate(rule, !rule.value)} disabled={disabled}
          className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${rule.value ? 'bg-app-accent' : 'bg-app-border-hover'} ${disabled ? 'opacity-50' : ''}`}
          role="switch" aria-checked={!!rule.value}>
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${rule.value ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      );
    }

    if (rule.type === 'integer' || rule.type === 'number' || typeof rule.value === 'number') {
      return (
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={rule.value != null ? String(rule.value) : '0'}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (!isNaN(val)) handleUpdate(rule, val);
            }}
            disabled={disabled}
            className="w-20 px-2 py-1 rounded-lg bg-app-input border border-app-border focus:border-app-accent text-sm outline-none transition-colors font-mono disabled:opacity-40"
          />
          {isUpdating && (
            <span className="w-3 h-3 border-2 border-app-border border-t-app-accent rounded-full animate-spin" />
          )}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={rule.value != null ? String(rule.value) : ''}
          onChange={(e) => {
            handleUpdate(rule, e.target.value);
          }}
          disabled={disabled}
          className="w-28 px-2 py-1 rounded-lg bg-app-input border border-app-border focus:border-app-accent text-sm outline-none transition-colors font-mono disabled:opacity-40"
        />
        {isUpdating && (
          <span className="w-3 h-3 border-2 border-app-border border-t-app-accent rounded-full animate-spin" />
        )}
      </div>
    );
  };

  const filteredRules = search.trim()
    ? rules.filter((r) => r.key.toLowerCase().includes(search.toLowerCase()))
    : rules;

  if (loading) return <LoadingSkeleton lines={8} />;
  if (error) return <ErrorBanner message={error} onRetry={fetchRules} />;

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-app-text">{t('management.tabs.gamerules')} ({rules.length})</h3>
        <button onClick={fetchRules} className="text-xs font-medium text-app-text-muted hover:text-app-accent transition-colors">{t('management.buttons.refresh')}</button>
      </div>

      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}

      <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('management.fields.searchPlaceholder')} className="w-full max-w-xs px-3 py-2 rounded-lg bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus text-sm outline-none transition-colors" />

      {filteredRules.length === 0 ? (
        <EmptyState title={t('management.status.noGamerules')} description="" />
      ) : (
        <div className="rounded-xl bg-app-surface border border-app-border divide-y divide-app-border-light max-h-[60vh] overflow-y-auto">
          {filteredRules.map((rule) => (
            <div
              key={rule.key}
              className="flex items-center justify-between px-4 py-2.5 hover:bg-app-bg transition-colors"
            >
              <div className="min-w-0 mr-3">
                <span className="text-sm font-medium text-app-text font-mono">
                  {rule.key}
                </span>
                <span className="text-xs text-app-text-muted ml-2">{rule.type}</span>
              </div>
              {renderInput(rule)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
