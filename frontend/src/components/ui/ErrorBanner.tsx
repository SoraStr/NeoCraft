import { AlertCircle, X } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onRetry, retryLabel = 'Retry', onDismiss }: ErrorBannerProps) {
  return (
    <div className="flex items-center justify-between gap-3 p-3.5 rounded-lg bg-app-red-bg border border-red-200 dark:border-red-800 animate-fade-in">
      <div className="flex items-center gap-2.5 min-w-0">
        <AlertCircle className="w-4 h-4 text-app-red flex-shrink-0" />
        <span className="text-sm text-app-red truncate">{message}</span>
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        {onRetry && (
          <button onClick={onRetry} className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-app-surface hover:bg-red-50 dark:hover:bg-app-surface-elevated text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-md transition-colors">
            {retryLabel}
          </button>
        )}
        {onDismiss && (
          <button onClick={onDismiss} className="px-2 py-1.5 text-red-400 hover:text-red-600 transition-colors" aria-label="Dismiss">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
