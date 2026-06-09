import { Server } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-20 animate-fade-in">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-app-border-light mb-5">
        <Server className="w-6 h-6 text-app-text-muted" />
      </div>
      <p className="text-base font-semibold text-app-text mb-1.5">{title}</p>
      {description && <p className="text-sm text-app-text-secondary mb-5 max-w-sm mx-auto">{description}</p>}
      {action && (
        <button onClick={action.onClick} className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-app-accent hover:bg-app-accent-hover text-white rounded-lg text-sm font-semibold transition-colors shadow-sm">
          <Server className="w-4 h-4" />
          {action.label}
        </button>
      )}
    </div>
  );
}
