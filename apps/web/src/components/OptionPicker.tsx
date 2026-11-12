import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { matchesSearch } from '@dyc/core';

/**
 * Elegir una opción tocando su etiqueta o escribir una nueva en el mismo
 * campo. Con `onRename` y `onRemove` también se pueden cambiar de nombre o
 * borrar las opciones guardadas (por ejemplo, un tema de los cursos).
 */
export function OptionPicker({
  label,
  value,
  onChange,
  options,
  counts,
  placeholder,
  maxLength,
  required,
  autoFocus,
  hint,
  newLabel = 'Nueva',
  countLabel = ['uso', 'usos'],
  onRename,
  onRemove,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  /** Cuántas veces se usa cada opción (se muestra al editarlas). */
  counts?: Record<string, number>;
  placeholder?: string;
  maxLength?: number;
  required?: boolean;
  autoFocus?: boolean;
  hint?: ReactNode;
  /** «Nuevo tema», «Nueva academia»… */
  newLabel?: string;
  countLabel?: [string, string];
  onRename?: (from: string, to: string) => void;
  onRemove?: (option: string) => void;
}) {
  const id = useId();
  const [managing, setManaging] = useState(false);
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const list = [...new Map(options.map((o) => o.trim()).filter(Boolean).map((o) => [o.toLocaleLowerCase('es'), o])).values()];
  const typed = value.trim();
  const exact = list.find((o) => o.toLocaleLowerCase('es') === typed.toLocaleLowerCase('es'));
  // Mientras escribes se filtran; si ya elegiste una, se ven todas para poder cambiar.
  const shown = !typed || exact ? list : list.filter((o) => matchesSearch(typed, o));
  const editable = !!(onRename || onRemove) && list.length > 0;
  const managed = counts ? list.filter((o) => (counts[o] ?? 0) > 0) : list;
  const n = (o: string) => counts?.[o] ?? 0;

  const rename = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!renaming || !renaming.to.trim() || !onRename) return;
    onRename(renaming.from, renaming.to.trim());
    if (exact === renaming.from) onChange(renaming.to.trim());
    setRenaming(null);
  };

  return (
    <div className="field opt-picker">
      <div className="opt-picker__head">
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
        {editable && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setManaging((v) => !v)} aria-expanded={managing}>
            {managing ? (
              <>
                <Check size={14} aria-hidden="true" /> Listo
              </>
            ) : (
              <>
                <Pencil size={14} aria-hidden="true" /> Editar opciones
              </>
            )}
          </button>
        )}
      </div>
      <div className="opt-picker__input">
        <input
          id={id}
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          required={required}
          autoFocus={autoFocus}
          autoComplete="off"
          aria-describedby={`${id}-hint`}
        />
        {value && (
          <button type="button" className="icon-btn opt-picker__clear" onClick={() => onChange('')} aria-label={`Borrar lo escrito en ${label}`}>
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      {!managing && (shown.length > 0 || (typed && !exact)) && (
        <div className="opt-picker__chips" role="group" aria-label={`Opciones de ${label}`}>
          {shown.map((o) => {
            const on = exact === o;
            return (
              <button key={o} type="button" className={`opt-chip${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => onChange(on ? '' : o)}>
                {on && <Check size={14} aria-hidden="true" />}
                {o}
              </button>
            );
          })}
          {typed && !exact && (
            <span className="opt-chip opt-chip--new" aria-live="polite">
              <Plus size={14} aria-hidden="true" /> {newLabel}: «{typed}»
            </span>
          )}
        </div>
      )}
      {managing && (
        <ul className="opt-manage" aria-label={`Editar las opciones de ${label}`}>
          {managed.length === 0 && <li className="small muted">Todavía no usas ninguna.</li>}
          {managed.map((o) =>
            renaming?.from === o ? (
              <li key={o} className="opt-manage__row">
                {/* Sin <form>: el selector suele ir dentro de otro formulario. */}
                <div className="opt-manage__rename">
                  <input
                    className="input"
                    value={renaming.to}
                    onChange={(e) => setRenaming({ from: o, to: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') rename(e);
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setRenaming(null);
                      }
                    }}
                    maxLength={maxLength}
                    autoFocus
                    aria-label={`Nuevo nombre de «${o}»`}
                  />
                  <button type="button" className="icon-btn" aria-label="Guardar el nombre" disabled={!renaming.to.trim()} onClick={rename}>
                    <Check size={18} aria-hidden="true" />
                  </button>
                  <button type="button" className="icon-btn" aria-label="Cancelar" onClick={() => setRenaming(null)}>
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ) : removing === o ? (
              <li key={o} className="opt-manage__row opt-manage__row--confirm" role="alert">
                <span className="small">
                  ¿Borrar «{o}»?{n(o) ? ` Se quita de ${n(o)} ${n(o) === 1 ? countLabel[0] : countLabel[1]}.` : ''}
                </span>
                <span className="opt-manage__actions">
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm danger-text"
                    onClick={() => {
                      onRemove?.(o);
                      if (exact === o) onChange('');
                      setRemoving(null);
                    }}
                  >
                    Borrar
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setRemoving(null)}>
                    Cancelar
                  </button>
                </span>
              </li>
            ) : (
              <li key={o} className="opt-manage__row">
                <span className="opt-manage__name">
                  {o}
                  {counts && <span className="small muted"> · {n(o)} {n(o) === 1 ? countLabel[0] : countLabel[1]}</span>}
                </span>
                <span className="opt-manage__actions">
                  {onRename && (
                    <button type="button" className="icon-btn" onClick={() => setRenaming({ from: o, to: o })} aria-label={`Cambiar el nombre de «${o}»`}>
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                  )}
                  {onRemove && (
                    <button type="button" className="icon-btn" onClick={() => setRemoving(o)} aria-label={`Borrar «${o}»`}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  )}
                </span>
              </li>
            ),
          )}
        </ul>
      )}
      {hint && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Elegir entre unas pocas opciones fijas como etiquetas (idioma, tipo…).
 * `other` añade «Otro…», que abre un campo para escribirlo.
 */
export function ChipChoice<T extends string>({
  label,
  value,
  onChange,
  options,
  other,
  hint,
}: {
  label: string;
  value: T | string;
  onChange: (v: T | string) => void;
  options: ReadonlyArray<{ value: T | ''; label: string }>;
  other?: { label: string; placeholder?: string; maxLength?: number };
  hint?: ReactNode;
}) {
  const id = useId();
  const known = options.some((o) => o.value === value);
  const [typing, setTyping] = useState(() => !!value && !known);
  const writing = !!other && (typing || (!!value && !known));
  return (
    <fieldset className="field opt-picker">
      <legend className="field__label">{label}</legend>
      <div className="opt-picker__chips" role="group">
        {options.map((o) => {
          const on = !writing && value === o.value;
          return (
            <button
              key={o.value || '-'}
              type="button"
              className={`opt-chip${on ? ' is-on' : ''}`}
              aria-pressed={on}
              onClick={() => {
                setTyping(false);
                onChange(o.value);
              }}
            >
              {on && <Check size={14} aria-hidden="true" />}
              {o.label}
            </button>
          );
        })}
        {other && (
          <button
            type="button"
            className={`opt-chip${writing ? ' is-on' : ''}`}
            aria-pressed={writing}
            onClick={() => {
              setTyping(true);
              if (known) onChange('');
            }}
          >
            {writing ? <Check size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
            {other.label}
          </button>
        )}
      </div>
      {writing && other && (
        <input id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={other.placeholder} maxLength={other.maxLength} autoFocus={typing} aria-label={other.label} />
      )}
      {hint && <p className="field__hint">{hint}</p>}
    </fieldset>
  );
}
