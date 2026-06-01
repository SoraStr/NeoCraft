interface RconPanelProps {
  instanceId: string;
}

/* ── Inline SVG icons ── */

function IconTerminal({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 6.5l2 1.5-2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 10.5h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export default function RconPanel({ instanceId }: RconPanelProps) {
  return (
    <div className="rounded-xl bg-app-surface border border-app-border p-8 animate-slide-up">
      <div className="flex flex-col items-center text-center max-w-sm mx-auto">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-50 mb-4">
          <IconTerminal className="w-6 h-6 text-blue-600" />
        </div>
        <h2 className="text-lg font-bold text-app-text mb-2">RCON Management</h2>
        <p className="text-sm text-app-text-secondary">
          Minecraft RCON management for {instanceId}. Player management, whitelist, bans, and server controls will appear here.
        </p>
      </div>
    </div>
  );
}
