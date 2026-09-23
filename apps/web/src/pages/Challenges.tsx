import type { UserChallenge } from '@dyc/api-client';
import { adjacentLevel, PILLAR_IDS, type Challenge, type PillarId } from '@dyc/core';
import { useMutation } from '@tanstack/react-query';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useState } from 'react';
import { api } from '../app/api';
import { useToggleChallenge } from '../app/mutations';
import { useCatalog, useChallenges, useRefresh } from '../app/queries';
import { useToast } from '../app/toast';
import { PageHeader } from '../components/AppShell';
import { ChallengeCard } from '../components/ChallengeCard';
import { Dialog } from '../components/Dialog';
import { pillarShort, PillarTag } from '../components/Pillar';
import { EmptyState, ErrorState, errorMessage, Loading } from '../components/States';
import { shortDay } from '../lib/format';

const MAX_ACTIVE = 3;
const STATUS = { active: 'En curso', completed: 'Completado', abandoned: 'Lo dejaste' } as const;

export function Challenges() {
  const list = useChallenges();
  const catalog = useCatalog();
  const [filter, setFilter] = useState<PillarId | 'all'>('all');

  return (
    <div className="page">
      <PageHeader eyebrow="Retos" title="Pasos pequeños que se notan" />
      {list.isPending || catalog.isPending ? (
        <Loading />
      ) : list.isError || catalog.isError ? (
        <ErrorState error={list.error ?? catalog.error} retry={() => (list.refetch(), catalog.refetch())} />
      ) : (
        <div className="stack-xl">
          <ActiveSection active={list.data.active} today={list.data.today} />

          <section className="stack" aria-labelledby="catalog-title">
            <div className="section-head wrap">
              <h2 id="catalog-title" className="section-title">
                Catálogo
              </h2>
              <div className="chips" role="group" aria-label="Filtrar por pilar">
                <button type="button" className="chip-btn" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
                  Todos
                </button>
                {PILLAR_IDS.map((p) => (
                  <button key={p} type="button" className="chip-btn" data-pillar={p} aria-pressed={filter === p} onClick={() => setFilter(p)}>
                    {pillarShort(p)}
                  </button>
                ))}
              </div>
            </div>
            <div className="card-grid">
              {catalog.data
                .filter((c) => filter === 'all' || c.pillar === filter)
                .map((c) => (
                  <CatalogCard key={c.key} c={c} active={list.data.active} />
                ))}
            </div>
          </section>

          {list.data.past.length > 0 && (
            <section className="stack" aria-labelledby="past-title">
              <h2 id="past-title" className="section-title">
                Últimos 60 días
              </h2>
              <ul className="card card--list past-list">
                {list.data.past.map((c) => (
                  <li key={c.id} data-pillar={c.pillar}>
                    <span className="past-list__title">{c.title}</span>
                    <span className="muted small numeric">
                      {shortDay(c.startedOn)} · {c.doneDays}/{c.durationDays} días
                    </span>
                    <span className={`chip${c.status === 'completed' ? ' chip--success' : ''}`}>{STATUS[c.status]}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function ActiveSection({ active, today }: { active: UserChallenge[]; today: string }) {
  const toggle = useToggleChallenge();
  const refresh = useRefresh();
  const toast = useToast();
  const [ending, setEnding] = useState<UserChallenge | null>(null);

  const switchLevel = useMutation({
    mutationFn: ({ c, to }: { c: UserChallenge; to: Challenge }) => api.challenges.start(to.key, c.id),
    onSuccess: (c) => {
      toast(`Ahora vas con «${c.title}».`);
      return refresh('challenges');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });
  const finish = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'completed' | 'abandoned' }) => api.challenges.finish(id, status),
    onSuccess: (c) => {
      setEnding(null);
      toast(c.status === 'completed' ? '¡Reto completado!' : 'Reto cerrado. Puedes volver a él cuando quieras.');
      return refresh('challenges');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });

  return (
    <section className="stack" aria-labelledby="active-title">
      <div className="section-head">
        <h2 id="active-title" className="section-title">
          En curso
        </h2>
        <span className="muted numeric">
          {active.length} de {MAX_ACTIVE}
        </span>
      </div>
      {active.length ? (
        <div className="card-grid">
          {active.map((c) => {
            const up = adjacentLevel(c.key, 1);
            const down = adjacentLevel(c.key, -1);
            return (
              <ChallengeCard key={c.id} c={c} busy={toggle.isPending} onToggleToday={() => toggle.mutate({ id: c.id, date: today, done: !c.doneToday })}>
                {up && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => switchLevel.mutate({ c, to: up })} disabled={switchLevel.isPending} title={up.title}>
                    <ArrowUp size={16} aria-hidden="true" /> Subir nivel
                  </button>
                )}
                {down && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => switchLevel.mutate({ c, to: down })} disabled={switchLevel.isPending} title={down.title}>
                    <ArrowDown size={16} aria-hidden="true" /> Bajar nivel
                  </button>
                )}
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEnding(c)}>
                  Terminar
                </button>
              </ChallengeCard>
            );
          })}
        </div>
      ) : (
        <EmptyState title="No tienes retos en curso">Elige uno del catálogo. Te recomendamos empezar por el nivel 1 del pilar que más te cuesta.</EmptyState>
      )}

      <Dialog open={!!ending} onClose={() => setEnding(null)} title="Terminar el reto">
        {ending && (
          <div className="stack">
            <p>
              Llevas {ending.doneDays} de {ending.durationDays} días en «{ending.title}». ¿Cómo quieres cerrarlo?
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn--secondary" onClick={() => finish.mutate({ id: ending.id, status: 'abandoned' })} disabled={finish.isPending}>
                Dejarlo por ahora
              </button>
              <button type="button" className="btn" onClick={() => finish.mutate({ id: ending.id, status: 'completed' })} disabled={finish.isPending}>
                Darlo por completado
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </section>
  );
}

function CatalogCard({ c, active }: { c: Challenge; active: UserChallenge[] }) {
  const refresh = useRefresh();
  const toast = useToast();
  const start = useMutation({
    mutationFn: () => api.challenges.start(c.key),
    onSuccess: () => {
      toast(`Reto aceptado: ${c.title}`);
      return refresh('challenges');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });
  const running = active.some((a) => a.key === c.key);
  const full = active.length >= MAX_ACTIVE;

  return (
    <article className="card catalog-card" data-pillar={c.pillar}>
      <div className="challenge__head">
        <PillarTag pillar={c.pillar} />
        <span className="level-dots" aria-label={`Nivel ${c.level} de 3`}>
          {[1, 2, 3].map((n) => (
            <span key={n} className={n <= c.level ? 'on' : ''} />
          ))}
        </span>
      </div>
      <div className="stack-xs">
        <h3 className="challenge__title">{c.title}</h3>
        <p className="muted">{c.description}</p>
      </div>
      <div className="catalog-card__foot">
        <span className="muted small">{c.durationDays} días</span>
        {running ? (
          <span className="chip">En curso</span>
        ) : (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => start.mutate()}
            disabled={start.isPending || full}
            aria-busy={start.isPending}
            title={full ? 'Puedes tener hasta 3 retos a la vez' : undefined}
          >
            Empezar
          </button>
        )}
      </div>
    </article>
  );
}
