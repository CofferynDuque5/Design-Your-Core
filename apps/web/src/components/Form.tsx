import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

export function TextField({ label, hint, error, ...input }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      {hint && (
        <span className="field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field__error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}

export function TextArea({ label, hint, ...input }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <textarea id={id} className="input" aria-describedby={hint ? `${id}-hint` : undefined} {...input} />
      {hint && (
        <span className="field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
    </div>
  );
}

/** Escala 1–5 accesible (radios nativos). */
export function Scale({
  legend,
  value,
  onChange,
  low,
  high,
  name,
}: {
  legend: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  low: string;
  high: string;
  name?: string;
}) {
  const id = useId();
  return (
    <fieldset className="scale-field">
      <legend className="field__label">{legend}</legend>
      <div className="scale">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="scale__option">
            <input
              type="radio"
              name={name ?? id}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              // Pulsar la opción marcada la desmarca: el check-in nunca obliga.
              onClick={() => value === n && onChange(null)}
            />
            <span>
              <b>{n}</b>{' '}
              {(n === 1 || n === 5) && <span className="visually-hidden">{n === 1 ? low : high}</span>}
            </span>
          </label>
        ))}
      </div>
      <div className="scale-ends" aria-hidden="true">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </fieldset>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} disabled={disabled} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SelectField({ label, hint, error, children, ...select }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="input select" aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...select}>
        {children}
      </select>
      {hint && (
        <span className="field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field__error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}

/** Muestras de color como radios: cada una lleva su nombre para lectores de pantalla. */
export function ColorPicker({ legend, colors, value, onChange, names }: { legend: string; colors: readonly string[]; value: string; onChange: (c: string) => void; names: Record<string, string> }) {
  const name = useId();
  return (
    <fieldset className="field">
      <legend className="field__label">{legend}</legend>
      <div className="swatches">
        {colors.map((c) => (
          <label key={c} className="swatch" style={{ ['--c' as string]: c }}>
            <input type="radio" name={name} checked={value.toLowerCase() === c.toLowerCase()} onChange={() => onChange(c)} />
            <span aria-hidden="true" />
            <span className="visually-hidden">{names[c.toUpperCase()] ?? c}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
