import { diffDays, GOAL_CATEGORIES, GOAL_CATEGORY_INFO, goalPercent, goalStep, goalToggleDone, isDay, shortDay, type GoalCategory, type LegacyGoal } from '@dyc/core';
import { CalendarClock, Check, Minus, Pencil, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { newId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { SelectField, TextField } from '../components/Form';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { FormActions, Meter, Stats } from '../components/ToolParts';
import { localDayKey } from '../lib/tools';

type Filter = 'todas' | GoalCategory;
/** Una categoría desconocida se muestra como «Personal», sin cambiar el dato. */
const categoryOf = (g: LegacyGoal): GoalCategory => (GOAL_CATEGORIES.includes(g.category) ? g.category : 'personal');
const num = (x: unknown, fallback = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);

/** "Vence hoy", "Faltan 3 días", "Venció hace 2 días". */
function deadlineLabel(deadline: string, today: string): { text: string; late: boolean } | null {
  if (!isDay(deadline)) return null;
  const d = diffDays(today, deadline);
  if (d === 0) return { text: 'Vence hoy', late: false };
  if (d > 0) return { text: `${d === 1 ? 'Falta 1 día' : `Faltan ${d} días`} · ${shortDay(deadline)}`, late: false };
  return { text: `Venció hace ${-d === 1 ? '1 día' : `${-d} días`} · ${shortDay(deadline)}`, late: true };
}

export function Goals() {
  const legacy = useLegacyData();
  const goals = useLegacyList(legacy.data?.data, 'goals');
  const [filter, setFilter] = useState<Filter>('todas');
  const [editing, setEditing] = useState<LegacyGoal | 'new' | null>(null);
  // Las fechas límite son fechas de calendario (campo tipo fecha), en hora local.
  const today = localDayKey(new Date());
  const done = goals.filter((g) => g.done).length;
  const next = goals
    .filter((g) => !g.done && isDay(g.deadline) && g.deadline >= today)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
  const shown = goals.filter((g) => filter === 'todas' || categoryOf(g) === filter);
  // Primero las que están en curso; las logradas, al final.
  const ordered = [...shown.filter((g) => !g.done), ...shown.filter((g) => g.done)];

  return (
    <div className="page">
      <PageHeader eyebrow="Vida personal" title="Metas">
        <button type="button" className="btn" onClick={() => setEditing('new')} disabled={!legacy.data}>
          <Plus size={18} aria-hidden="true" /> Nueva meta
        </button>
      </PageHeader>
      {legacy.isPending ? (
        <Loading label="Cargando tus metas" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : goals.length === 0 ? (
        <EmptyState
          title="Aún no tienes metas"
          action={
            <button type="button" className="btn btn--secondary" onClick={() => setEditing('new')}>
              <Plus size={18} aria-hidden="true" /> Crear la primera
            </button>
          }
        >
          Ponle número a lo que quieres lograr («Publicar 8 videos», «Ahorrar 500») y súmale avances.
        </EmptyState>
      ) : (
        <div className="stack-lg">
          <Stats
            items={[
              { value: `${done}/${goals.length}`, label: 'Logradas' },
              { value: goals.length - done, label: 'En curso' },
              { value: next ? shortDay(next.deadline) : '—', label: next ? `Próxima: ${next.title}` : 'Sin fechas próximas' },
            ]}
          />
          <div className="chips" role="group" aria-label="Categoría">
            {(['todas', ...GOAL_CATEGORIES] as Filter[]).map((c) => (
              <button key={c} type="button" className="chip-btn" aria-pressed={filter === c} onClick={() => setFilter(c)}>
                {c === 'todas' ? 'Todas' : GOAL_CATEGORY_INFO[c].label}
              </button>
            ))}
          </div>
          {ordered.length === 0 ? (
            <EmptyState title="Nada por aquí con este filtro" />
          ) : (
            <ul className="card-grid tool-grid" aria-label="Metas">
              {ordered.map((g) => (
                <li key={g.id}>
                  <GoalCard goal={g} today={today} onEdit={() => setEditing(g)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nueva meta' : 'Editar meta'}>
        {editing !== null && <GoalForm goal={editing === 'new' ? null : editing} category={filter === 'todas' ? 'personal' : filter} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

function GoalCard({ goal: g, today, onEdit }: { goal: LegacyGoal; today: string; onEdit: () => void }) {
  const actions = useModule('goals');
  const cat = GOAL_CATEGORY_INFO[categoryOf(g)];
  const title = g.title || 'Sin título';
  const pct = goalPercent(g);
  const current = num(g.current);
  const target = num(g.target, 1);
  const due = g.done ? null : deadlineLabel(g.deadline, today);
  const titleId = `goal-${g.id}`;
  return (
    <article className={`card tool-card${g.done ? ' tool-card--done' : ''}`} style={{ ['--c' as string]: cat.color }} aria-labelledby={titleId}>
      <div className="tool-card__head">
        <span className="platform small">
          <span className="legend__dot" aria-hidden="true" />
          <span className="visually-hidden">Categoría: </span>
          {cat.label}
        </span>
        <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Editar «${title}»`}>
          <Pencil size={18} aria-hidden="true" />
        </button>
      </div>
      <h2 id={titleId} className="tool-card__title">
        {title}
      </h2>
      <p className="goal-count">
        <span className="goal-count__value numeric">{current}</span>
        <span className="muted">
          {' '}
          de {target}
          {g.unit ? ` ${g.unit}` : ''}
        </span>
      </p>
      <div className="meter-row">
        <Meter value={pct} color={cat.color} label={`Progreso de ${title}`} />
        <span className="numeric small">{pct} %</span>
      </div>
      <ul className="meta-list">
        <li className={due?.late ? 'danger-text' : undefined}>
          <CalendarClock size={15} aria-hidden="true" />
          {g.done ? '¡Lograda!' : (due?.text ?? 'Sin fecha límite')}
        </li>
      </ul>
      <div className="goal-actions">
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => actions.update(g.id, goalStep(g, -1))} disabled={current <= 0} aria-label={`Restar 1 a «${title}»`}>
          <Minus size={16} aria-hidden="true" /> 1
        </button>
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => actions.update(g.id, goalStep(g, 1))} aria-label={`Sumar 1 a «${title}»`}>
          <Plus size={16} aria-hidden="true" /> 1
        </button>
        <button type="button" className={`btn btn--sm ${g.done ? 'btn--ghost' : 'btn--secondary'}`} aria-pressed={!!g.done} onClick={() => actions.update(g.id, goalToggleDone(g))}>
          <Check size={16} aria-hidden="true" /> Lograda
        </button>
      </div>
    </article>
  );
}

function GoalForm({ goal, category: initialCategory, onDone }: { goal: LegacyGoal | null; category: GoalCategory; onDone: () => void }) {
  const actions = useModule('goals');
  const [title, setTitle] = useState(goal?.title ?? '');
  const [target, setTarget] = useState(String(goal ? num(goal.target, 10) : 10));
  const [current, setCurrent] = useState(String(goal ? num(goal.current) : 0));
  const [unit, setUnit] = useState(goal?.unit ?? '');
  const [deadline, setDeadline] = useState(goal && isDay(goal.deadline) ? goal.deadline : '');
  const [category, setCategory] = useState<GoalCategory>(goal ? categoryOf(goal) : initialCategory);
  const t = Number(target);
  const c = Number(current);
  const targetOk = Number.isInteger(t) && t >= 1 && t <= 1e9;
  const currentOk = Number.isInteger(c) && c >= 0 && c <= 1e9;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !targetOk || !currentOk) return;
    // Como la app anterior, llegar a la meta la marca como lograda.
    const fields = { title: title.trim(), target: t, current: c, unit: unit.trim(), deadline, category, done: c >= t };
    if (goal) actions.update(goal.id, fields);
    else actions.add({ id: newId(), ...fields });
    onDone();
  };

  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="Meta" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required autoFocus placeholder="Publicar 8 videos" />
      <div className="grid-2">
        <TextField label="Objetivo" type="number" inputMode="numeric" min="1" step="1" value={target} onChange={(e) => setTarget(e.target.value)} required error={targetOk ? null : 'Un número entero, 1 o más.'} />
        <TextField label="Unidad (opcional)" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={40} placeholder="videos, kg, libros…" />
      </div>
      <div className="grid-2">
        <TextField label="Llevas" type="number" inputMode="numeric" min="0" step="1" value={current} onChange={(e) => setCurrent(e.target.value)} required error={currentOk ? null : 'Un número entero, 0 o más.'} />
        <TextField label="Fecha límite (opcional)" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      </div>
      <SelectField label="Categoría" value={category} onChange={(e) => setCategory(e.target.value as GoalCategory)}>
        {GOAL_CATEGORIES.map((k) => (
          <option key={k} value={k}>
            {GOAL_CATEGORY_INFO[k].label}
          </option>
        ))}
      </SelectField>
      <FormActions
        submitLabel={goal ? 'Guardar' : 'Añadir meta'}
        disabled={!title.trim() || !targetOk || !currentOk}
        onDelete={
          goal
            ? () => {
                actions.remove(goal.id);
                onDone();
              }
            : undefined
        }
        confirm={`Se borrará «${goal?.title || 'esta meta'}» con su progreso.`}
      />
    </form>
  );
}
