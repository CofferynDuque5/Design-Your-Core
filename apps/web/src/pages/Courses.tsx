import { COURSE_STATUSES, COURSE_STATUS_INFO, courseName, coursesByTopic, courseSource, normalizeCourseUrl, validCourseUrl, type CourseStatus, type LegacyCourse } from '@dyc/core';
import { ExternalLink, GraduationCap, Link2, MonitorPlay, Pencil, Plus } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { newId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { SelectField, TextArea, TextField } from '../components/Form';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { FormActions } from '../components/ToolParts';
import { plural } from '../lib/format';

type Filter = 'todos' | CourseStatus;
const NEXT_STATUS: Record<CourseStatus, CourseStatus> = { pendiente: 'curso', curso: 'hecho', hecho: 'pendiente' };
const statusOf = (c: LegacyCourse): CourseStatus => (COURSE_STATUSES.includes(c.status) ? c.status : 'pendiente');

export function Courses() {
  const legacy = useLegacyData();
  const courses = useLegacyList(legacy.data?.data, 'courses');
  const actions = useModule('courses');
  const [filter, setFilter] = useState<Filter>('todos');
  // `topic` sin curso: añadir uno nuevo a ese tema.
  const [editing, setEditing] = useState<LegacyCourse | { topic: string } | null>(null);
  const shown = courses.filter((c) => filter === 'todos' || statusOf(c) === filter);
  const groups = coursesByTopic(shown);
  const topics = coursesByTopic(courses).map((g) => g.topic);
  const pending = courses.filter((c) => statusOf(c) !== 'hecho').length;

  return (
    <div className="page">
      <PageHeader eyebrow="Estudio y trabajo" title="Cursos">
        <button type="button" className="btn" onClick={() => setEditing({ topic: '' })} disabled={!legacy.data}>
          <Plus size={18} aria-hidden="true" /> Nuevo curso
        </button>
      </PageHeader>
      {legacy.isPending ? (
        <Loading label="Cargando tus cursos" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : courses.length === 0 ? (
        <EmptyState
          title="Anota lo que quieres aprender"
          action={
            <button type="button" className="btn" onClick={() => setEditing({ topic: '' })}>
              <Plus size={18} aria-hidden="true" /> Añadir el primero
            </button>
          }
        >
          Escribe un tema y pega el enlace del curso o del video: YouTube, Udemy, Coursera, Platzi o cualquier página. Lo abres desde aquí cuando quieras estudiar.
        </EmptyState>
      ) : (
        <div className="stack-lg">
          <div className="row course-bar">
            <div className="chips" role="group" aria-label="Estado">
              {(['todos', ...COURSE_STATUSES] as Filter[]).map((f) => (
                <button key={f} type="button" className="chip-btn" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f === 'todos' ? 'Todos' : COURSE_STATUS_INFO[f].label}
                </button>
              ))}
            </div>
            <span className="chip numeric">{plural(pending, 'por ver', 'por ver')}</span>
          </div>
          {groups.length === 0 ? (
            <EmptyState title={`Nada en «${COURSE_STATUS_INFO[filter as CourseStatus].label}»`}>Cambia el estado de un curso con el botón que tiene al lado.</EmptyState>
          ) : (
            <div className="card-grid tool-grid">
              {groups.map((g) => (
                <TopicCard key={g.topic} topic={g.topic} items={g.items} onEdit={setEditing} onAdd={() => setEditing({ topic: g.topic })} onStatus={(c) => actions.update(c.id, { status: NEXT_STATUS[statusOf(c)] })} />
              ))}
            </div>
          )}
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing && 'id' in editing ? 'Editar curso' : 'Nuevo curso'}>
        {editing && <CourseForm course={'id' in editing ? editing : null} topic={editing.topic} topics={topics} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

function TopicCard({ topic, items, onEdit, onAdd, onStatus }: { topic: string; items: LegacyCourse[]; onEdit: (c: LegacyCourse) => void; onAdd: () => void; onStatus: (c: LegacyCourse) => void }) {
  const id = useId();
  const done = items.filter((c) => statusOf(c) === 'hecho').length;
  return (
    <section className="card tool-card course-card" aria-labelledby={`${id}-t`}>
      <div className="tool-card__head">
        <h2 id={`${id}-t`} className="tool-card__title">
          {topic}
        </h2>
        <span className="small muted numeric">
          {done} de {items.length}
        </span>
      </div>
      <ul className="course-list" aria-label={`Cursos de ${topic}`}>
        {items.map((c) => (
          <CourseRow key={c.id} course={c} onEdit={() => onEdit(c)} onStatus={() => onStatus(c)} />
        ))}
      </ul>
      <button type="button" className="btn btn--ghost btn--sm" onClick={onAdd}>
        <Plus size={16} aria-hidden="true" /> Añadir a {topic}
      </button>
    </section>
  );
}

function CourseRow({ course: c, onEdit, onStatus }: { course: LegacyCourse; onEdit: () => void; onStatus: () => void }) {
  const source = courseSource(c.url);
  const name = courseName(c);
  const status = statusOf(c);
  const Icon = !source ? GraduationCap : source.video ? MonitorPlay : Link2;
  return (
    <li className={`course-row course-row--${status}`}>
      <Icon className="course-row__icon" size={18} aria-hidden="true" />
      <div className="course-row__main">
        {c.url ? (
          <a className="course-row__name" href={c.url} target="_blank" rel="noopener noreferrer">
            {name}
            <ExternalLink size={14} aria-hidden="true" />
            <span className="visually-hidden"> (se abre en otra pestaña)</span>
          </a>
        ) : (
          <span className="course-row__name">{name}</span>
        )}
        {(source || c.notes) && <span className="small muted course-row__meta">{[source?.label, c.notes.split('\n')[0]].filter(Boolean).join(' · ')}</span>}
      </div>
      <button type="button" className={`course-status course-status--${status}`} onClick={onStatus} aria-label={`Estado de «${name}»: ${COURSE_STATUS_INFO[status].label}. Cambiar a ${COURSE_STATUS_INFO[NEXT_STATUS[status]].label}`}>
        {COURSE_STATUS_INFO[status].short}
      </button>
      <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Editar «${name}»`}>
        <Pencil size={18} aria-hidden="true" />
      </button>
    </li>
  );
}

function CourseForm({ course, topic: initialTopic, topics, onDone }: { course: LegacyCourse | null; topic: string; topics: string[]; onDone: () => void }) {
  const actions = useModule('courses');
  const listId = useId();
  const [topic, setTopic] = useState(course?.topic ?? initialTopic);
  const [url, setUrl] = useState(course?.url ?? '');
  const [title, setTitle] = useState(course?.title ?? '');
  const [status, setStatus] = useState<CourseStatus>(course ? statusOf(course) : 'pendiente');
  const [notes, setNotes] = useState(course?.notes ?? '');
  const link = normalizeCourseUrl(url);
  const badUrl = !validCourseUrl(link);
  const source = !badUrl ? courseSource(link) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fields = { topic: topic.trim(), url: link, title: title.trim(), status, notes };
    if (course) actions.update(course.id, fields);
    else actions.add({ id: newId(), ...fields });
    onDone();
  };

  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="Tema" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={120} required autoFocus={!initialTopic} placeholder="Inglés, React, Finanzas…" list={topics.length ? listId : undefined} />
      {topics.length > 0 && (
        <datalist id={listId}>
          {topics.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      )}
      <TextField
        label="Enlace (opcional)"
        type="url"
        inputMode="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={() => setUrl(link)}
        maxLength={2000}
        autoFocus={!!initialTopic && !course}
        placeholder="https://youtube.com/…"
        error={url.trim() && badUrl ? 'Pega un enlace completo, por ejemplo https://youtube.com/watch?v=…' : null}
        hint={source ? `Se abrirá en ${source.label}.` : 'De YouTube, Udemy, Coursera, Platzi o cualquier página.'}
      />
      <TextField label="Nombre (opcional)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Curso completo de inglés básico" />
      <SelectField label="Estado" value={status} onChange={(e) => setStatus(e.target.value as CourseStatus)}>
        {COURSE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {COURSE_STATUS_INFO[s].label}
          </option>
        ))}
      </SelectField>
      <TextArea label="Notas (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} rows={3} placeholder="Voy en la lección 4…" />
      <FormActions
        submitLabel={course ? 'Guardar' : 'Añadir curso'}
        disabled={!topic.trim() || (!!url.trim() && badUrl)}
        onDelete={
          course
            ? () => {
                actions.remove(course.id);
                onDone();
              }
            : undefined
        }
        confirm={course ? `Se borrará «${courseName(course)}».` : undefined}
      />
    </form>
  );
}
