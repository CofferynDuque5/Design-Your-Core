import { WORK_PROJECT_INFO, WORK_PROJECTS, WORK_STATUS_INFO, WORK_STATUSES, type LegacyWorkItem, type WorkProject, type WorkStatus } from '@dyc/core';
import { Info, Pencil, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { newId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { Segmented, SelectField, TextField } from '../components/Form';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { FormActions } from '../components/ToolParts';

/** Proyecto y estado desconocidos (datos raros) se muestran como el primero, sin cambiar el dato. */
const projectOf = (w: LegacyWorkItem): WorkProject => (WORK_PROJECTS.includes(w.project) ? w.project : 'p1');
const statusOf = (w: LegacyWorkItem): WorkStatus => (WORK_STATUSES.includes(w.status) ? w.status : 'todo');

// Mismos grupos que la app anterior: en curso, por hacer y hecho.
const BUCKETS: Array<{ id: 'curso' | 'todo' | 'hecho'; label: string }> = [
  { id: 'curso', label: 'En curso' },
  { id: 'todo', label: 'Por hacer' },
  { id: 'hecho', label: 'Hecho' },
];
const bucketOf = (w: LegacyWorkItem) => (w.done ? 'hecho' : statusOf(w));

export function Work() {
  const legacy = useLegacyData();
  const items = useLegacyList(legacy.data?.data, 'workItems');
  const actions = useModule('workItems');
  const [title, setTitle] = useState('');
  const [project, setProject] = useState<WorkProject>('p1');
  const [editing, setEditing] = useState<LegacyWorkItem | null>(null);
  const done = items.filter((w) => w.done).length;

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    actions.add({ id: newId(), title: title.trim(), project, status: 'todo', done: false, due: '' });
    setTitle('');
  };

  return (
    <div className="page page--narrow">
      <PageHeader eyebrow="Estudio y trabajo" title="Trabajo">
        {items.length > 0 && (
          <span className="chip numeric">
            {done}/{items.length} completadas
          </span>
        )}
      </PageHeader>
      {legacy.isPending ? (
        <Loading label="Cargando tus tareas de trabajo" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : (
        <div className="stack-lg">
          <form className="inline-add work-add" onSubmit={add}>
            <label className="visually-hidden" htmlFor="new-work">
              Nueva tarea de trabajo
            </label>
            <input id="new-work" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Nueva tarea de trabajo…" />
            <label className="visually-hidden" htmlFor="new-work-project">
              Proyecto de la tarea nueva
            </label>
            <select id="new-work-project" className="input select work-add__project" value={project} onChange={(e) => setProject(e.target.value as WorkProject)}>
              {WORK_PROJECTS.map((p) => (
                <option key={p} value={p}>
                  {WORK_PROJECT_INFO[p].label}
                </option>
              ))}
            </select>
            <button type="submit" className="btn" disabled={!title.trim()}>
              <Plus size={18} aria-hidden="true" /> Añadir
            </button>
          </form>
          {items.length === 0 ? (
            <EmptyState title="Sin tareas de trabajo">Anota lo que tienes pendiente en tus proyectos y márcalo al terminar.</EmptyState>
          ) : (
            BUCKETS.map((b) => {
              const list = items.filter((w) => bucketOf(w) === b.id);
              if (!list.length) return null;
              return (
                <section key={b.id} className="card card--list" aria-labelledby={`work-${b.id}`}>
                  <h2 id={`work-${b.id}`} className="list-count">
                    {b.label} <span className="chip small numeric">{list.length}</span>
                  </h2>
                  <ul className="work-list">
                    {list.map((w) => (
                      <WorkRow key={w.id} item={w} onEdit={() => setEditing(w)} />
                    ))}
                  </ul>
                </section>
              );
            })
          )}
          <p className="checkin-note small">
            <Info size={16} aria-hidden="true" />
            <span>Proyecto 1, 2 y 3 son los tres proyectos fijos de la app anterior. No están unidos a la sección Proyectos.</span>
          </p>
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Editar tarea de trabajo">
        {editing && <WorkForm item={editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

function WorkRow({ item: w, onEdit }: { item: LegacyWorkItem; onEdit: () => void }) {
  const actions = useModule('workItems');
  const p = WORK_PROJECT_INFO[projectOf(w)];
  const title = w.title || 'Sin título';
  return (
    <li className={`check-row work-row${w.done ? ' check-row--done' : ''}`}>
      <label className="check-row__label">
        <input type="checkbox" checked={!!w.done} onChange={() => actions.update(w.id, { done: !w.done })} />
        <span className="work-row__text">
          <span>{title}</span>
          <span className="work-row__meta small">
            <span className="platform" style={{ ['--c' as string]: p.color }}>
              <span className="legend__dot" aria-hidden="true" />
              {p.label}
            </span>
            {w.due && !w.done && <span className="chip small">{w.due}</span>}
          </span>
        </span>
      </label>
      <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Editar «${title}»`}>
        <Pencil size={18} aria-hidden="true" />
      </button>
    </li>
  );
}

function WorkForm({ item, onDone }: { item: LegacyWorkItem; onDone: () => void }) {
  const actions = useModule('workItems');
  const [title, setTitle] = useState(item.title ?? '');
  const [project, setProject] = useState<WorkProject>(projectOf(item));
  const [status, setStatus] = useState<WorkStatus>(statusOf(item));
  const [due, setDue] = useState(item.due ?? '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    actions.update(item.id, { title: title.trim(), project, status, due: due.trim() });
    onDone();
  };
  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="Tarea" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required autoFocus />
      <SelectField label="Proyecto" value={project} onChange={(e) => setProject(e.target.value as WorkProject)}>
        {WORK_PROJECTS.map((p) => (
          <option key={p} value={p}>
            {WORK_PROJECT_INFO[p].label}
          </option>
        ))}
      </SelectField>
      <div className="field">
        <span className="field__label">
          Estado
        </span>
        <Segmented label="Estado" value={status} onChange={setStatus} options={WORK_STATUSES.map((s) => ({ value: s, label: WORK_STATUS_INFO[s].label }))} />
      </div>
      <TextField label="Para cuándo (opcional)" value={due} onChange={(e) => setDue(e.target.value)} maxLength={60} placeholder="Hoy, viernes, 30 sep…" />
      <FormActions
        submitLabel="Guardar"
        disabled={!title.trim()}
        onDelete={() => {
          actions.remove(item.id);
          onDone();
        }}
        confirm={`Se borrará «${item.title || 'esta tarea'}».`}
      />
    </form>
  );
}
