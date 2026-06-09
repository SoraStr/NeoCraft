import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SmpClient } from '../../lib/smp-client';
import type { UserBanDto } from '../../lib/types';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { ErrorBanner } from '../ui/ErrorBanner';
import { EmptyState } from '../ui/EmptyState';
import { ConfirmDialog } from './ConfirmDialog';

interface BanTabProps { client: SmpClient; }

export function BanTab({ client }: BanTabProps) {
  const { t } = useTranslation();
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
      const result = (await client.call('bans')) as UserBanDto[];
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
      const params: any = { player: { name }, reason: reason.trim() || undefined };
      if (expires.trim()) params.expires = expires.trim();
      await client.call('bans/add', [[params]]);
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
      await client.call('bans/remove', [[{ name }]]);
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
        <h3 className="text-sm font-semibold text-app-text">{t('management.tabs.bans')} ({bans.length})</h3>
        <button onClick={fetchBans} className="text-xs font-medium text-app-text-muted hover:text-app-accent transition-colors">{t('management.buttons.refresh')}</button>
      </div>

      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}

      <div className="rounded-xl bg-app-surface border border-app-border p-4 space-y-3">
        <h4 className="text-xs font-semibold text-app-text-muted uppercase tracking-wider">{t('management.buttons.add')}</h4>
        <div className="flex flex-wrap gap-2">
          <input type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder={t('management.fields.playerName')} className="flex-1 min-w-[120px] px-3 py-2 rounded-lg bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus text-sm outline-none transition-colors" onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('management.fields.reasonOptional')} className="flex-1 min-w-[120px] px-3 py-2 rounded-lg bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus text-sm outline-none transition-colors" />
          <input type="text" value={expires} onChange={(e) => setExpires(e.target.value)} placeholder={t('management.fields.expiresOptional')} className="w-40 px-3 py-2 rounded-lg bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus text-sm outline-none transition-colors" />
          <button onClick={handleAdd} disabled={!playerName.trim() || adding} className="px-4 py-2 bg-app-red hover:bg-red-700 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors">
            {adding ? t('management.buttons.adding') : t('management.buttons.ban')}
          </button>
        </div>
      </div>

      {bans.length > 0 && (
        <button onClick={() => setClearConfirm(true)} disabled={clearing} className="text-xs font-medium text-app-red hover:underline transition-colors">{t('management.buttons.clearAll')}</button>
      )}

      {bans.length === 0 ? (
        <EmptyState title={t('management.status.noBans')} description="" />
      ) : (
        <div className="rounded-xl bg-app-surface border border-app-border divide-y divide-app-border-light">
          {bans.map((ban, i) => {
            const name = ban.player?.name || 'Unknown';
            return (
              <div key={name + i} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0 flex-1"><span className="text-sm font-medium text-app-text">{name}</span>
                  <div className="flex gap-3 mt-0.5">
                    {ban.reason && <span className="text-xs text-app-text-muted">{ban.reason}</span>}
                    {ban.expires && <span className="text-xs text-app-amber">{ban.expires}</span>}
                    {ban.source && <span className="text-xs text-app-text-muted">{ban.source}</span>}
                  </div>
                </div>
                <button onClick={() => handleRemove(ban)} disabled={removing === name} className="px-3 py-1.5 text-xs font-semibold text-app-accent hover:bg-app-accent-bg rounded-lg transition-colors disabled:opacity-40 flex-shrink-0 ml-2">
                  {removing === name ? t('management.buttons.pardoning') : t('management.buttons.pardon')}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog open={clearConfirm} title={t('management.confirm.clearBansTitle')} message={t('management.confirm.clearBansMessage')} confirmLabel={t('management.buttons.clearAll')} variant="danger" onConfirm={handleClear} onCancel={() => setClearConfirm(false)} />
    </div>
  );
}
