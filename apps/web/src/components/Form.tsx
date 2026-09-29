import type { PasswordCheck } from '@dyc/core';
import { Circle, CircleAlert, CircleCheck, Eye, EyeOff } from 'lucide-react';
import { useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

export function TextField({ label, hint, error, valid, ...input }: FieldProps & { valid?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  const status = error ? 'invalid' : valid ? 'valid' : null;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className={`input-wrap${status ? ` input-wrap--${status}` : ''}`}>
        <input id={id} className="input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
        <FieldStatus status={status} />
      </div>
      <FieldNotes id={id} hint={hint} error={error} valid={valid} />
    </div>
  );
}

/** Icono de estado dentro del campo: correcto o con error. Solo decorativo; el texto lo explica. */
function FieldStatus({ status }: { status: 'valid' | 'invalid' | null }) {
  if (!status) return null;
  const Icon = status === 'valid' ? CircleCheck : CircleAlert;
  return <Icon className={`input-status input-status--${status}`} size={18} strokeWidth={2} aria-hidden="true" />;
}

function FieldNotes({ id, hint, error, valid }: { id: string; hint?: ReactNode; error?: string | null; valid?: boolean }) {
  return (
    <>
      {hint && (
        <span className={`field__hint${valid && !error ? ' field__hint--ok' : ''}`} id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field__error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </>
  );
}

/** Contraseña con botón para mostrarla u ocultarla y, si se pasa `checks`, la lista de requisitos en vivo. */
export function PasswordField({
  label,
  hint,
  error,
  valid,
  checks,
  ...input
}: FieldProps & { valid?: boolean; checks?: PasswordCheck[] } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const describedBy = [hint && `${id}-hint`, checks && `${id}-rules`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  const status = error ? 'invalid' : valid ? 'valid' : null;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className={`input-wrap input-wrap--action${status ? ` input-wrap--${status}` : ''}`}>
        <input
          id={id}
          className="input"
          type={visible ? 'text' : 'password'}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...input}
        />
        <FieldStatus status={status} />
        <button
          type="button"
          className="input-action"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-controls={id}
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
      {checks && (
        <ul className="password-rules" id={`${id}-rules`} aria-label="Requisitos de la contraseña">
          {checks.map((c) => (
            <li key={c.id} className={`password-rules__item${c.ok ? ' is-ok' : ''}`}>
              {c.ok ? <CircleCheck size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}
              <span>
                {c.label}
                <span className="visually-hidden">{c.ok ? ': cumplido' : c.required ? ': pendiente' : ''}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <FieldNotes id={id} hint={hint} error={error} valid={valid} />
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
export function ColorPicker({
  legend,
  colors,
  value,
  onChange,
  names,
  compact,
}: {
  legend: string;
  colors: readonly string[];
  value: string;
  onChange: (c: string) => void;
  names: Record<string, string>;
  /** Muestras pequeñas y leyenda solo para lectores de pantalla (p. ej. dentro de una cajita). */
  compact?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className={compact ? 'field swatches-field--compact' : 'field'}>
      <legend className={compact ? 'visually-hidden' : 'field__label'}>{legend}</legend>
      <div className={compact ? 'swatches swatches--sm' : 'swatches'}>
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
