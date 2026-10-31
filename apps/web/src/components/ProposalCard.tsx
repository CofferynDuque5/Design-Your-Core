import type { ChatCard } from '@dyc/core';
import { Check } from 'lucide-react';

/** Acción propuesta (del Asistente o de las sugerencias de una sección) con «Hacer» y «Descartar». */
export function ProposalCard({ card, onDo, onDiscard }: { card: ChatCard; onDo: (c: ChatCard) => void; onDiscard: (c: ChatCard) => void }) {
  const label = card.status === 'done' ? 'Hecho' : card.status === 'discarded' ? 'Descartado' : card.status === 'invalid' ? 'No se puede hacer' : card.reason !== undefined ? 'Sugerencia' : 'Acción propuesta';
  return (
    <div className={`proposal proposal--${card.status}`} role="group" aria-label={`${label}: ${card.title}`}>
      <div className="proposal__head">
        <strong>{card.title}</strong>
        {card.where && <span className="chip small">{card.where}</span>}
        <span className={`proposal__state small${card.status === 'done' ? ' success-text' : ''}`}>{label}</span>
      </div>
      {card.reason && <p className="small muted">{card.reason}</p>}
      {card.fields.length > 0 && (
        <dl className="proposal__fields small">
          {card.fields.map((f, i) => (
            <div key={`${f.label}-${i}`}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {card.status === 'invalid' && <p className="field__error">{card.error}</p>}
      {card.error && card.status === 'pending' && (
        <p className="field__error" role="alert">
          {card.error}
        </p>
      )}
      {(card.status === 'pending' || card.status === 'running') && (
        <div className="row">
          <button type="button" className="btn btn--sm" onClick={() => onDo(card)} disabled={card.status === 'running'}>
            <Check size={16} aria-hidden="true" /> {card.status === 'running' ? 'Haciendo…' : 'Hacer'}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onDiscard(card)} disabled={card.status === 'running'}>
            Descartar
          </button>
        </div>
      )}
      {card.status === 'done' && card.reason === undefined && <p className="small muted">{card.done}</p>}
    </div>
  );
}
