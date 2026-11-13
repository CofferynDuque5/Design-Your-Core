import {
  matchesSearch,
  parseDeadline,
  byWeekday,
  CLASS_DAYS,
  checkItems,
  checkItemsPayload,
  COLOR_NAMES,
  dueThisWeek,
  PROJECT_COLORS,
  PROJECT_PRIORITIES,
  PROJECT_TODO_KIND_INFO,
  PROJECT_TODO_KINDS,
  projectCategoriesOf,
  projectCategoriesPatch,
  projectCategoryChoices,
  projectCategoryLabel,
  PROJECT_CATEGORIES_MAX,
  projectMailLink,
  projectTodos,
  PROJECT_PRIORITY_INFO,
  PROJECT_STATUS_INFO,
  PROJECT_STATUSES,
  projectIdsByPriority,
  projectPriorityOf,
  projectProgress,
  projectsInOrder,
  projectStatusOf,
  type LegacyClass,
  type LegacyMilestone,
  type LegacyProject,
  type LegacyProjectTodo,
  type LegacySubject,
  type ProjectTodoKind,
  type ProjectPriority,
  type ProjectStatus,
} from '@dyc/core';
import { ArrowDownWideNarrow, CalendarClock, ChevronDown, ChevronUp, Clock, ExternalLink, Flag, Mail, Pencil, Plus, Send, Shapes } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { newId, newSubId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { PageHeader } from '../components/AppShell';
import { SearchBox } from '../components/SearchBox';
import { Dialog } from '../components/Dialog';
import { ColorPicker, Segmented, SelectField, TagPicker, TextField } from '../components/Form';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { CheckList, FormActions, Meter, paletteWith, safeColor, Stats, RemoveButton } from '../components/ToolParts';
import { plural } from '../lib/format';

type Project = LegacyProject & { milestones: LegacyMilestone[]; todos: LegacyProjectTodo[] };
type Filter = 'todos' | 'curso' | 'entregado';
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'curso', label: 'En curso' },
  { value: 'entregado', label: 'Entregados' },
];
const STATUS_OPTIONS = PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_INFO[s].label }));
const KIND_OPTIONS = PROJECT_TODO_KINDS.map((k) => ({ value: k, label: PROJECT_TODO_KIND_INFO[k].label }));
const PRIORITY_OPTIONS = PROJECT_PRIORITIES.map((p) => ({ value: p, label: PROJECT_PRIORITY_INFO[p].label }));
/** Un estado desconocido se muestra como «En curso», sin cambiar el dato. */
const statusOf = projectStatusOf;

export function Projects() {
  const legacy = useLegacyData();
  const raw = useLegacyList(legacy.data?.data, 'projects');
  const subjects = useLegacyList(legacy.data?.data, 'subjects');
  const classes = useLegacyList(legacy.data?.data, 'classes');
  // Orden «terminar primero»: el de la lista guardada, con los entregados al final.
  const projects = useMemo<Project[]>(() => projectsInOrder(raw.map((p) => ({ ...p, milestones: checkItems<LegacyMilestone>(p.milestones, newSubId), todos: projectTodos(p, newSubId) }))), [raw]);
  const actions = useModule('projects');
  const [filter, setFilter] = useState<Filter>('todos');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string>('todas');
  const [editing, setEditing] = useState<Project | 'new' | null>(null);

  const active = projects.filter((p) => statusOf(p) !== 'entregado').length;
  const thisWeek = projects.filter((p) => dueThisWeek(p.deadline)).length;
  // Igual que la app anterior: «En curso» incluye los que están en revisión.
  const categories = projectCategoryChoices(projects).filter((c) => projects.some((p) => projectCategoriesOf(p).includes(c)));
  const uncategorized = projects.some((p) => !projectCategoriesOf(p).length);
  const shown = (filter === 'todos' ? projects : projects.filter((p) => (filter === 'entregado' ? statusOf(p) === 'entregado' : statusOf(p) !== 'entregado')))
    .filter((p) => category === 'todas' || (category === 'ninguna' ? !projectCategoriesOf(p).length : projectCategoriesOf(p).includes(category)))
    .filter((p) => {
      return matchesSearch(q, p.title, p.subject, p.deadline, ...projectCategoriesOf(p).map(projectCategoryLabel), p.email, ...p.milestones.map((m) => m.name), ...p.todos.map((t) => t.name));
    });
  const open = projects.filter((p) => statusOf(p) !== 'entregado');

  // Sube o baja un proyecto pendiente un puesto; los entregados quedan al final.
  const move = (id: string, delta: -1 | 1) => {
    const ids = open.map((p) => p.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    actions.reorder([...ids, ...projects.filter((p) => statusOf(p) === 'entregado').map((p) => p.id)]);
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Estudio y trabajo" title="Proyectos">
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
          <SearchBox label="Buscar en tus proyectos" value={q} onChange={setQ} placeholder="Buscar por nombre, categoría, hito o pendiente…" count={shown.length} />
          <div className="row projects-toolbar">
            <Segmented label="Mostrar" options={FILTERS} value={filter} onChange={setFilter} />
            {categories.length > 0 && (
              <SelectField label="Categoría" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="todas">Todas las categorías</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {projectCategoryLabel(c)} ({projects.filter((p) => projectCategoriesOf(p).includes(c)).length})
                  </option>
                ))}
                {uncategorized && <option value="ninguna">Sin categoría</option>}
              </SelectField>
            )}
            {open.length > 1 && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => actions.reorder(projectIdsByPriority(projects))}>
                <ArrowDownWideNarrow size={16} aria-hidden="true" /> Ordenar por prioridad
              </button>
            )}
          </div>
          {open.length > 0 && filter !== 'entregado' && <p className="muted small">El orden es el de «terminar primero»: sube o baja cada proyecto con las flechas.</p>}
          {shown.length === 0 ? (
            q.trim() ? null : (
              <EmptyState title="Nada por aquí con este filtro" />
            )
          ) : (
            <ul className="card-grid tool-grid" aria-label="Proyectos">
              {shown.map((p) => (
                <li key={p.id}>
                  <ProjectCard
                    project={p}
                    subjects={subjects}
                    classes={classes}
                    place={open.indexOf(p)}
                    total={open.length}
                    onMove={(d) => move(p.id, d)}
                    onEdit={() => setEditing(p)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo proyecto' : 'Editar proyecto'}>
        {editing !== null && <ProjectForm project={editing === 'new' ? null : editing} count={projects.length} subjects={subjects} all={projects} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

function ProjectCard({
  project: p,
  subjects,
  classes,
  place,
  total,
  onMove,
  onEdit,
}: {
  project: Project;
  subjects: LegacySubject[];
  classes: LegacyClass[];
  /** Puesto en «terminar primero» (desde 0), o -1 si está entregado. */
  place: number;
  total: number;
  onMove: (d: -1 | 1) => void;
  onEdit: () => void;
}) {
  const actions = useModule('projects');
  const [open, setOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [kind, setKind] = useState<ProjectTodoKind>('falta');
  const color = safeColor(p.color, PROJECT_COLORS[0]);
  const cats = projectCategoriesOf(p);
  const mailLink = projectMailLink(p);
  const missing = p.todos.filter((t) => t.kind === 'falta' && !t.done).length;
  const ideas = p.todos.filter((t) => t.kind === 'mejora' && !t.done).length;
  const listId = `todos-${p.id}`;
  const title = p.title || 'Sin título';
  const status = statusOf(p);
  const priority = projectPriorityOf(p);
  const pct = projectProgress(p);
  const done = p.milestones.filter((m) => m.done).length;
  // La materia va por nombre; su primera clase de la semana, como en la app anterior.
  const subject = p.subject ? subjects.find((s) => s.name === p.subject) : undefined;
  const firstClass = subject ? classes.filter((c) => c.subject === subject.id).sort(byWeekday)[0] : undefined;
  const panelId = `milestones-${p.id}`;
  const titleId = `project-${p.id}`;

  return (
    <article className={`card tool-card${status === 'entregado' ? ' tool-card--done' : ''}`} style={{ ['--c' as string]: color }} aria-labelledby={titleId}>
      <div className="tool-card__head">
        {place >= 0 && (
          <span className="project-place numeric" aria-label={`Puesto ${place + 1} de ${total}`}>
            {place + 1}
          </span>
        )}
        <h2 id={titleId} className="tool-card__title">
          {title}
        </h2>
        <div className="row">
          {place >= 0 && total > 1 && (
            <>
              <button type="button" className="icon-btn" disabled={place === 0} onClick={() => onMove(-1)} aria-label={`Subir «${title}»`}>
                <ChevronUp size={18} aria-hidden="true" />
              </button>
              <button type="button" className="icon-btn" disabled={place === total - 1} onClick={() => onMove(1)} aria-label={`Bajar «${title}»`}>
                <ChevronDown size={18} aria-hidden="true" />
              </button>
            </>
          )}
          <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Editar «${title}»`}>
            <Pencil size={18} aria-hidden="true" />
          </button>
          <RemoveButton module="projects" id={p.id} name={title} />
        </div>
      </div>
      <ul className="meta-list">
        {cats.length > 0 && (
          <li>
            <Shapes size={15} aria-hidden="true" />
            <span className="visually-hidden">{cats.length === 1 ? 'Categoría: ' : 'Categorías: '}</span>
            {cats.map(projectCategoryLabel).join(' · ')}
          </li>
        )}
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
        <li className={`project-priority project-priority--${priority}`}>
          <Flag size={15} aria-hidden="true" />
          Prioridad {PROJECT_PRIORITY_INFO[priority].label.toLowerCase()}
        </li>
        <li>
          <CalendarClock size={15} aria-hidden="true" />
          Entrega · {p.deadline?.trim() ? p.deadline : 'sin fecha'}
        </li>
        {p.email && (
          <li className="project-mail">
            <Mail size={15} aria-hidden="true" />
            <span className="visually-hidden">Correo: </span>
            <span className="project-mail__address">{p.email}</span>
          </li>
        )}
      </ul>
      {p.email && (
        <div className="row project-mail__actions">
          {mailLink && (
            <a className="btn btn--secondary btn--sm" href={mailLink} target="_blank" rel="noopener noreferrer" aria-label={`Abrir el correo ${p.email} (se abre en otra pestaña)`}>
              <ExternalLink size={16} aria-hidden="true" /> Abrir el correo
            </a>
          )}
          <a className="btn btn--ghost btn--sm" href={`mailto:${p.email}`} aria-label={`Escribir a ${p.email}`}>
            <Send size={16} aria-hidden="true" /> Escribir
          </a>
        </div>
      )}
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
      <button type="button" className="btn btn--ghost btn--sm disclosure" aria-expanded={listOpen} aria-controls={listOpen ? listId : undefined} onClick={() => setListOpen((o) => !o)}>
        Por terminar{missing || ideas ? ` · ${missing} ${missing === 1 ? 'falta' : 'faltan'} · ${plural(ideas, 'mejora', 'mejoras')}` : ''}
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {listOpen && (
        <div className="stack-sm" id={listId}>
          <Segmented label={`Lista de «${title}»`} options={KIND_OPTIONS} value={kind} onChange={setKind} />
          <CheckList
            id={`${listId}-${kind}`}
            items={p.todos.filter((t) => t.kind === kind)}
            onChange={(next) => actions.update(p.id, { todos: checkItemsPayload([...p.todos.filter((t) => t.kind !== kind), ...next]) })}
            owner={title}
            noun={PROJECT_TODO_KIND_INFO[kind].noun}
            listLabel={PROJECT_TODO_KIND_INFO[kind].label}
            placeholder={kind === 'falta' ? 'Qué falta para terminar' : 'Qué se podría mejorar'}
            make={(name) => ({ id: newSubId(), name, done: false, kind })}
          />
        </div>
      )}
    </article>
  );
}

function ProjectForm({ project, count, subjects, all, onDone }: { project: Project | null; count: number; subjects: LegacySubject[]; all: Project[]; onDone: () => void }) {
  const actions = useModule('projects');
  const [title, setTitle] = useState(project?.title ?? '');
  const [subject, setSubject] = useState(project?.subject ?? '');
  const [deadline, setDeadline] = useState(project?.deadline ?? '');
  const [status, setStatus] = useState<ProjectStatus>(project ? statusOf(project) : 'curso');
  const [priority, setPriority] = useState<ProjectPriority>(project ? projectPriorityOf(project) : 'media');
  const [color, setColor] = useState(safeColor(project?.color, PROJECT_COLORS[count % PROJECT_COLORS.length]));
  const [cats, setCats] = useState<string[]>(project ? projectCategoriesOf(project) : []);
  const [email, setEmail] = useState(project?.email ?? '');
  const [mailUrl, setMailUrl] = useState(project?.mailUrl ?? '');
  const badEmail = !!email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const badMailUrl = !!mailUrl.trim() && !/^https?:\/\/\S+\.\S+/i.test(mailUrl.trim());
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
    if (badEmail || badMailUrl) return;
    const fields = { title: title.trim(), subject, deadline: deadline.trim(), status, priority, color, ...projectCategoriesPatch(cats), email: email.trim(), mailUrl: mailUrl.trim() };
    if (project) actions.update(project.id, fields);
    else actions.add({ id: newId(), ...fields, milestones: [], todos: [] });
    onDone();
  };

  const n = project?.milestones.length ?? 0;
  const pendingMilestones = project?.milestones.filter((m) => !m.done).length ?? 0;
  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="Nombre" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required autoFocus placeholder="Ensayo de Historia" />
      <TagPicker
        legend="Categorías"
        options={projectCategoryChoices(all).map((c) => ({ value: c, label: projectCategoryLabel(c) }))}
        value={cats}
        onChange={setCats}
        addLabel="Agregar categoría"
        addPlaceholder="Escribe una categoría nueva"
        max={PROJECT_CATEGORIES_MAX}
        hint="Elige una o varias; puedes agregar las tuyas."
      />
      <SelectField label="Materia" value={subject} onChange={(e) => pickSubject(e.target.value)} hint={unknown ? 'Esta materia ya no está en tu lista.' : undefined}>
        <option value="">Sin materia</option>
        {names.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
        {unknown && <option value={subject}>{subject}</option>}
      </SelectField>
      <TextField
        label="Entrega (opcional)"
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
        maxLength={60}
        placeholder="20 SEP"
        hint={deadline.trim() && !parseDeadline(deadline) ? 'No entendí la fecha: no contará en «Entregas esta semana». Prueba «20 SEP», «20/12» o «viernes».' : 'Escríbela como quieras: «20 SEP», «20/12», «viernes»…'}
      />
      <SelectField
        label="Estado"
        value={status}
        onChange={(e) => setStatus(e.target.value as ProjectStatus)}
        hint={status === 'entregado' && pendingMilestones > 0 ? `Ojo: ${pendingMilestones === 1 ? 'falta 1 hito' : `faltan ${pendingMilestones} hitos`} por marcar.` : undefined}
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </SelectField>
      <Segmented label="Prioridad" options={PRIORITY_OPTIONS} value={priority} onChange={setPriority} />
      <TextField
        label="Correo del sitio (opcional)"
        type="email"
        inputMode="email"
        autoComplete="off"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        maxLength={200}
        placeholder="contacto@misitio.com"
        error={badEmail ? 'Escribe un correo completo, por ejemplo contacto@misitio.com' : null}
        hint="Aparece en la tarjeta con «Abrir el correo» y «Escribir»."
      />
      {email.trim() && (
        <TextField
          label="Enlace para abrir el correo (opcional)"
          type="url"
          inputMode="url"
          value={mailUrl}
          onChange={(e) => setMailUrl(e.target.value)}
          maxLength={500}
          placeholder={projectMailLink({ email }) ?? 'https://misitio.com/webmail'}
          error={badMailUrl ? 'Pega un enlace completo, por ejemplo https://misitio.com/webmail' : null}
          hint="Si lo dejas vacío se abre el webmail del dominio (cPanel). Pon otro si usas Gmail, Outlook o Zoho."
        />
      )}
      <ColorPicker legend="Color" colors={paletteWith(PROJECT_COLORS, color)} value={color} onChange={setColor} names={COLOR_NAMES} />
      <FormActions
        submitLabel={project ? 'Guardar' : 'Añadir proyecto'}
        disabled={!title.trim() || badEmail || badMailUrl}
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
