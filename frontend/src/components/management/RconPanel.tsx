import { useState, useRef, useEffect, useCallback } from 'react';
import { useInstanceStore } from '../../stores/instanceStore';
import { sendRconCommand } from '../../lib/api';

/* ── Types ── */

interface RconPanelProps {
  instanceId: string;
}

interface OutputLine {
  type: 'sent' | 'response' | 'error';
  text: string;
}

interface ActionParam {
  name: string;
  label: string;
  type: 'text' | 'select';
  options?: string[];
  optional?: boolean;
}

interface QuickAction {
  id: string;
  label: string;
  description: string;
  command: string;
  params: ActionParam[];
}

const HISTORY_KEY = 'neocraft-rcon-history';

/* ── Icons ── */

function IconTerminal({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 6.5l2 1.5-2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 10.5h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconZap({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8.5 1.5L3 9h3.5l-1 5.5L13 7H9.5l1-5.5H8.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
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

function IconClose({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconUsers({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="6" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.5 13c0-2 1.5-3.5 3.5-3.5s3.5 1.5 3.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="11.5" cy="5.5" r="1.3" stroke="currentColor" strokeWidth="1.2" />
      <path d="M9 9c1.2 0 2.3.8 2.8 1.9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconBan({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconStar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5l1.8 3.6 4 .6-2.9 2.8.7 4L8 10.7l-3.6 1.8.7-4-2.9-2.8 4-.6L8 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function IconSliders({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="4" cy="4" r="1.5" fill="currentColor" />
      <path d="M1 4h1.5M5.5 4H15" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12" cy="8" r="1.5" fill="currentColor" />
      <path d="M1 8h9M13.5 8H15" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="6" cy="12" r="1.5" fill="currentColor" />
      <path d="M1 12h3M7.5 12H15" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function IconMessage({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 3h12v8H5.5L3 13V3z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSave({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 13V3l3-3h9v13H2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M5 1v5h6V1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="4" y="10" width="8" height="3" rx="0.5" fill="currentColor" opacity="0.4" />
      <path d="M5 14v-1.5h6V14" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function IconPlus({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconMinus({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ── Quick Actions Config ── */

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'list',
    label: 'List Players',
    description: 'Show online players',
    command: 'list',
    params: [],
  },
  {
    id: 'kick',
    label: 'Kick',
    description: 'Kick a player',
    command: 'kick',
    params: [
      { name: 'player', label: 'Player Name', type: 'text' },
      { name: 'reason', label: 'Reason', type: 'text', optional: true },
    ],
  },
  {
    id: 'whitelist-add',
    label: 'Whitelist Add',
    description: 'Add to whitelist',
    command: 'whitelist add',
    params: [{ name: 'player', label: 'Player Name', type: 'text' }],
  },
  {
    id: 'whitelist-remove',
    label: 'Whitelist Remove',
    description: 'Remove from whitelist',
    command: 'whitelist remove',
    params: [{ name: 'player', label: 'Player Name', type: 'text' }],
  },
  {
    id: 'ban',
    label: 'Ban',
    description: 'Ban a player',
    command: 'ban',
    params: [
      { name: 'player', label: 'Player Name', type: 'text' },
      { name: 'reason', label: 'Reason', type: 'text', optional: true },
    ],
  },
  {
    id: 'pardon',
    label: 'Pardon',
    description: 'Unban a player',
    command: 'pardon',
    params: [{ name: 'player', label: 'Player Name', type: 'text' }],
  },
  {
    id: 'op',
    label: 'Op',
    description: 'Grant operator',
    command: 'op',
    params: [{ name: 'player', label: 'Player Name', type: 'text' }],
  },
  {
    id: 'deop',
    label: 'Deop',
    description: 'Revoke operator',
    command: 'deop',
    params: [{ name: 'player', label: 'Player Name', type: 'text' }],
  },
  {
    id: 'gamemode',
    label: 'Gamemode',
    description: 'Change game mode',
    command: 'gamemode',
    params: [
      { name: 'mode', label: 'Game Mode', type: 'select', options: ['survival', 'creative', 'adventure', 'spectator'] },
      { name: 'player', label: 'Player Name', type: 'text', optional: true },
    ],
  },
  {
    id: 'say',
    label: 'Say',
    description: 'Broadcast message',
    command: 'say',
    params: [{ name: 'message', label: 'Message', type: 'text' }],
  },
  {
    id: 'save-all',
    label: 'Save All',
    description: 'Save the world',
    command: 'save-all',
    params: [],
  },
];

/* ── Helpers ── */

function loadHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}

function saveHistory(history: string[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-50)));
}

function getActionIcon(id: string, className?: string) {
  const cls = className || 'w-4 h-4';
  switch (id) {
    case 'list': return <IconUsers className={cls} />;
    case 'kick': return <IconBan className={cls} />;
    case 'whitelist-add': return <IconPlus className={cls} />;
    case 'whitelist-remove': return <IconMinus className={cls} />;
    case 'ban': return <IconBan className={cls} />;
    case 'pardon': return <IconCheck className={cls} />;
    case 'op': return <IconStar className={cls} />;
    case 'deop': return <IconStar className={cls} />;
    case 'gamemode': return <IconSliders className={cls} />;
    case 'say': return <IconMessage className={cls} />;
    case 'save-all': return <IconSave className={cls} />;
    default: return <IconZap className={cls} />;
  }
}

function getActionColor(id: string): string {
  switch (id) {
    case 'list': return 'text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100';
    case 'kick': return 'text-red-600 bg-red-50 border-red-200 hover:bg-red-100';
    case 'whitelist-add': return 'text-app-green bg-app-green-bg border-app-accent-border hover:bg-green-100';
    case 'whitelist-remove': return 'text-app-amber bg-app-amber-bg border-amber-200 hover:bg-amber-100';
    case 'ban': return 'text-red-600 bg-red-50 border-red-200 hover:bg-red-100';
    case 'pardon': return 'text-app-green bg-app-green-bg border-app-accent-border hover:bg-green-100';
    case 'op': return 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100';
    case 'deop': return 'text-app-text-secondary bg-app-border-light border-app-border hover:bg-app-sidebar-hover';
    case 'gamemode': return 'text-purple-600 bg-purple-50 border-purple-200 hover:bg-purple-100';
    case 'say': return 'text-sky-600 bg-sky-50 border-sky-200 hover:bg-sky-100';
    case 'save-all': return 'text-app-text-secondary bg-app-border-light border-app-border hover:bg-app-sidebar-hover';
    default: return 'text-app-text-secondary bg-app-border-light border-app-border hover:bg-app-sidebar-hover';
  }
}

/* ── Tab Bar ── */

function TabBar({ active, onChange }: { active: string; onChange: (tab: string) => void }) {
  const tabs = [
    { id: 'console', label: 'Console', icon: IconTerminal },
    { id: 'quick-actions', label: 'Quick Actions', icon: IconZap },
  ];

  return (
    <div className="flex border-b border-app-border mb-4">
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              isActive
                ? 'border-app-accent text-app-accent'
                : 'border-transparent text-app-text-muted hover:text-app-text-secondary'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Dialog ── */

function ActionDialog({
  action,
  onClose,
  onExecute,
  sending,
}: {
  action: QuickAction;
  onClose: () => void;
  onExecute: (command: string) => void;
  sending: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of action.params) {
      init[p.name] = p.type === 'select' && p.options ? p.options[0] : '';
    }
    return init;
  });

  const buildCommand = (): string => {
    const parts = [action.command];
    for (const p of action.params) {
      if (!p.optional || values[p.name].trim()) {
        parts.push(values[p.name].trim());
      }
    }
    return parts.join(' ');
  };

  const isValid = action.params.every((p) => p.optional || values[p.name].trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || sending) return;
    onExecute(buildCommand());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20" />
      <div
        className="relative bg-app-surface rounded-2xl border border-app-border shadow-xl w-full max-w-md mx-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-app-border">
          <div className="flex items-center gap-2.5">
            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-xl border ${getActionColor(action.id).split(' ').slice(0, 3).join(' ')}`}>
              {getActionIcon(action.id, 'w-4 h-4')}
            </span>
            <div>
              <h3 className="text-sm font-bold text-app-text">{action.label}</h3>
              <p className="text-xs text-app-text-muted">{action.description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-app-border-light text-app-text-muted hover:text-app-text-secondary transition-colors"
          >
            <IconClose className="w-4 h-4" />
          </button>
        </div>

        {/* Body + Footer — single form */}
        <form onSubmit={handleSubmit}>
          <div className="px-5 py-4 space-y-3">
            {action.params.map((param) => (
              <div key={param.name}>
                <label className="block text-xs font-semibold text-app-text-secondary mb-1.5">
                  {param.label}
                  {param.optional && <span className="text-app-text-muted font-normal ml-1">(optional)</span>}
                </label>
                {param.type === 'select' && param.options ? (
                  <select
                    value={values[param.name]}
                    onChange={(e) => setValues((v) => ({ ...v, [param.name]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-app-border bg-app-input text-sm text-app-text focus:outline-none focus:border-app-accent focus:bg-app-input-focus transition-colors"
                  >
                    {param.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={values[param.name]}
                    onChange={(e) => setValues((v) => ({ ...v, [param.name]: e.target.value }))}
                    placeholder={param.label}
                    className="w-full px-3 py-2 rounded-xl border border-app-border bg-app-input text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus:border-app-accent focus:bg-app-input-focus transition-colors font-mono"
                  />
                )}
              </div>
            ))}

            {action.params.length === 0 && (
              <p className="text-sm text-app-text-secondary">
                This command takes no parameters. Click Execute to run <code className="px-1.5 py-0.5 rounded bg-app-console-bg text-app-text font-mono text-xs">/{action.command}</code>.
              </p>
            )}

            {/* Preview */}
            <div className="rounded-lg bg-app-console-bg border border-app-border px-3 py-2">
              <p className="text-xs text-app-text-muted mb-0.5">Command preview</p>
              <p className="text-sm font-mono text-app-text">/{buildCommand()}</p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-app-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-app-text-secondary hover:text-app-text hover:bg-app-border-light transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || sending}
              className="inline-flex items-center gap-2 px-5 py-2 bg-app-accent hover:bg-app-accent-hover disabled:opacity-40 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
            >
              {sending ? (
                <span className="animate-pulse-subtle">Sending...</span>
              ) : (
                <>
                  <IconSend className="w-3.5 h-3.5" />
                  Execute
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Console Tab ── */

function ConsoleTab({
  instanceId,
  output,
  onOutput,
  isRunning,
}: {
  instanceId: string;
  output: OutputLine[];
  onOutput: (lines: OutputLine[]) => void;
  isRunning: boolean;
}) {
  const [cmd, setCmd] = useState('');
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll output
  useEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [output.length]);

  const handleSend = async () => {
    const command = cmd.trim();
    if (!command || !instanceId) return;
    setSending(true);
    try {
      onOutput([{ type: 'sent', text: `> ${command}` }]);
      const result = await sendRconCommand(instanceId, command);
      if (result) {
        onOutput([{ type: 'response', text: result }]);
      }
      const newHistory = [...history, command];
      setHistory(newHistory);
      saveHistory(newHistory);
      setCmd('');
      setHistoryIdx(-1);
    } catch (err: any) {
      onOutput([{ type: 'error', text: `Error: ${err.message}` }]);
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

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Output */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto rounded-xl bg-app-console-bg border border-app-border p-4 font-mono text-sm mb-3 min-h-[300px]"
      >
        {output.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-app-text-muted">
            <IconTerminal className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-xs">RCON console ready. Type a command to begin.</p>
          </div>
        ) : (
          output.map((entry, i) => (
            <div
              key={i}
              className={`leading-relaxed whitespace-pre-wrap break-all mb-0.5 ${
                entry.type === 'sent'
                  ? 'text-app-accent'
                  : entry.type === 'error'
                    ? 'text-app-red'
                    : 'text-app-text'
              }`}
            >
              {entry.text}
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2 flex-shrink-0">
        <div className="flex-1 flex items-center gap-2 bg-app-input rounded-xl border-2 border-app-border focus-within:border-app-accent focus-within:bg-app-input-focus transition-colors overflow-hidden">
          <span className="pl-3.5 text-app-accent font-mono text-sm select-none font-bold">/</span>
          <input
            ref={inputRef}
            type="text"
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRunning ? 'Enter RCON command...' : 'Server not running'}
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
          Send
        </button>
      </div>

      {/* Running indicator */}
      <div className="flex items-center gap-2 mt-2 flex-shrink-0">
        <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-app-green' : 'bg-app-text-muted'}`} />
        <span className="text-xs text-app-text-muted">
          {isRunning ? 'RCON connected' : 'Server offline — RCON unavailable'}
        </span>
      </div>
    </div>
  );
}

/* ── Quick Actions Tab ── */

function QuickActionsTab({
  instanceId,
  onOutput,
  isRunning,
}: {
  instanceId: string;
  onOutput: (lines: OutputLine[]) => void;
  isRunning: boolean;
}) {
  const [dialogAction, setDialogAction] = useState<QuickAction | null>(null);
  const [sending, setSending] = useState(false);

  const executeAction = async (command: string) => {
    if (!instanceId) return;
    setSending(true);
    onOutput([{ type: 'sent', text: `> ${command}` }]);
    try {
      const result = await sendRconCommand(instanceId, command);
      onOutput([{ type: 'response', text: result || '(no output)' }]);
    } catch (err: any) {
      onOutput([{ type: 'error', text: `Error: ${err.message}` }]);
    } finally {
      setSending(false);
      setDialogAction(null);
    }
  };

  const handleActionClick = (action: QuickAction) => {
    if (!isRunning) return;
    if (action.params.length === 0) {
      // Execute directly without dialog
      executeAction(action.command);
    } else {
      setDialogAction(action);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <IconZap className="w-4 h-4 text-app-text-muted" />
        <p className="text-sm text-app-text-secondary">Click a button to run a preset RCON command. Buttons with parameters will open a dialog.</p>
      </div>

      {/* Action Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.id}
            onClick={() => handleActionClick(action)}
            disabled={!isRunning}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed ${getActionColor(action.id)}`}
          >
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/60">
              {getActionIcon(action.id, 'w-5 h-5')}
            </span>
            <div className="text-center">
              <p className="text-sm font-semibold">{action.label}</p>
              <p className="text-xs opacity-70">{action.description}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Output preview */}
      <div className="mt-4 p-3 rounded-xl bg-app-console-bg border border-app-border">
        <p className="text-xs text-app-text-muted mb-1">Quick action results appear here and in the Console tab.</p>
      </div>

      {/* Dialog */}
      {dialogAction && (
        <ActionDialog
          action={dialogAction}
          onClose={() => setDialogAction(null)}
          onExecute={(cmd) => executeAction(cmd)}
          sending={sending}
        />
      )}
    </div>
  );
}

/* ── Main RconPanel ── */

export default function RconPanel({ instanceId }: RconPanelProps) {
  const instances = useInstanceStore((s) => s.instances);
  const instance = instances.find((i) => i.id === instanceId);
  const isRunning = instance?.state === 'running';

  const [activeTab, setActiveTab] = useState('console');
  const [output, setOutput] = useState<OutputLine[]>([]);

  const handleOutput = useCallback((lines: OutputLine[]) => {
    setOutput((prev) => [...prev, ...lines]);
  }, []);

  const clearOutput = () => setOutput([]);

  return (
    <div className="rounded-xl bg-app-surface border border-app-border animate-slide-up flex flex-col" style={{ minHeight: '500px' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-0">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-blue-50">
            <IconTerminal className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-app-text">RCON Management</h2>
            <p className="text-xs text-app-text-muted">
              {isRunning ? 'Connected — send commands to the Minecraft server' : 'Server is offline'}
            </p>
          </div>
        </div>
        <button
          onClick={clearOutput}
          className="px-3 py-1.5 text-xs font-medium text-app-text-muted hover:text-app-text-secondary hover:bg-app-border-light rounded-lg transition-colors"
        >
          Clear Output
        </button>
      </div>

      {/* Tabs */}
      <div className="px-5 mt-4">
        <TabBar active={activeTab} onChange={setActiveTab} />
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 min-h-0 px-5 pb-5">
        {activeTab === 'console' ? (
          <ConsoleTab instanceId={instanceId} output={output} onOutput={handleOutput} isRunning={isRunning} />
        ) : (
          <QuickActionsTab instanceId={instanceId} onOutput={handleOutput} isRunning={isRunning} />
        )}
      </div>
    </div>
  );
}
