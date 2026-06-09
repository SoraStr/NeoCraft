import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SmpClient } from '../../lib/smp-client';
import type { PlayerDto } from '../../lib/types';
import { ErrorBanner } from '../ui/ErrorBanner';

interface ChatTabProps {
  client: SmpClient;
  players: PlayerDto[];
}

export function buildSystemMessage(message: string, overlay: boolean, players: PlayerDto[]) {
  return {
    message: { literal: message },
    overlay,
    receivingPlayers: players,
  };
}

export function ChatTab({ client, players }: ChatTabProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [overlay, setOverlay] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed) return;

    setSending(true);
    setError(null);
    setSent(false);

    try {
      if (players.length === 0) {
        setError(t('management.status.noPlayers'));
        return;
      }

      await client.call('server/system_message', { message: buildSystemMessage(trimmed, overlay, players) });
      setMessage('');
      setSent(true);
      setTimeout(() => setSent(false), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-5 max-w-xl">
      <h3 className="text-sm font-semibold text-app-text">{t('management.tabs.chat')}</h3>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Message input */}
      <div>
        <label className="block text-xs font-medium text-app-text-secondary mb-1.5">{t('management.fields.message')}</label>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('management.fields.messagePlaceholder')} rows={3}
          className="w-full px-3 py-2.5 rounded-xl bg-app-input border border-app-border focus:border-app-accent focus:bg-app-input-focus text-sm outline-none transition-colors resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
      </div>

      {/* Overlay toggle */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <button
          onClick={(e) => { e.preventDefault(); setOverlay(!overlay); }}
          className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
            overlay ? 'bg-app-accent' : 'bg-app-border-hover'
          }`}
          role="switch"
          aria-checked={overlay}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              overlay ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
        <span className="text-sm text-app-text-secondary leading-5">{t('management.fields.overlay')}{overlay ? t('management.fields.overlayOnScreen') : t('management.fields.overlayChatOnly')}</span>
      </label>

      {/* Send button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSend}
          disabled={!message.trim() || sending}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-app-accent hover:bg-app-accent-hover disabled:opacity-40 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
        >
          <SendIcon className="w-4 h-4" />
          {sending ? t('management.buttons.sending') : t('management.buttons.send')}
        </button>
        {sent && <span className="text-sm font-semibold text-app-green animate-fade-in">✓</span>}
      </div>

      <p className="text-xs text-app-text-muted">{t('management.action.shortcutHint')}</p>
    </div>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M14 2L3 7.5l4 2M14 2L8.5 13 7 9.5M14 2L7 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
