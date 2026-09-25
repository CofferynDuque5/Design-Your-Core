import { BLOCK_KIND_INFO, BLOCK_KINDS, hoursLabel, TASK_PRIORITIES, TASK_PRIORITY_INFO, type BlockKind, type LegacyBlock, type LegacyTask, type TaskPriority } from '@dyc/core';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { newId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { Segmented, SelectField, TextField } from '../components/Form';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { durationLabel, layoutLanes, nowHours, useNow } from '../lib/tools';

type View = 'dia' | 'tareas';
const VIEWS: Array<{ value: View; label: string }> = [
  { value: 'dia', label: 'Tu día' },
  { value: 'tareas', label: 'Tareas' },
];

export function Agenda() {
  const [params, setParams] = useSearchParams();
  const view: View = params.get('vista') === 'tareas' ? 'tareas' : 'dia';
  const legacy = useLegacyData();

  return (
    <div className="page">
      <PageHeader eyebrow="Herramientas" title="Agenda">
        <Segmented label="Vista" options={VIEWS} value={view} onChange={(v) => setParams(v === 'dia' ? {} : { vista: v }, { replace: true })} />
      </PageHeader>
      {legacy.isPending ? (
        <Loading label="Cargando tu agenda" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : view === 'dia' ? (
        <DayView data={legacy.data.data} />
      ) : (
        <TasksView data={legacy.data.data} />
      )}
    </div>
  );
}

// ---------- Tu día: línea de tiempo de bloques ----------

const HOUR = 56; // px por hora

function DayView({ data }: { data: Record<string, unknown> }) {
  const blocks = useLegacyList(data, 'blocks');
  const [editing, setEditing] = useState<LegacyBlock | 'new' | null>(null);
  const now = useNow();

  // Franja de 6 a 22 h, ampliada si algún bloque se sale.
  const valid = blocks.filter((b) => Number.isFinite(b.start) && Number.isFinite(b.dur) && b.dur > 0);
  const from = Math.min(6, ...valid.map((b) => Math.floor(b.start)));
  const to = Math.max(22, ...valid.map((b) => Math.ceil(b.start + b.dur)));
  const placed = layoutLanes(valid.map((b) => ({ item: b, start: b.start, end: b.start + b.dur })));
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const nowH = nowHours(now);
  const total = valid.reduce((s, b) => s + b.dur, 0);

  return (
    <div className="agenda-grid">
      <section className="card stack" aria-labelledby="day-title">
        <div className="section-head">
          <div className="stack-xs">
            <h2 id="day-title" className="section-title">
              Tu día
            </h2>
            <p className="muted small">{valid.length ? `${valid.length} ${valid.length === 1 ? 'bloque' : 'bloques'} · ${durationLabel(total)} planificadas` : 'Organiza tu jornada en bloques.'}</p>
          </div>
          <button type="button" className="btn btn--sm" onClick={() => setEditing('new')}>
            <Plus size={16} aria-hidden="true" /> Nuevo bloque
          </button>
        </div>
        {valid.length === 0 ? (
          <EmptyState title="Tu día está en blanco">Añade bloques para estudiar, entrenar o descansar. Se repiten cada día.</EmptyState>
        ) : (
          <div className="timeline" style={{ height: (to - from) * HOUR }}>
            <div className="timeline__hours" aria-hidden="true">
              {hours.map((h) => (
                <span key={h} className="timeline__hour" style={{ top: (h - from) * HOUR }}>
                  {h}:00
                </span>
              ))}
            </div>
            <ol className="timeline__track" aria-label="Bloques del día, por hora de inicio">
              {placed.map(({ item: b, lane, lanes }) => {
                const info = BLOCK_KIND_INFO[b.kind] ?? BLOCK_KIND_INFO.study;
                const short = b.dur < 0.75;
                return (
                  <li
                    key={b.id}
                    className={`tl-block${short ? ' tl-block--short' : ''}`}
                    style={{
                      top: (b.start - from) * HOUR,
                      height: b.dur * HOUR - 2,
                      left: `calc(${(lane / lanes) * 100}% + 2px)`,
                      width: `calc(${100 / lanes}% - 4px)`,
                      ['--c' as string]: info.color,
                    }}
                  >
                    <button type="button" className="tl-block__btn" onClick={() => setEditing(b)} aria-label={`Editar «${b.label}», ${hoursLabel(b.start)} a ${hoursLabel(b.start + b.dur)}, ${info.label}`}>
                      <span className="tl-block__label">{b.label}</span>
                      {!short && (
                        <span className="tl-block__meta">
                          {hoursLabel(b.start)}–{hoursLabel(b.start + b.dur)}
                          {b.sub ? ` · ${b.sub}` : ''}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
            {nowH >= from && nowH <= to && <div className="now-line" style={{ top: (nowH - from) * HOUR }} aria-hidden="true" />}
          </div>
        )}
      </section>
      <aside className="card stack-sm agenda-side" aria-labelledby="legend-title">
        <h2 id="legend-title" className="section-title">
          Tipos
        </h2>
        <ul className="legend">
          {BLOCK_KINDS.map((k) => {
            const n = valid.filter((b) => b.kind === k).reduce((s, b) => s + b.dur, 0);
            return (
              <li key={k} style={{ ['--c' as string]: BLOCK_KIND_INFO[k].color }}>
                <span className="legend__dot" aria-hidden="true" />
                <span>{BLOCK_KIND_INFO[k].label}</span>
                <span className="muted small numeric">{n ? durationLabel(n) : '—'}</span>
              </li>
            );
          })}
        </ul>
        <p className="muted small">Los bloques no llevan fecha: tu plan se repite cada día, igual que en la app anterior.</p>
      </aside>
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo bloque' : 'Editar bloque'}>
        {editing !== null && <BlockForm block={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

const halfHours = (from: number, to: number) => Array.from({ length: Math.round((to - from) * 2) + 1 }, (_, i) => from + i / 2);

function BlockForm({ block, onDone }: { block: LegacyBlock | null; onDone: () => void }) {
  const blocks = useModule('blocks');
  const [label, setLabel] = useState(block?.label ?? '');
  const [sub, setSub] = useState(block?.sub ?? '');
  const [kind, setKind] = useState<BlockKind>(block && BLOCK_KINDS.includes(block.kind) ? block.kind : 'study');
  const [start, setStart] = useState(block?.start ?? 9);
  const [dur, setDur] = useState(block?.dur ?? 1);

  // Pasos de media hora; si el dato antiguo no encaja, se ofrece también su valor.
  const withValue = (list: number[], v: number) => (list.includes(v) ? list : [...list, v].sort((a, b) => a - b));
  const starts = withValue(halfHours(0, 23.5), start);
  const durs = withValue(halfHours(0.5, Math.max(0.5, 24 - start)), dur);
  const tooLong = start + dur > 24;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fields = { label: label.trim(), sub: sub.trim(), kind, start, dur };
    if (block) blocks.update(block.id, fields);
    else blocks.add({ id: newId(), ...fields });
    onDone();
  };

  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="Nombre" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} required autoFocus placeholder="Estudiar cálculo" />
      <TextField label="Detalle (opcional)" value={sub} onChange={(e) => setSub(e.target.value)} maxLength={200} placeholder="Capítulo 3" />
      <fieldset className="field">
        <legend className="field__label">Tipo</legend>
        <div className="chips">
          {BLOCK_KINDS.map((k) => (
            <label key={k} className="chip-radio chip-radio--dot" style={{ ['--c' as string]: BLOCK_KIND_INFO[k].color }}>
              <input type="radio" name="block-kind" checked={kind === k} onChange={() => setKind(k)} />
              <span>{BLOCK_KIND_INFO[k].label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid-2">
        <SelectField label="Empieza" value={start} onChange={(e) => setStart(Number(e.target.value))}>
          {starts.map((h) => (
            <option key={h} value={h}>
              {hoursLabel(h)}
            </option>
          ))}
        </SelectField>
        <SelectField label="Duración" value={dur} onChange={(e) => setDur(Number(e.target.value))} error={tooLong ? 'El bloque no puede pasar de medianoche.' : null}>
          {durs.map((h) => (
            <option key={h} value={h}>
              {durationLabel(h)}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="form-actions">
        {block && (
          <button
            type="button"
            className="btn btn--ghost danger-text"
            onClick={() => {
              blocks.remove(block.id);
              onDone();
            }}
          >
            <Trash2 size={16} aria-hidden="true" /> Borrar
          </button>
        )}
        <button type="submit" className="btn" disabled={!label.trim() || tooLong}>
          {block ? 'Guardar' : 'Añadir bloque'}
        </button>
      </div>
    </form>
  );
}

// ---------- Tareas por prioridad ----------

function TasksView({ data }: { data: Record<string, unknown> }) {
  const tasks = useLegacyList(data, 'tasks');
  const actions = useModule('tasks');
  const [title, setTitle] = useState('');
  const [pri, setPri] = useState<TaskPriority>('media');
  const [editing, setEditing] = useState<LegacyTask | null>(null);

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    actions.add({ id: newId(), title: title.trim(), pri, time: null, rem: false, done: false, tags: '' });
    setTitle('');
  };

  // Una prioridad desconocida se muestra como media, sin cambiar el dato.
  const priOf = (t: LegacyTask): TaskPriority => (TASK_PRIORITIES.includes(t.pri) ? t.pri : 'media');

  return (
    <div className="stack-lg">
      <form className="card add-task" onSubmit={add} aria-label="Añadir tarea">
        <TextField label="Nueva tarea" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Entregar el ensayo" />
        <fieldset className="field">
          <legend className="field__label">Prioridad</legend>
          <div className="chips">
            {TASK_PRIORITIES.map((p) => (
              <label key={p} className="chip-radio chip-radio--dot" style={{ ['--c' as string]: TASK_PRIORITY_INFO[p].color }}>
                <input type="radio" name="new-task-pri" checked={pri === p} onChange={() => setPri(p)} />
                <span>{TASK_PRIORITY_INFO[p].label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="btn" disabled={!title.trim()}>
          <Plus size={18} aria-hidden="true" /> Añadir
        </button>
      </form>

      {tasks.length === 0 ? (
        <EmptyState title="Sin tareas por ahora">Escribe la primera arriba y elige su prioridad.</EmptyState>
      ) : (
        <div className="task-groups">
          {TASK_PRIORITIES.map((p) => {
            const group = tasks.filter((t) => priOf(t) === p);
            const done = group.filter((t) => t.done).length;
            return (
              <section key={p} className="card stack-sm" aria-labelledby={`pri-${p}`} style={{ ['--c' as string]: TASK_PRIORITY_INFO[p].color }}>
                <div className="section-head">
                  <h2 id={`pri-${p}`} className="group-title">
                    <span className="legend__dot" aria-hidden="true" /> {TASK_PRIORITY_INFO[p].label}
                  </h2>
                  <span className="muted small numeric">
                    <span aria-hidden="true">
                      {done}/{group.length}
                    </span>
                    <span className="visually-hidden">
                      {done} de {group.length} hechas
                    </span>
                  </span>
                </div>
                {group.length === 0 ? (
                  <p className="muted small">Nada con prioridad {TASK_PRIORITY_INFO[p].label.toLowerCase()}.</p>
                ) : (
                  <ul className="check-list">
                    {group.map((t) => (
                      <li key={t.id} className={`check-row${t.done ? ' check-row--done' : ''}`}>
                        <label className="check-row__label">
                          <input type="checkbox" checked={!!t.done} onChange={() => actions.update(t.id, { done: !t.done })} />
                          <span>{t.title}</span>
                        </label>
                        {t.time && <span className="chip small">{t.time}</span>}
                        <button type="button" className="icon-btn" onClick={() => setEditing(t)} aria-label={`Editar «${t.title}»`}>
                          <Pencil size={18} aria-hidden="true" />
                        </button>
                        <button type="button" className="icon-btn" onClick={() => actions.remove(t.id)} aria-label={`Borrar «${t.title}»`}>
                          <Trash2 size={18} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Editar tarea">
        {editing && <TaskForm task={editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

function TaskForm({ task, onDone }: { task: LegacyTask; onDone: () => void }) {
  const actions = useModule('tasks');
  const [title, setTitle] = useState(task.title);
  const [pri, setPri] = useState<TaskPriority>(TASK_PRIORITIES.includes(task.pri) ? task.pri : 'media');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    actions.update(task.id, { title: title.trim(), pri });
    onDone();
  };
  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="Tarea" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required autoFocus />
      <fieldset className="field">
        <legend className="field__label">Prioridad</legend>
        <div className="chips">
          {TASK_PRIORITIES.map((p) => (
            <label key={p} className="chip-radio chip-radio--dot" style={{ ['--c' as string]: TASK_PRIORITY_INFO[p].color }}>
              <input type="radio" name="edit-task-pri" checked={pri === p} onChange={() => setPri(p)} />
              <span>{TASK_PRIORITY_INFO[p].label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="form-actions">
        <button type="submit" className="btn" disabled={!title.trim()}>
          Guardar
        </button>
      </div>
    </form>
  );
}
