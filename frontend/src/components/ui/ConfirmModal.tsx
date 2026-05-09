interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  variant?: 'danger' | 'default';
}

export default function ConfirmModal({ open, title, message, onConfirm, onCancel, loading, variant = 'default' }: ConfirmModalProps) {
  if (!open) return null;

  const confirmClass = variant === 'danger'
    ? 'bg-error-container text-on-error-container hover:bg-error'
    : 'bg-primary-container text-on-primary-container hover:bg-primary';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-surface-container border border-outline-variant rounded-md p-6 max-w-md w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <span className={`material-symbols-outlined ${variant === 'danger' ? 'text-error' : 'text-primary'}`}>
            {variant === 'danger' ? 'warning' : 'help'}
          </span>
          <h3 className="text-headline-md text-on-surface">{title}</h3>
        </div>
        <p className="text-body-md text-on-surface-variant mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-1.5 text-data-md text-on-surface-variant border border-outline-variant hover:bg-surface-container-highest transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-1.5 text-data-md transition-colors flex items-center gap-2 ${confirmClass}`}
          >
            {loading && <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>}
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
