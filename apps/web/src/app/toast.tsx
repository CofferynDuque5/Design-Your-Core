import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
  action?: { label: string; run: () => void };
}

type Show = (message: string, opts?: { tone?: Toast['tone']; action?: Toast['action'] }) => void;

const ToastContext = createContext<Show | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback<Show>(
    (message, opts = {}) => {
      const id = next.current++;
      setToasts((t) => [...t.slice(-2), { id, message, tone: opts.tone ?? 'info', action: opts.action }]);
      window.setTimeout(() => dismiss(id), opts.action ? 7000 : 4000);
    },
    [dismiss],
  );

  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.tone === 'error' ? ' toast--error' : ''}`} role={t.tone === 'error' ? 'alert' : undefined}>
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  t.action?.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Show {
  const v = useContext(ToastContext);
  if (!v) throw new Error('useToast fuera de ToastProvider');
  return v;
}
