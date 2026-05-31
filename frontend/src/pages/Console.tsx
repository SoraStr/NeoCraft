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

export default function Console() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useWebSocket();
  const instances = useInstanceStore((s) => s.instances);
  const logs = useInstanceStore((s) => s.logs);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [cmd, setCmd] = useState('');
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [sending, setSending] = useState(false);

  const instance = instances.find((i) => i.id === id);
  const instanceLogs = id ? logs[id] || [] : [];
  const isRunning = instance?.state === 'running';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      <div className="p-6 text-center text-gray-400">
        <p>{t('console.notFound')}</p>
        <button onClick={() => navigate('/')} className="mt-4 text-blue-400 hover:underline">
          {t('console.backToDashboard')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-300 mb-1">
            {t('console.backToDashboard')}
          </button>
          <h1 className="text-xl font-bold">{instance.name} {t('console.title')}</h1>
        </div>
        <span className={`text-sm ${isRunning ? 'text-green-400' : 'text-gray-400'}`}>
          {t(`console.state.${instance.state}`)}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto bg-black rounded-lg border border-gray-700 p-4 font-mono text-sm mb-3">
        {instanceLogs.length === 0 ? (
          <p className="text-gray-600">{t('console.waitingOutput')}</p>
        ) : (
          instanceLogs.map((entry, i) => (
            <div key={i} className="text-gray-300 leading-relaxed whitespace-pre-wrap break-all">
              {entry.line}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Command input bar */}
      <div className="flex gap-2">
        <span className="flex items-center text-gray-500 font-mono text-sm">›</span>
        <input
          ref={inputRef}
          type="text"
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isRunning ? '输入命令...' : '服务器未运行'}
          disabled={!isRunning || sending}
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm font-mono outline-none focus:border-blue-500 disabled:opacity-40 text-gray-200"
          autoFocus
        />
        <button
          onClick={handleSend}
          disabled={!isRunning || sending || !cmd.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded text-sm font-medium transition-colors"
        >
          发送
        </button>
      </div>
    </div>
  );
}
