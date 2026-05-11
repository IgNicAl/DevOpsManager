import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
}

export default function InlinePopover({ open, onClose, anchorRef, children, align = 'right' }: Props) {
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const popWidth = 240;
    let left = r.right - popWidth;
    if (align === 'left') left = r.left;
    if (align === 'center') left = r.left + r.width / 2 - popWidth / 2;
    setPos({ top: r.bottom + 6, left: Math.max(8, left) });
  }, [open, anchorRef, align]);

  useEffect(() => {
    if (!open) return;
    const onClick = (ev: MouseEvent) => {
      if (popRef.current?.contains(ev.target as Node)) return;
      if (anchorRef.current?.contains(ev.target as Node)) return;
      onClose();
    };
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !pos) return null;
  return (
    <div
      ref={popRef}
      className="fixed z-[150] w-60 surface-card border border-outline-variant rounded-sm shadow-2xl p-3"
      style={{ top: pos.top, left: pos.left }}
    >
      {children}
    </div>
  );
}

interface ConfirmPopoverProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'default';
  loading?: boolean;
}

export function ConfirmPopover({ open, onConfirm, onCancel, anchorRef, message, confirmLabel = 'Confirm', variant = 'danger', loading }: ConfirmPopoverProps) {
  const confirmCls = variant === 'danger'
    ? 'bg-error-container text-on-error-container hover:bg-error'
    : 'bg-primary-container text-on-primary-container hover:bg-primary';
  return (
    <InlinePopover open={open} onClose={onCancel} anchorRef={anchorRef}>
      <div className="text-data-md text-on-surface mb-3">{message}</div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-2 py-1 text-label-xs text-on-surface-variant border border-outline-variant hover:bg-surface-container-highest"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`px-2 py-1 text-label-xs flex items-center gap-1 ${confirmCls}`}
        >
          {loading && <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>}
          {confirmLabel}
        </button>
      </div>
    </InlinePopover>
  );
}
