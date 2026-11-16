import { Search } from 'lucide-react';
import { useId } from 'react';

/**
 * Buscador de una sección: filtra la lista mientras escribes (sin tildes ni
 * mayúsculas). Con `count` dice cuántos quedan a la vista.
 */
export function SearchBox({ label, value, onChange, placeholder = 'Buscar…', count }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; count?: number }) {
  const id = useId();
  return (
    <div className="stack-xs">
      <div className="search-field">
        <Search size={18} aria-hidden="true" />
        <label className="visually-hidden" htmlFor={id}>
          {label}
        </label>
        <input id={id} type="search" className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={200} autoComplete="off" />
      </div>
      {value.trim() && count !== undefined && (
        <p className="small muted" role="status">
          {count === 0 ? `Nada coincide con «${value.trim()}».` : count === 1 ? '1 resultado.' : `${count} resultados.`}
        </p>
      )}
    </div>
  );
}
