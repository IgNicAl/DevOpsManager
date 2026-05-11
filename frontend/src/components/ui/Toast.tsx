import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  detail?: string;
}

interface ToastApi {
  push: (msg: string, kind?: ToastKind, detail?: string) => void;
  success: (msg: string, detail?: string) => void;
  error: (msg: string, detail?: string) => void;
  info: (msg: string, detail?: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

let _idSeq = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => setItems((curr) => curr.filter((t) => t.id !== id)), []);

  const push = useCallback<ToastApi['push']>((message, kind = 'info', detail) => {
    const id = _idSeq++;
    setItems((curr) => [...curr, { id, kind, message, detail }]);
    window.setTimeout(() => remove(id), 4500);
  }, [remove]);

  const api: ToastApi = {
    push,
    success: (m, d) => push(m, 'success', d),
    error: (m, d) => push(m, 'error', d),
    info: (m, d) => push(m, 'info', d),
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 max-w-sm pointer-events-none">
        {items.map((t) => (
          <ToastItemView key={t.id} item={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

const KIND_STYLE: Record<ToastKind, { icon: string; border: string; iconColor: string }> = {
  success: { icon: 'check_circle', border: 'border-primary', iconColor: 'text-primary' },
  error: { icon: 'error', border: 'border-error', iconColor: 'text-error' },
  info: { icon: 'info', border: 'border-outline', iconColor: 'text-on-surface-variant' },
  warning: { icon: 'warning', border: 'border-tertiary-container', iconColor: 'text-tertiary-container' },
};

function ToastItemView({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const handle = window.setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(handle);
  }, []);
  const style = KIND_STYLE[item.kind];
  return (
    <div
      className={`surface-card border ${style.border} rounded-sm px-3 py-2 shadow-lg flex items-start gap-2 pointer-events-auto transition-all duration-200 ${
        visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-3'
      }`}
    >
      <span className={`material-symbols-outlined text-[20px] ${style.iconColor} flex-shrink-0`}>{style.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-data-md text-on-surface">{item.message}</div>
        {item.detail && <div className="text-label-xs text-on-surface-variant break-all">{item.detail}</div>}
      </div>
      <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface flex-shrink-0">
        <span className="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>
  );
}
