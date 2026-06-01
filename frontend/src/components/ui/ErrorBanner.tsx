interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onRetry, retryLabel = 'Retry', onDismiss }: ErrorBannerProps) {
  return (
    <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-app-red-bg border border-red-200 animate-fade-in">
      <div className="flex items-center gap-2.5 min-w-0">
        <svg className="w-4 h-4 text-app-red flex-shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 6v4.5M10 13.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="text-sm text-red-700 truncate">{message}</span>
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1.5 text-xs font-semibold bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded-lg transition-colors"
          >
            {retryLabel}
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="px-2 py-1.5 text-xs text-red-400 hover:text-red-600 transition-colors"
            aria-label="Dismiss"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none">
              <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
