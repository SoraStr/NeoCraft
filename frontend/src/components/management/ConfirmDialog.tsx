interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const confirmColors =
    variant === 'danger'
      ? 'bg-app-red hover:bg-red-700 text-white'
      : variant === 'warning'
        ? 'bg-app-amber hover:bg-amber-700 text-white'
        : 'bg-app-accent hover:bg-app-accent-hover text-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 animate-fade-in" onClick={onCancel} />

      {/* Dialog */}
      <div className="relative bg-app-surface rounded-2xl border border-app-border shadow-xl p-6 max-w-sm w-full mx-4 animate-slide-up">
        <h3 className="text-lg font-bold text-app-text mb-2">{title}</h3>
        <p className="text-sm text-app-text-secondary mb-6">{message}</p>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-app-text-secondary hover:text-app-text bg-app-input hover:bg-app-border rounded-lg border border-app-border transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors shadow-sm ${confirmColors}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
