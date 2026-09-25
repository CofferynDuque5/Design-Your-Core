import {
  CLASS_DAYS,
  checkItems,
  checkItemsPayload,
  COLOR_NAMES,
  dueThisWeek,
  PROJECT_COLORS,
  PROJECT_STATUS_INFO,
  PROJECT_STATUSES,
  projectProgress,
  type LegacyClass,
  type LegacyMilestone,
  type LegacyProject,
  type LegacySubject,
  type ProjectStatus,
} from '@dyc/core';
import { CalendarClock, ChevronDown, Clock, Pencil, Plus } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { newId, newSubId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { ColorPicker, Segmented, SelectField, TextField } from '../components/Form';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { CheckList, FormActions, Meter, paletteWith, safeColor, Stats } from '../components/ToolParts';
import { plural } from '../lib/format';

type Project = LegacyProject & { milestones: LegacyMilestone[] };
type Filter = 'todos' | 'curso' | 'entregado';
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'curso', label: 'En curso' },
  { value: 'entregado', label: 'Entregados' },
];
const STATUS_OPTIONS = PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_INFO[s].label }));
/** Un estado desconocido se muestra como «En curso», sin cambiar el dato. */
const statusOf = (p: LegacyProject): ProjectStatus => (PROJECT_STATUSES.includes(p.status) ? p.status : 'curso');

export function Projects() {
  const legacy = useLegacyData();
  const raw = useLegacyList(legacy.data?.data, 'projects');
  const subjects = useLegacyList(legacy.data?.data, 'subjects');
  const classes = useLegacyList(legacy.data?.data, 'classes');
  const projects = useMemo<Project[]>(() => raw.map((p) => ({ ...p, milestones: checkItems<LegacyMilestone>(p.milestones, newSubId) })), [raw]);
  const [filter, setFilter] = useState<Filter>('todos');
  const [editing, setEditing] = useState<Project | 'new' | null>(null);

  const active = projects.filter((p) => statusOf(p) !== 'entregado').length;
  const thisWeek = projects.filter((p) => dueThisWeek(p.deadline)).length;
  // Igual que la app anterior: «En curso» incluye los que están en revisión.
  const shown = filter === 'todos' ? projects : projects.filter((p) => (filter === 'entregado' ? statusOf(p) === 'entregado' : statusOf(p) !== 'entregado'));

  return (
    <div className="page">
      <PageHeader eyebrow="Herramientas" title="Proyectos">
        <button type="button" className="btn" onClick={() => setEditing('new')} disabled={!legacy.data}>
          <Plus size={18} aria-hidden="true" /> Nuevo proyecto
        </button>
      </PageHeader>
      {legacy.isPending ? (
        <Loading label="Cargando tus proyectos" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : projects.length === 0 ? (
        <EmptyState title="Aún no tienes proyectos">Apunta tus trabajos y entregas, divídelos en hitos y sigue su progreso.</EmptyState>
      ) : (
        <div className="stack-lg">
          <Stats
            items={[
              { value: active, label: active === 1 ? 'Proyecto activo' : 'Proyectos activos' },
              { value: thisWeek, label: thisWeek === 1 ? 'Entrega esta semana' : 'Entregas esta semana' },
            ]}
          />
          <Segmented label="Mostrar" options={FILTERS} value={filter} onChange={setFilter} />
          {shown.length === 0 ? (
            <EmptyState title="Nada por aquí con este filtro" />
          ) : (
            <ul className="card-grid tool-grid" aria-label="Proyectos">
              {shown.map((p) => (
                <li key={p.id}>
                  <ProjectCard project={p} subjects={subjects} classes={classes} onEdit={() => setEditing(p)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo proyecto' : 'Editar proyecto'}>
        {editing !== null && <ProjectForm project={editing === 'new' ? null : editing} count={projects.length} subjects={subjects} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

function ProjectCard({ project: p, subjects, classes, onEdit }: { project: Project; subjects: LegacySubject[]; classes: LegacyClass[]; onEdit: () => void }) {
  const actions = useModule('projects');
  const [open, setOpen] = useState(false);
  const color = safeColor(p.color, PROJECT_COLORS[0]);
  const title = p.title || 'Sin título';
  const status = statusOf(p);
  const pct = projectProgress(p);
  const done = p.milestones.filter((m) => m.done).length;
  // La materia va por nombre; su primera clase de la semana, como en la app anterior.
  const subject = p.subject ? subjects.find((s) => s.name === p.subject) : undefined;
  const firstClass = subject ? classes.filter((c) => c.subject === subject.id).sort((a, b) => a.day - b.day || String(a.start).localeCompare(String(b.start)))[0] : undefined;
  const panelId = `milestones-${p.id}`;
  const titleId = `project-${p.id}`;

  return (
    <article className={`card tool-card${status === 'entregado' ? ' tool-card--done' : ''}`} style={{ ['--c' as string]: color }} aria-labelledby={titleId}>
      <div className="tool-card__head">
        <h2 id={titleId} className="tool-card__title">
          {title}
        </h2>
        <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Editar «${title}»`}>
          <Pencil size={18} aria-hidden="true" />
        </button>
      </div>
      <ul className="meta-list">
        {p.subject && (
          <li>
            <span className="swatch-dot" aria-hidden="true" />
            <span className="visually-hidden">Materia: </span>
            {p.subject}
            {firstClass && (
              <span className="muted">
                {' '}
                · <Clock size={13} aria-hidden="true" className="inline-icon" /> {CLASS_DAYS[firstClass.day - 1]} {firstClass.start}
              </span>
            )}
          </li>
        )}
        <li>
          <CalendarClock size={15} aria-hidden="true" />
          Entrega · {p.deadline?.trim() ? p.deadline : 'sin fecha'}
        </li>
      </ul>
      <Segmented label={`Estado de «${title}»`} options={STATUS_OPTIONS} value={status} onChange={(s) => actions.update(p.id, { status: s })} />
      <div className="meter-row">
        <Meter value={pct} color={color} label={`Progreso de ${title}`} />
        <span className="numeric small">{pct} %</span>
      </div>
      <button type="button" className="btn btn--ghost btn--sm disclosure" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen((o) => !o)}>
        Hitos{p.milestones.length ? ` · ${done}/${p.milestones.length}` : ''}
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <CheckList
          id={panelId}
          items={p.milestones}
          onChange={(milestones) => actions.update(p.id, { milestones: checkItemsPayload(milestones) })}
          owner={title}
          noun="hito"
          listLabel="Hitos"
          placeholder="Añadir hito"
          // `date` existe en el formato pero la app anterior siempre lo deja vacío.
          make={(name) => ({ id: newSubId(), name, date: '', done: false })}
        />
      )}
    </article>
  );
}

function ProjectForm({ project, count, subjects, onDone }: { project: Project | null; count: number; subjects: LegacySubject[]; onDone: () => void }) {
  const actions = useModule('projects');
  const [title, setTitle] = useState(project?.title ?? '');
  const [subject, setSubject] = useState(project?.subject ?? '');
  const [deadline, setDeadline] = useState(project?.deadline ?? '');
  const [status, setStatus] = useState<ProjectStatus>(project ? statusOf(project) : 'curso');
  const [color, setColor] = useState(safeColor(project?.color, PROJECT_COLORS[count % PROJECT_COLORS.length]));
  const names = subjects.map((s) => s.name).filter((n): n is string => typeof n === 'string' && !!n);
  const unknown = subject && !names.includes(subject);

  const pickSubject = (name: string) => {
    setSubject(name);
    // Como la app anterior: el proyecto toma el color de su materia.
    const s = subjects.find((x) => x.name === name);
    if (s) setColor(safeColor(s.color, color));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fields = { title: title.trim(), subject, deadline: deadline.trim(), status, color };
    if (project) actions.update(project.id, fields);
    else actions.add({ id: newId(), ...fields, milestones: [] });
    onDone();
  };

  const n = project?.milestones.length ?? 0;
  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="Nombre" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required autoFocus placeholder="Ensayo de Historia" />
      <SelectField label="Materia" value={subject} onChange={(e) => pickSubject(e.target.value)} hint={unknown ? 'Esta materia ya no está en tu lista.' : undefined}>
        <option value="">Sin materia</option>
        {names.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
        {unknown && <option value={subject}>{subject}</option>}
      </SelectField>
      <TextField label="Entrega (opcional)" value={deadline} onChange={(e) => setDeadline(e.target.value)} maxLength={60} placeholder="20 SEP" hint="Escríbela como quieras: «20 SEP», «viernes»…" />
      <SelectField label="Estado" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </SelectField>
      <ColorPicker legend="Color" colors={paletteWith(PROJECT_COLORS, color)} value={color} onChange={setColor} names={COLOR_NAMES} />
      <FormActions
        submitLabel={project ? 'Guardar' : 'Añadir proyecto'}
        disabled={!title.trim()}
        onDelete={
          project
            ? () => {
                actions.remove(project.id);
                onDone();
              }
            : undefined
        }
        confirm={`Se borrará «${project?.title || 'el proyecto'}»${n ? ` con ${plural(n, 'hito', 'hitos')}` : ''}.`}
      />
    </form>
  );
}
