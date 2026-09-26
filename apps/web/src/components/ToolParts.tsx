import { daysLabel, monthLabel, toggleWeekday, WEEKDAY_LONG_NAMES, WEEKDAYS, type LegacyCheckItem } from '@dyc/core';
import { ChevronLeft, ChevronRight, Info, Trash2 } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';

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

// Colores y opciones con el valor guardado incluido: viven en @dyc/core (los comparte el móvil).
export { optionsWith, paletteWith, safeColor } from '@dyc/core';

// ---------- Tanda 3 ----------

/** Días de la semana como en la app anterior ("1234567", 1 = lunes). Nunca deja la lista vacía. */
export function WeekdayPicker({ legend, value, onChange, hint }: { legend: string; value: string; onChange: (days: string) => void; hint?: ReactNode }) {
  const toggle = (iso: string) => {
    const next = toggleWeekday(value, iso);
    if (next !== value) onChange(next);
  };
  return (
    <fieldset className="field">
      <legend className="field__label">{legend}</legend>
      <div className="weekday-picker">
        {WEEKDAYS.map((w, i) => (
          <label key={w.iso} className="chip-radio">
            <input type="checkbox" checked={value.includes(w.iso)} onChange={() => toggle(w.iso)} />
            <span>
              <span aria-hidden="true">{w.label}</span>
              <span className="visually-hidden">{WEEKDAY_LONG_NAMES[i]}</span>
            </span>
          </label>
        ))}
      </div>
      <span className="field__hint">{hint ?? daysLabel(value)}</span>
    </fieldset>
  );
}

/** Ánimo con emoji (radios). Pulsar el elegido lo quita (se guarda ""). */
export function MoodPicker({ legend, moods, value, onChange, hideLegend }: { legend: string; moods: ReadonlyArray<{ emoji: string; label: string }>; value: string; onChange: (mood: string) => void; hideLegend?: boolean }) {
  const name = useId();
  const known = moods.some((m) => m.emoji === value);
  return (
    <fieldset className="field">
      <legend className={hideLegend ? 'visually-hidden' : 'field__label'}>{legend}</legend>
      <div className="mood-picker">
        {[...moods, ...(value && !known ? [{ emoji: value, label: 'Guardado antes' }] : [])].map((m) => (
          <label key={m.emoji} className="mood-option" title={m.label}>
            <input type="radio" name={name} checked={value === m.emoji} onChange={() => onChange(m.emoji)} onClick={() => value === m.emoji && onChange('')} />
            <span className="emoji" aria-hidden="true">{m.emoji}</span>
            <span className="mood-option__label">{m.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Recuerda que el check-in diario registra aparte actividad, sueño y notas (no se mezclan en esta tanda). */
export function CheckInNote({ children }: { children: ReactNode }) {
  return (
    <p className="checkin-note small">
      <Info size={16} aria-hidden="true" />
      <span>
        {children} <Link to="/check-in">Ir al check-in</Link>
      </span>
    </p>
  );
}

/** Navegación por meses con el título en una región viva. */
export function MonthNav({ month, onChange, current, titleId }: { month: string; onChange: (month: string) => void; current: string; titleId: string }) {
  const shift = (n: number) => {
    const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1));
    onChange(d.toISOString().slice(0, 10));
  };
  return (
    <div className="month-nav">
      <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Mes anterior">
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <h2 id={titleId} className="section-title" aria-live="polite">
        {monthLabel(month)}
      </h2>
      <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Mes siguiente">
        <ChevronRight size={20} aria-hidden="true" />
      </button>
      {month.slice(0, 7) !== current.slice(0, 7) && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange(`${current.slice(0, 7)}-01`)}>
          Hoy
        </button>
      )}
    </div>
  );
}
