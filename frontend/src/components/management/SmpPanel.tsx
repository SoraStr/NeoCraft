interface SmpPanelProps {
  instanceId: string;
}

/* ── Inline SVG icons ── */

function IconCpu({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <rect x="5.5" y="1.5" width="5" height="2" fill="currentColor" opacity="0.6" />
      <rect x="5.5" y="12.5" width="5" height="2" fill="currentColor" opacity="0.6" />
      <rect x="1.5" y="5.5" width="2" height="5" fill="currentColor" opacity="0.6" />
      <rect x="12.5" y="5.5" width="2" height="5" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

export default function SmpPanel({ instanceId }: SmpPanelProps) {
  return (
    <div className="rounded-xl bg-app-surface border border-app-border p-8 animate-slide-up">
      <div className="flex flex-col items-center text-center max-w-sm mx-auto">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-app-green-bg mb-4">
          <IconCpu className="w-6 h-6 text-app-green" />
        </div>
        <h2 className="text-lg font-bold text-app-text mb-2">SMP Management</h2>
        <p className="text-sm text-app-text-secondary">
          Minecraft SMP protocol management for {instanceId}. Player list, chat, and server controls will appear here.
        </p>
      </div>
    </div>
  );
}
