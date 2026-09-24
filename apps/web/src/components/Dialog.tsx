import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

/** Diálogo modal con <dialog> nativo: foco atrapado, Esc para cerrar. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);

  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} onClose={onClose} onCancel={onClose}>
      {open && (
        <div className="dialog__body">
          <div className="dialog__header">
            <h3 id={titleId}>{title}</h3>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
