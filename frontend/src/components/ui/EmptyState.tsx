interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-20 animate-fade-in">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-app-border-light mb-5">
        <svg className="w-6 h-6 text-app-text-muted" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9 10h6M9 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-base font-semibold text-app-text mb-1.5">{title}</p>
      {description && <p className="text-sm text-app-text-secondary mb-5 max-w-sm mx-auto">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-app-accent hover:bg-app-accent-hover text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 5v10M5 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {action.label}
        </button>
      )}
    </div>
  );
}
