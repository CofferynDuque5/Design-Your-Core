import type { LegacyCheckItem } from '@dyc/core';
import { Trash2 } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';

// Piezas comunes de las herramientas de la tanda 2 (Materias, Proyectos,
// Roadmaps, Cuadernos, Contenido e Ideas).

/** Cifras de cabecera (2 o 3 tarjetas). */
export function Stats({ items }: { items: Array<{ value: ReactNode; label: string }> }) {
  return (
    <div className={`stats${items.length === 2 ? ' stats--2' : ''}`}>
      {items.map((s) => (
        <div key={s.label} className="card stat">
          <span className="stat__value">{s.value}</span>
          <span className="stat__label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Barra de progreso accesible con el color del elemento. */
export function Meter({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div
      className="progress meter"
      style={{ ['--value' as string]: value, ...(color ? { ['--pillar-chart' as string]: color } : {}) }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={label}
    />
  );
}

/** Pide confirmación antes de borrar, dentro del mismo formulario. */
export function ConfirmDelete({ children, onConfirm, onCancel }: { children: ReactNode; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="alert alert--danger stack-sm" role="alert">
      <span>{children}</span>
      <div className="row">
        <button type="button" className="btn btn--danger btn--sm" onClick={onConfirm}>
          Borrar definitivamente
        </button>
        {/* El botón «Borrar» desaparece: el foco pasa aquí para no perderse (y Enter no borra por accidente). */}
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel} autoFocus>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Botones de un formulario de edición: guardar y, si se puede, borrar con confirmación. */
export function FormActions({ submitLabel, disabled, onDelete, confirm }: { submitLabel: string; disabled?: boolean; onDelete?: () => void; confirm?: ReactNode }) {
  const [asking, setAsking] = useState(false);
  if (asking && onDelete) {
    return (
      <ConfirmDelete onConfirm={onDelete} onCancel={() => setAsking(false)}>
        {confirm}
      </ConfirmDelete>
    );
  }
  return (
    <div className="form-actions">
      {onDelete && (
        <button type="button" className="btn btn--ghost danger-text" onClick={() => setAsking(true)}>
          <Trash2 size={16} aria-hidden="true" /> Borrar
        </button>
      )}
      <button type="submit" className="btn" disabled={disabled}>
        {submitLabel}
      </button>
    </div>
  );
}

/**
 * Lista con casillas de temas o hitos. Cada cambio devuelve la lista completa,
 * que se guarda con un PATCH del elemento que la contiene.
 */
export function CheckList<T extends LegacyCheckItem>({
  id,
  items,
  onChange,
  owner,
  noun,
  listLabel,
  placeholder,
  make,
}: {
  id: string;
  items: T[];
  onChange: (next: T[]) => void;
  /** Nombre del elemento que las contiene, para las etiquetas. */
  owner: string;
  /** "tema", "hito"… */
  noun: string;
  listLabel: string;
  placeholder: string;
  make: (name: string) => T;
}) {
  const [name, setName] = useState('');
  const inputId = useId();
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onChange([...items, make(name.trim())]);
    setName('');
  };
  return (
    <div id={id} className="checklist">
      {items.length > 0 && (
        <ul aria-label={`${listLabel} de «${owner}»`}>
          {items.map((it) => (
            <li key={it.id} className={`check-row check-row--sub${it.done ? ' check-row--done' : ''}`}>
              <label className="check-row__label">
                <input type="checkbox" checked={it.done} onChange={() => onChange(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))} />
                <span>{it.name || 'Sin nombre'}</span>
              </label>
              <button type="button" className="icon-btn" onClick={() => onChange(items.filter((x) => x.id !== it.id))} aria-label={`Borrar ${noun} «${it.name}»`}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="inline-add inline-add--sm" onSubmit={add}>
        <label className="visually-hidden" htmlFor={inputId}>
          Nuevo {noun} de «{owner}»
        </label>
        <input id={inputId} className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={300} placeholder={placeholder} />
        <button type="submit" className="btn btn--secondary btn--sm" disabled={!name.trim()}>
          Añadir
        </button>
      </form>
    </div>
  );
}

/** Color guardado si es un hex válido; si no, el de reserva. */
export const safeColor = (c: unknown, fallback: string): string => (typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c) ? c : fallback);

/** Paleta con el color actual añadido si no está en ella (datos antiguos o copiados de una materia). */
export const paletteWith = (palette: readonly string[], color: string): string[] => (palette.some((c) => c.toLowerCase() === color.toLowerCase()) ? [...palette] : [...palette, color]);

/** Opciones de un select con el valor actual añadido si no está en la lista. */
export const optionsWith = (list: readonly string[], value: string): string[] => (!value || list.includes(value) ? [...list] : [...list, value]);
