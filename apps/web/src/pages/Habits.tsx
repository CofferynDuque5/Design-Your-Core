import type { Habit } from '@dyc/api-client';
import { addDays, isScheduled, PILLAR_IDS, type Day, type PillarId } from '@dyc/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../app/api';
import { keys, useHabits, useRefresh } from '../app/queries';
import { useToast } from '../app/toast';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { TextField } from '../components/Form';
import { pillarName, pillarShort, PillarTag } from '../components/Pillar';
import { EmptyState, ErrorState, errorMessage, Loading } from '../components/States';
import { daysLabel, shortDay, WEEKDAYS, weekdayShort } from '../lib/format';

const IDEAS: Array<{ title: string; pillar: PillarId }> = [
  { title: 'Caminar 10 minutos', pillar: 'movimiento' },
  { title: 'Pantallas fuera 30 minutos antes de dormir', pillar: 'descanso' },
  { title: 'Un vaso de agua al despertar', pillar: 'alimentacion' },
  { title: 'Un bloque de trabajo sin notificaciones', pillar: 'enfoque' },
  { title: 'Escribir a alguien que aprecio', pillar: 'relaciones' },
  { title: 'Una línea en el diario', pillar: 'proposito' },
];

export function Habits() {
  const [showArchived, setShowArchived] = useState(false);
  const habits = useHabits(showArchived);
  const [editing, setEditing] = useState<Habit | 'new' | null>(null);

  const list = habits.data?.habits ?? [];
  const active = list.filter((h) => !h.archived);
  const archived = list.filter((h) => h.archived);

  return (
    <div className="page">
      <PageHeader eyebrow="Hábitos" title="Lo que repites te construye">
        <button type="button" className="btn" onClick={() => setEditing('new')}>
          <Plus size={18} aria-hidden="true" /> Nuevo hábito
        </button>
      </PageHeader>

      {habits.isPending ? (
        <Loading />
      ) : habits.isError ? (
        <ErrorState error={habits.error} retry={() => habits.refetch()} />
      ) : (
        <div className="stack-lg">
          {active.length ? (
            <ul className="stack habit-list">
              {active.map((h) => (
                <HabitRow key={h.id} h={h} today={habits.data.today} onEdit={() => setEditing(h)} />
              ))}
            </ul>
          ) : (
            <EmptyState title="Aún no tienes hábitos">
              Empieza con uno tan pequeño que no puedas fallar. Algunas ideas: {IDEAS.map((i) => i.title.toLowerCase()).slice(0, 3).join(', ')}.
            </EmptyState>
          )}

          <label className="toggle-line">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Mostrar archivados
          </label>
          {showArchived &&
            (archived.length ? (
              <ul className="stack habit-list">
                {archived.map((h) => (
                  <HabitRow key={h.id} h={h} today={habits.data.today} onEdit={() => setEditing(h)} />
                ))}
              </ul>
            ) : (
              <p className="muted">No tienes hábitos archivados.</p>
            ))}
        </div>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo hábito' : 'Editar hábito'}>
        {editing !== null && <HabitForm habit={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

function HabitRow({ h, today, onEdit }: { h: Habit; today: Day; onEdit: () => void }) {
  const qc = useQueryClient();
  const refresh = useRefresh();
  const toast = useToast();
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).filter((d) => d >= h.startsOn);

  const log = useMutation({
    mutationFn: ({ date, done }: { date: Day; done: boolean }) => api.habits.log(h.id, date, done),
    onMutate: ({ date, done }) => {
      // Se marca al instante; si falla, se recarga la lista real.
      qc.setQueriesData<{ today: Day; habits: Habit[] }>({ queryKey: ['habits'] }, (d) =>
        d && {
          ...d,
          habits: d.habits.map((x) => (x.id === h.id ? { ...x, recent: [...(x.recent ?? []).filter((r) => r.date !== date), { date, done }] } : x)),
        },
      );
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
    onSettled: () => refresh('habits'),
  });
  const archive = useMutation({
    mutationFn: () => api.habits.update(h.id, { archived: !h.archived }),
    onSuccess: () => {
      toast(h.archived ? 'Hábito recuperado.' : 'Hábito archivado. Su historial se conserva.');
      return refresh('habits');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });

  const doneOn = (d: Day) => h.recent?.some((r) => r.date === d && r.done) ?? false;

  return (
    <li className={`card habit-row${h.archived ? ' habit-row--archived' : ''}`} data-pillar={h.pillar}>
      <div className="habit-row__main">
        <div className="stack-xs">
          <h3 className="habit-row__title">{h.title}</h3>
          <div className="row small">
            <PillarTag pillar={h.pillar} />
            <span className="muted">{daysLabel(h.days)}</span>
          </div>
        </div>
        <div className="row">
          <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Editar «${h.title}»`}>
            <Pencil size={18} aria-hidden="true" />
          </button>
          <button type="button" className="icon-btn" onClick={() => archive.mutate()} disabled={archive.isPending} aria-label={h.archived ? `Recuperar «${h.title}»` : `Archivar «${h.title}»`}>
            {h.archived ? <ArchiveRestore size={18} aria-hidden="true" /> : <Archive size={18} aria-hidden="true" />}
          </button>
        </div>
      </div>
      {!h.archived && week.length > 0 && (
        <div className="week-dots" role="group" aria-label={`Últimos días de «${h.title}»`}>
          {week.map((d) => {
            const done = doneOn(d);
            const scheduled = isScheduled(h.days, d);
            return (
              <button
                key={d}
                type="button"
                className={`week-dot${done ? ' week-dot--done' : ''}${scheduled ? '' : ' week-dot--off'}${d === today ? ' week-dot--today' : ''}`}
                aria-pressed={done}
                aria-label={`${d === today ? 'Hoy' : shortDay(d)}${scheduled ? '' : ' (no tocaba)'}`}
                onClick={() => log.mutate({ date: d, done: !done })}
              >
                <span className="week-dot__day" aria-hidden="true">
                  {weekdayShort(d).slice(0, 1).toUpperCase()}
                </span>
                <span className="week-dot__mark" aria-hidden="true">
                  {done && <Check size={14} strokeWidth={2.5} />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}

function HabitForm({ habit, onDone }: { habit: Habit | null; onDone: () => void }) {
  const [title, setTitle] = useState(habit?.title ?? '');
  const [pillar, setPillar] = useState<PillarId>(habit?.pillar ?? 'movimiento');
  const [days, setDays] = useState(habit?.days ?? '1234567');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const refresh = useRefresh();
  const toast = useToast();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => (habit ? api.habits.update(habit.id, { title: title.trim(), pillar, days }) : api.habits.create({ title: title.trim(), pillar, days })),
    onSuccess: async () => {
      toast(habit ? 'Hábito actualizado.' : 'Hábito creado. Aparecerá en Hoy.');
      await refresh('habits');
      onDone();
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });
  const remove = useMutation({
    mutationFn: () => api.habits.remove((habit as Habit).id),
    onSuccess: async () => {
      qc.removeQueries({ queryKey: keys.habits(true) });
      toast('Hábito eliminado.');
      await refresh('habits');
      onDone();
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });

  const toggleDay = (iso: string) => setDays((d) => (d.includes(iso) ? d.replace(iso, '') : [...d, iso].sort().join('')));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="¿Qué vas a hacer?" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required autoFocus placeholder="Caminar 10 minutos después de comer" />
      {!habit && (
        <div className="chips" role="group" aria-label="Ideas">
          {IDEAS.map((i) => (
            <button
              key={i.title}
              type="button"
              className="chip-btn"
              data-pillar={i.pillar}
              onClick={() => {
                setTitle(i.title);
                setPillar(i.pillar);
              }}
            >
              {i.title}
            </button>
          ))}
        </div>
      )}
      <fieldset className="field">
        <legend className="field__label">Pilar</legend>
        <div className="chips">
          {PILLAR_IDS.map((p) => (
            <label key={p} className="chip-radio" data-pillar={p}>
              <input type="radio" name="pillar" checked={pillar === p} onChange={() => setPillar(p)} />
              <span title={pillarName(p)}>{pillarShort(p)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="field">
        <legend className="field__label">Días</legend>
        <div className="weekday-picker">
          {WEEKDAYS.map((w) => (
            <label key={w.iso} className="chip-radio">
              <input type="checkbox" checked={days.includes(w.iso)} onChange={() => toggleDay(w.iso)} />
              <span>{w.label}</span>
            </label>
          ))}
        </div>
        <span className="field__hint">{days ? daysLabel(days) : 'Elige al menos un día.'}</span>
      </fieldset>

      {confirmDelete ? (
        <div className="alert alert--danger stack-sm" role="alert">
          <span>Se borrará el hábito y todo su historial. Si quieres conservarlo, archívalo.</span>
          <div className="row">
            <button type="button" className="btn btn--danger btn--sm" onClick={() => remove.mutate()} disabled={remove.isPending}>
              Borrar definitivamente
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="form-actions">
          {habit && (
            <button type="button" className="btn btn--ghost danger-text" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={16} aria-hidden="true" /> Borrar
            </button>
          )}
          <button type="submit" className="btn" disabled={!title.trim() || !days || save.isPending} aria-busy={save.isPending}>
            {habit ? 'Guardar' : 'Crear hábito'}
          </button>
        </div>
      )}
    </form>
  );
}
