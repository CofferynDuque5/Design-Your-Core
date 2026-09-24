import type { UserChallenge } from '@dyc/api-client';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { plural, shortDay } from '../lib/format';
import { PillarTag } from './Pillar';
import { ProgressBar } from './Score';

export function ChallengeCard({ c, onToggleToday, busy, children }: { c: UserChallenge; onToggleToday?: () => void; busy?: boolean; children?: ReactNode }) {
  const pct = (c.doneDays / c.durationDays) * 100;
  const upcoming = c.dayNumber === 0;
  return (
    <article className="card challenge" data-pillar={c.pillar}>
      <div className="challenge__head">
        <PillarTag pillar={c.pillar} />
        {c.level && <span className="muted challenge__level">Nivel {c.level}</span>}
      </div>
      <div className="stack-xs">
        <h3 className="challenge__title">{c.title}</h3>
        <p className="muted">{c.description}</p>
      </div>
      <div className="stack-xs">
        <div className="challenge__meta numeric">
          <span>{upcoming ? `Empieza el ${shortDay(c.startedOn)}` : `Día ${c.dayNumber} de ${c.durationDays}`}</span>
          <span className="muted">{plural(c.doneDays, 'día cumplido', 'días cumplidos')}</span>
        </div>
        <ProgressBar value={pct} pillar={c.pillar} label={`Progreso de ${c.title}`} />
      </div>
      {(onToggleToday || children) && (
        <div className="row">
          {onToggleToday && c.status === 'active' && !upcoming && (
            <button type="button" className={`btn btn--sm ${c.doneToday ? 'btn--secondary' : ''}`} aria-pressed={c.doneToday} onClick={onToggleToday} disabled={busy}>
              {c.doneToday ? (
                <>
                  <Check size={16} aria-hidden="true" /> Hecho hoy
                </>
              ) : (
                'Marcar hoy como hecho'
              )}
            </button>
          )}
          {children}
        </div>
      )}
    </article>
  );
}
