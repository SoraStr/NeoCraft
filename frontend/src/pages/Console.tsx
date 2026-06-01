import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInstanceStore } from '../stores/instanceStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { sendCommand } from '../lib/api';

const HISTORY_KEY = 'neocraft-command-history';

function loadHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}

function saveHistory(history: string[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-50)));
}

/* ── Icons ── */

function IconBack({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSend({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M14 2L3 7.5l4 2M14 2L8.5 13 7 9.5M14 2L7 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconTerminal({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 6.5l2 1.5-2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 10.5h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/* ── Console ── */

export default function Console() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useWebSocket();
  const instances = useInstanceStore((s) => s.instances);
  const logs = useInstanceStore((s) => s.logs);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [cmd, setCmd] = useState('');
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [sending, setSending] = useState(false);

  const instance = instances.find((i) => i.id === id);
  const instanceLogs = id ? logs[id] || [] : [];
  const isRunning = instance?.state === 'running';

  // Auto-scroll using scrollTop (not scrollIntoView — avoids disrupting outer scroll)
  useEffect(() => {
    const el = logContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [instanceLogs.length]);

  const handleSend = async () => {
    const command = cmd.trim();
    if (!command || !id) return;
    setSending(true);
    try {
      await sendCommand(id, command);
      const newHistory = [...history, command];
      setHistory(newHistory);
      saveHistory(newHistory);
      setCmd('');
      setHistoryIdx(-1);
    } catch {
      // Error shown in command output if needed
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { handleSend(); return; }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const idx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(idx);
      setCmd(history[idx]);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx === -1) return;
      const idx = historyIdx + 1;
      if (idx >= history.length) { setHistoryIdx(-1); setCmd(''); }
      else { setHistoryIdx(idx); setCmd(history[idx]); }
    }
  };

  if (!instance) {
    return (
      <div className="p-8 text-center animate-fade-in">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-app-border-light mb-4">
          <IconTerminal className="w-6 h-6 text-app-text-muted" />
        </div>
        <p className="text-app-text-secondary mb-4">{t('console.notFound')}</p>
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-app-accent hover:text-app-accent-hover transition-colors"
        >
          <IconBack className="w-3.5 h-3.5" />
          {t('console.backToDashboard')}
        </button>
      </div>
    );
  }

  const stateBg = isRunning ? 'bg-app-green' : 'bg-app-text-muted';

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1 text-sm text-app-text-muted hover:text-app-text-secondary transition-colors mb-1"
          >
            <IconBack className="w-3 h-3" />
            {t('console.backToDashboard')}
          </button>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-app-text">{instance.name}</h1>
            <span className="text-app-text-muted font-medium text-lg">{t('console.title')}</span>
          </div>
        </div>
        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${
          isRunning ? 'bg-app-green-bg text-app-green' : 'bg-app-border-light text-app-text-secondary'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${stateBg}`} />
          {t(`console.state.${instance.state}`)}
        </span>
      </div>

      {/* Log output */}
      <div
        ref={logContainerRef}
        className="flex-1 overflow-y-auto rounded-xl bg-app-console-bg border border-app-border p-4 font-mono text-sm mb-3"
      >
        {instanceLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-app-text-muted text-sm">{t('console.waitingOutput')}</p>
          </div>
        ) : (
          instanceLogs.map((entry, i) => (
            <div key={i} className="text-app-text leading-relaxed whitespace-pre-wrap break-all">
              {entry.line}
            </div>
          ))
        )}
      </div>

      {/* Command input */}
      <div className="flex gap-2 flex-shrink-0">
        <div className="flex-1 flex items-center gap-2 bg-app-input rounded-xl border-2 border-app-border focus-within:border-app-accent focus-within:bg-app-input-focus transition-colors overflow-hidden">
          <span className="pl-3.5 text-app-text-muted font-mono text-sm select-none">›</span>
          <input
            ref={inputRef}
            type="text"
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRunning ? '输入命令...' : '服务器未运行'}
            disabled={!isRunning || sending}
            className="flex-1 bg-transparent py-2.5 pr-3.5 text-sm font-mono outline-none text-app-text placeholder:text-app-text-muted disabled:opacity-40"
            autoFocus
          />
        </div>
        <button
          onClick={handleSend}
          disabled={!isRunning || sending || !cmd.trim()}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-app-accent hover:bg-app-accent-hover disabled:opacity-40 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
        >
          <IconSend className="w-4 h-4" />
          发送
        </button>
      </div>
    </div>
  );
}
