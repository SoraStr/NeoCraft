interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onRetry, retryLabel = 'Retry', onDismiss }: ErrorBannerProps) {
  return (
    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-red-400">⚠</span>
        <span className="text-sm text-red-300">{message}</span>
      </div>
      <div className="flex gap-2">
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors"
          >
            {retryLabel}
          </button>
        )}
        {onDismiss && (
          <button onClick={onDismiss} className="text-xs text-red-400 hover:text-red-300">
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
