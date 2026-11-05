import {
  CLASS_COLORS,
  CLASS_DAY_NAMES,
  COURSE_STATUSES,
  COURSE_STATUS_INFO,
  courseClasses,
  courseName,
  courseProgress,
  courseResume,
  coursePlaybackPatch,
  coursesBySubtopic,
  coursesByTopic,
  courseOrigin,
  courseLevel,
  courseRemaining,
  courseRoute,
  COURSE_LEVEL_LABEL,
  handoffClasses,
  courseSource,
  formatLength,
  HHMM_RE,
  planTopics,
  STUDY_SESSIONS,
  STUDY_WEEKLY,
  normalizeCourseUrl,
  validCourseUrl,
  youtubeRef,
  type CourseLength,
  type CourseLengthFrom,
  type CourseStatus,
  type LegacyCourse,
} from '@dyc/core';
import { CalendarClock, CalendarPlus, ExternalLink, Gauge, GraduationCap, Link2, MonitorPlay, Pencil, Play, Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../app/api';
import { newId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { SelectField, TextArea, TextField } from '../components/Form';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { FormActions, WeekdayPicker } from '../components/ToolParts';
import { useToast } from '../app/toast';
import { YouTubePlayer } from '../components/YouTubePlayer';
import { readYouTubeLength } from '../lib/youtubeLength';
import { plural } from '../lib/format';

type Filter = 'todos' | CourseStatus;
const NEXT_STATUS: Record<CourseStatus, CourseStatus> = {
  pendiente: 'curso',
  curso: 'hecho',
  hecho: 'pendiente',
};
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
  const [watching, setWatching] = useState<string | null>(null);
  const [logging, setLogging] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const update = useCourseUpdate();
  const [params, setParams] = useSearchParams();
  // Volver de otra pestaña después de abrir un curso de Udemy, Coursera…: pregunta hasta dónde llegaste.
  const away = useRef<string | null>(null);
  useEffect(() => {
    const back = () => {
      if (document.visibilityState === 'visible' && away.current) {
        setLogging(away.current);
        away.current = null;
      }
    };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => {
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('focus', back);
    };
  }, []);
  // «/cursos?abrir=<id>» (desde el Horario o un aviso): abre el curso.
  const toOpen = params.get('abrir');
  useEffect(() => {
    if (!toOpen || !legacy.data) return;
    const c = courses.find((x) => x.id === toOpen);
    if (c) {
      if (c.url && youtubeRef(c.url)) setWatching(c.id);
      else setLogging(c.id);
    }
    setParams({}, { replace: true });
  }, [toOpen, legacy.data, courses, setParams]);
  const open = (c: LegacyCourse) => {
    if (youtubeRef(c.url)) setWatching(c.id);
    else {
      away.current = c.id;
      actions.update(c.id, {
        lastAt: new Date().toISOString(),
        ...(statusOf(c) === 'pendiente' ? { status: 'curso' } : {}),
      });
    }
  };
  const byId = (id: string | null) => (id ? courses.find((c) => c.id === id) : undefined);
  const watched = byId(watching);
  const logged = byId(logging);
  const scheduled = byId(scheduling);

  return (
    <div className="page">
      <PageHeader eyebrow="Estudio y trabajo" title="Cursos">
        <button type="button" className="btn" onClick={() => setEditing({ topic: '' })} disabled={!legacy.data}>
          <Plus size={18} aria-hidden="true" /> Nuevo curso
        </button>
        {pending > 0 && (
          <button type="button" className="btn btn--secondary" onClick={() => setPlanning(true)} disabled={!legacy.data}>
            <CalendarClock size={18} aria-hidden="true" /> Crear horario
          </button>
        )}
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
                <TopicCard
                  key={g.topic}
                  topic={g.topic}
                  items={g.items}
                  all={coursesByTopic(courses).find((x) => x.topic.toLocaleLowerCase('es') === g.topic.toLocaleLowerCase('es'))?.items ?? g.items}
                  classes={(c) => courseClasses(legacy.data?.data, c.id)}
                  onEdit={setEditing}
                  onAdd={() => setEditing({ topic: g.topic })}
                  onStatus={(c) => update(c, { status: NEXT_STATUS[statusOf(c)] })}
                  onOpen={open}
                  onLog={(c) => setLogging(c.id)}
                  onSchedule={(c) => setScheduling(c.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing && 'id' in editing ? 'Editar curso' : 'Nuevo curso'}>
        {editing && <CourseForm course={'id' in editing ? editing : null} topic={editing.topic} topics={topics} courses={courses} onDone={() => setEditing(null)} />}
      </Dialog>
      <Dialog open={!!watched} onClose={() => setWatching(null)} title={watched ? courseName(watched) : 'Curso'} wide>
        {watched && <Watch course={watched} />}
      </Dialog>
      <Dialog open={!!logged} onClose={() => setLogging(null)} title="¿Hasta dónde llegaste?">
        {logged && <ProgressForm course={logged} onDone={() => setLogging(null)} />}
      </Dialog>
      <Dialog open={planning} onClose={() => setPlanning(false)} title="Crear horario" wide>
        {planning && <StudyPlanner courses={courses} onDone={() => setPlanning(false)} />}
      </Dialog>
      <Dialog open={!!scheduled} onClose={() => setScheduling(null)} title="Agregar al horario">
        {scheduled && <ScheduleForm course={scheduled} count={(legacy.data?.data.classes as unknown[] | undefined)?.length ?? 0} onDone={() => setScheduling(null)} />}
      </Dialog>
    </div>
  );
}

interface RowActions {
  onEdit: (c: LegacyCourse) => void;
  onStatus: (c: LegacyCourse) => void;
  onOpen: (c: LegacyCourse) => void;
  onLog: (c: LegacyCourse) => void;
  onSchedule: (c: LegacyCourse) => void;
  classes: (c: LegacyCourse) => Array<{ day: number; start: string }>;
}

function TopicCard({ topic, items, all, onAdd, ...row }: { topic: string; items: LegacyCourse[]; all: LegacyCourse[]; onAdd: () => void } & RowActions) {
  const id = useId();
  // Ruta del tema con todos sus cursos (aunque el filtro oculte algunos).
  const route = courseRoute(all);
  const next = route.find((c) => statusOf(c) !== 'hecho');
  const shown = route.filter((c) => items.includes(c));
  const done = all.filter((c) => statusOf(c) === 'hecho').length;
  return (
    <section className="card tool-card course-card" aria-labelledby={`${id}-t`}>
      <div className="tool-card__head">
        <h2 id={`${id}-t`} className="tool-card__title">
          {topic}
        </h2>
        <span className="small muted numeric">
          {done} de {all.length}
        </span>
      </div>
      {all.length > 2 && <p className="small muted course-card__route">En orden: lo que empezaste y de lo básico a lo avanzado.</p>}
      {coursesBySubtopic(shown).map((g) => (
        <div key={g.subtopic || '-'} className="course-sub">
          {g.subtopic && (
            <h3 className="course-sub__title">
              {g.subtopic}
            </h3>
          )}
          <ul className="course-list" aria-label={g.subtopic ? `${topic}: ${g.subtopic}` : `Cursos de ${topic}`}>
            {g.items.map((c) => (
              <CourseRow key={c.id} course={c} next={all.length > 1 && c === next} {...row} />
            ))}
          </ul>
        </div>
      ))}
      <button type="button" className="btn btn--ghost btn--sm" onClick={onAdd}>
        <Plus size={16} aria-hidden="true" /> Añadir a {topic}
      </button>
    </section>
  );
}

/** «4 h 30 min» o, si la página solo da una cifra aproximada, «unas 20 h». */
export const lengthLabel = (c: LegacyCourse): string => (c.length ? `${c.lengthFrom === 'aprox' ? 'unas ' : ''}${formatLength(c.length)}` : '');

/**
 * Guarda cambios de un curso. Si con eso se termina, sus clases del Horario
 * pasan solas al siguiente curso del mismo tema.
 */
function useCourseUpdate() {
  const legacy = useLegacyData();
  const courses = useModule('courses');
  const classes = useModule('classes');
  const toast = useToast();
  return (c: LegacyCourse, patch: Partial<LegacyCourse>) => {
    courses.update(c.id, patch);
    if (patch.status !== 'hecho' || c.status === 'hecho') return;
    const { next, patches } = handoffClasses(legacy.data?.data, c.id);
    if (!next || !patches.length) return;
    for (const k of patches) classes.update(k.id, k.patch);
    toast(`Terminaste «${courseName(c)}». Tus clases siguen con «${courseName(next)}».`);
  };
}

/** «Básico», «Intermedio»… para mostrar junto a cada curso. */
const levelLabel = (c: LegacyCourse) => COURSE_LEVEL_LABEL[courseLevel(c).level];

const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
/** «Lun y Mié 18:00» */
export function scheduleText(list: Array<{ day: number; start: string }>): string {
  if (!list.length) return '';
  const sorted = [...list].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
  const days = [...new Set(sorted.map((k) => DAY_SHORT[k.day - 1]))];
  const times = [...new Set(sorted.map((k) => k.start))];
  const d = days.length > 1 ? `${days.slice(0, -1).join(', ')} y ${days.at(-1)}` : days[0];
  return times.length === 1 ? `${d} ${times[0]}` : d;
}

function CourseRow({ course: c, next, onEdit, onStatus, onOpen, onLog, onSchedule, classes }: { course: LegacyCourse; next?: boolean } & RowActions) {
  const source = courseSource(c.url);
  const name = courseName(c);
  const status = statusOf(c);
  const yt = !!youtubeRef(c.url);
  const Icon = !source ? GraduationCap : source.video ? MonitorPlay : Link2;
  const pct = courseProgress(c);
  const resume = courseResume(c);
  const inSchedule = scheduleText(classes(c));
  return (
    <li className={`course-row course-row--${status}`}>
      <Icon className="course-row__icon" size={18} aria-hidden="true" />
      <div className="course-row__main">
        {c.url && yt ? (
          <button type="button" className="course-row__name course-row__play" onClick={() => onOpen(c)} aria-label={`${pct > 0 && status !== 'hecho' ? 'Continuar' : 'Ver'} «${name}» aquí`}>
            {name}
            <Play size={14} aria-hidden="true" />
          </button>
        ) : c.url ? (
          <a className="course-row__name" href={c.url} target="_blank" rel="noopener noreferrer" onClick={() => onOpen(c)}>
            {name}
            <ExternalLink size={14} aria-hidden="true" />
            <span className="visually-hidden"> (se abre en otra pestaña)</span>
          </a>
        ) : (
          <span className="course-row__name">{name}</span>
        )}
        <span className="small muted course-row__meta">
          {next && <span className="course-row__next">Sigue</span>}
          {[levelLabel(c), c.source?.trim(), source?.label, lengthLabel(c), c.notes.split('\n')[0]].filter(Boolean).join(' · ')}
        </span>
        {(pct > 0 || resume) && status !== 'hecho' && (
          <span className="course-progress">
            <span className="course-progress__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Avance de «${name}»`}>
              <span style={{ width: `${pct}%` }} />
            </span>
            <span className="small muted">{resume || `${pct} %`}</span>
          </span>
        )}
        {inSchedule && (
          <Link to="/horario" className="small course-row__when">
            En tu horario: {inSchedule}
          </Link>
        )}
      </div>
      <div className="course-row__actions">
        <button
          type="button"
          className={`course-status course-status--${status}`}
          onClick={() => onStatus(c)}
          aria-label={`Estado de «${name}»: ${COURSE_STATUS_INFO[status].label}. Cambiar a ${COURSE_STATUS_INFO[NEXT_STATUS[status]].label}`}
        >
          {COURSE_STATUS_INFO[status].short}
        </button>
        {!yt && (
          <button type="button" className="icon-btn" onClick={() => onLog(c)} aria-label={`Anotar avance de «${name}»`}>
            <Gauge size={18} aria-hidden="true" />
          </button>
        )}
        <button type="button" className="icon-btn" onClick={() => onSchedule(c)} aria-label={`Agregar «${name}» al horario`}>
          <CalendarPlus size={18} aria-hidden="true" />
        </button>
        <button type="button" className="icon-btn" onClick={() => onEdit(c)} aria-label={`Editar «${name}»`}>
          <Pencil size={18} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

/** El video de YouTube dentro de la app: empieza donde lo dejaste y guarda al pausar. */
function Watch({ course: c }: { course: LegacyCourse }) {
  const update = useCourseUpdate();
  const ref = youtubeRef(c.url)!;
  // Si se guardó un video de la lista, se sigue en ese; si no, en el del enlace.
  const video = c.video || ref.video;
  const start = c.position && (!c.video || c.video === video) && courseProgress(c) < 100 ? Math.max(0, c.position - 3) : ref.start;
  const latest = useRef(c);
  latest.current = c;
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <div className="stack">
      <YouTubePlayer
        video={video}
        list={ref.list}
        start={start}
        title={courseName(c)}
        onProgress={(s) => {
          const patch = coursePlaybackPatch(latest.current, s);
          update(latest.current, patch);
          setSaved(courseResume({ ...latest.current, ...patch } as LegacyCourse));
        }}
      />
      <p className="small muted" role="status">
        {saved
          ? `Guardado: ${saved}.`
          : c.position
            ? `${courseResume(c)}: sigue desde ahí. Se guarda cada vez que pausas.`
            : 'Se guarda dónde lo pausas, para seguir después desde aquí o desde el teléfono.'}
      </p>
      <a className="btn btn--ghost btn--sm" href={c.url} target="_blank" rel="noopener noreferrer" style={{ alignSelf: 'flex-start' }}>
        <ExternalLink size={16} aria-hidden="true" /> Abrir en YouTube
      </a>
    </div>
  );
}

/** Udemy, Coursera…: no dicen cuánto viste, así que lo anotas tú al volver. */
function ProgressForm({ course: c, onDone }: { course: LegacyCourse; onDone: () => void }) {
  const update = useCourseUpdate();
  const [spot, setSpot] = useState(c.spot ?? '');
  const [pct, setPct] = useState(courseProgress(c));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    update(c, {
      spot: spot.trim(),
      progress: pct,
      lastAt: new Date().toISOString(),
      status: pct >= 100 ? 'hecho' : 'curso',
    });
    onDone();
  };
  return (
    <form className="stack" onSubmit={submit}>
      <p className="muted small">
        «{courseName(c)}» se abre en {courseSource(c.url)?.label ?? 'otra página'}, que no le cuenta a Design Your Core cuánto viste. Anótalo aquí y lo verás la próxima vez.
      </p>
      <TextField label="Dónde lo dejaste (opcional)" value={spot} onChange={(e) => setSpot(e.target.value)} maxLength={200} placeholder="Lección 12, módulo 3…" autoFocus />
      <div className="field">
        <label className="field__label" htmlFor="course-pct">
          Avance: <span className="numeric">{pct} %</span>
        </label>
        <input id="course-pct" type="range" min={0} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} />
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onDone}>
          Ahora no
        </button>
        <button type="submit" className="btn">
          Guardar avance
        </button>
      </div>
    </form>
  );
}

/** Crea clases del Horario para estudiar el curso cada semana. */
function ScheduleForm({ course: c, count, onDone }: { course: LegacyCourse; count: number; onDone: () => void }) {
  const actions = useModule('classes');
  const [days, setDays] = useState('');
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('19:00');
  const badTime = !HHMM_RE.test(start) || !HHMM_RE.test(end) || end <= start;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const color = CLASS_COLORS[count % CLASS_COLORS.length];
    for (const d of days.split('').map(Number)) {
      actions.add({
        id: newId(),
        day: d,
        start,
        end,
        title: courseName(c).slice(0, 120),
        room: courseOrigin(c).slice(0, 60),
        color,
        subject: '',
        course: c.id,
      });
    }
    onDone();
  };
  return (
    <form className="stack" onSubmit={submit}>
      <p className="muted small">Se añade a tu Horario los días que elijas. Desde ahí lo abres con un toque y, en el teléfono, te avisamos antes de empezar.</p>
      <WeekdayPicker
        legend="Días"
        value={days}
        onChange={setDays}
        hint={
          days
            ? `${days
                .split('')
                .map((d) => CLASS_DAY_NAMES[Number(d) - 1])
                .join(', ')}`
            : 'Elige uno o más días.'
        }
      />
      <div className="grid-2">
        <TextField label="Empieza" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
        <TextField
          label="Termina"
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          required
          error={HHMM_RE.test(start) && HHMM_RE.test(end) && end <= start ? 'Debe ser después de la hora de inicio.' : null}
        />
      </div>
      <FormActions submitLabel="Agregar al horario" disabled={!days || badTime} />
    </form>
  );
}

function CourseForm({ course, topic: initialTopic, topics, courses, onDone }: { course: LegacyCourse | null; topic: string; topics: string[]; courses: LegacyCourse[]; onDone: () => void }) {
  const actions = useModule('courses');
  const listId = useId();
  const subListId = useId();
  const sourceListId = useId();
  const [topic, setTopic] = useState(course?.topic ?? initialTopic);
  const [subtopic, setSubtopic] = useState(course?.subtopic ?? '');
  const [origin, setOrigin] = useState(course?.source ?? '');
  // Sugerencias: subcategorías de este tema y canales o academias ya usados.
  const subtopics = uniq(courses.filter((c) => c.topic.trim().toLocaleLowerCase('es') === topic.trim().toLocaleLowerCase('es')).map((c) => c.subtopic ?? ''));
  const origins = uniq(courses.map((c) => c.source ?? ''));
  const [url, setUrl] = useState(course?.url ?? '');
  const [title, setTitle] = useState(course?.title ?? '');
  const [status, setStatus] = useState<CourseStatus>(course ? statusOf(course) : 'pendiente');
  const [notes, setNotes] = useState(course?.notes ?? '');
  const link = normalizeCourseUrl(url);
  const badUrl = !validCourseUrl(link);
  const source = !badUrl ? courseSource(link) : null;
  const length = useCourseLength(course, (r) => {
    // Lo que diga YouTube solo llena lo que está vacío.
    if (r.author) setOrigin((v) => v || r.author!.slice(0, 120));
    if (r.title && !r.videos) setTitle((v) => v || r.title!.slice(0, 200));
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fields = {
      topic: topic.trim(),
      subtopic: subtopic.trim(),
      source: origin.trim(),
      url: link,
      title: title.trim(),
      status,
      notes,
      ...length.fields(),
    };
    const id = course?.id ?? newId();
    if (course) actions.update(id, fields);
    else actions.add({ id, ...fields });
    if (link && !badUrl) length.later(id, link, actions.update, { source: !fields.source });
    onDone();
  };

  return (
    <form className="stack" onSubmit={submit}>
      <TextField
        label="Tema"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        maxLength={120}
        required
        autoFocus={!initialTopic}
        placeholder="Inglés, React, Finanzas…"
        list={topics.length ? listId : undefined}
      />
      {topics.length > 0 && (
        <datalist id={listId}>
          {topics.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      )}
      <TextField
        label="Subcategoría (opcional)"
        value={subtopic}
        onChange={(e) => setSubtopic(e.target.value)}
        maxLength={120}
        placeholder="Hooks, Gramática, Ahorro…"
        hint="Agrupa los cursos dentro del tema."
        list={subtopics.length ? subListId : undefined}
      />
      {subtopics.length > 0 && (
        <datalist id={subListId}>
          {subtopics.map((t) => (
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
        onBlur={() => {
          setUrl(link);
          // Con solo pegar el enlace se busca cuánto dura.
          if (link && !badUrl) length.lookup(link, false);
        }}
        maxLength={2000}
        autoFocus={!!initialTopic && !course}
        placeholder="https://youtube.com/…"
        error={url.trim() && badUrl ? 'Pega un enlace completo, por ejemplo https://youtube.com/watch?v=…' : null}
        hint={source ? `Se abrirá en ${source.label}.` : 'De YouTube, Udemy, Coursera, Platzi o cualquier página.'}
      />
      <div className="course-length">
        <TextField
          label="Duración total en horas (opcional)"
          type="number"
          inputMode="decimal"
          min={0}
          max={2000}
          step="any"
          value={length.hours}
          onChange={(e) => length.type(e.target.value)}
          placeholder="12.5"
          hint={length.message}
          error={length.bad ? 'Escribe un número de horas, por ejemplo 12.5.' : null}
        />
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => length.lookup(link, true)} disabled={!link || badUrl || length.busy}>
          {length.busy ? 'Buscando…' : 'Leer del enlace'}
        </button>
      </div>
      <TextField label="Nombre (opcional)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Curso completo de inglés básico" />
      <TextField
        label="Canal de YouTube o academia (opcional)"
        value={origin}
        onChange={(e) => setOrigin(e.target.value)}
        maxLength={120}
        placeholder="midudev, Platzi, EDteam…"
        hint={length.busy ? undefined : 'En YouTube se llena solo al leer el enlace.'}
        list={origins.length ? sourceListId : undefined}
      />
      {origins.length > 0 && (
        <datalist id={sourceListId}>
          {origins.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      )}
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
        disabled={!topic.trim() || (!!url.trim() && badUrl) || length.bad}
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

/**
 * Duración del curso en el formulario: se escribe a mano o se lee del enlace
 * (lo hace el servidor). Si la persona ya la escribió, el enlace no la pisa
 * salvo que pulse «Leer del enlace».
 */
function useCourseLength(course: LegacyCourse | null, onFound?: (r: CourseLength) => void) {
  const initial = course?.length ? String(Math.round((course.length / 3600) * 100) / 100) : '';
  const [hours, setHours] = useState(initial);
  const [from, setFrom] = useState<CourseLengthFrom | undefined>(course?.lengthFrom);
  const [message, setMessage] = useState<string | undefined>(course?.length ? undefined : 'Se busca sola al pegar el enlace, si la página la dice.');
  const [busy, setBusy] = useState(false);
  // Una consulta por enlace: si se guarda antes de que responda, se aprovecha la misma.
  const asked = useRef(new Map<string, Promise<CourseLength | null>>());
  const found = useRef(onFound);
  found.current = onFound;
  const ask = (url: string) => {
    let p = asked.current.get(url);
    if (!p) {
      const server = () =>
        api.courses.length(url).catch((e: unknown) => {
          setMessage(e instanceof Error && e.message ? e.message : 'No pude leerla. Escríbela a mano.');
          return null;
        });
      // YouTube se lee aquí mismo con su reproductor; si no se puede, lo intenta el servidor.
      p = youtubeRef(url)
        ? readYouTubeLength(url, (done, total) => total > 1 && setMessage(`Midiendo los videos de la lista: ${done} de ${total}…`)).catch(server)
        : server();
      asked.current.set(url, p);
    }
    return p;
  };
  const value = hours.trim() === '' ? 0 : Number(hours.replace(',', '.'));
  const bad = hours.trim() !== '' && !(Number.isFinite(value) && value >= 0 && value <= 2000);
  const lookup = async (url: string, force: boolean) => {
    if (busy || (!force && (hours.trim() || asked.current.has(url)))) return;
    if (force) asked.current.delete(url);
    setBusy(true);
    setMessage('Buscando cuánto dura…');
    const r = await ask(url);
    setBusy(false);
    if (!r) return;
    setHours(String(Math.round((r.seconds / 3600) * 100) / 100));
    setFrom(r.exact ? 'enlace' : 'aprox');
    setMessage(`${r.exact ? 'Dura' : 'Dura unas'} ${formatLength(r.seconds)}${r.videos ? ` (${r.videos} videos)` : ''}${r.author ? `, de ${r.author}` : ''}, según la página.`);
    found.current?.(r);
  };
  return {
    hours,
    busy,
    bad,
    message,
    lookup,
    type: (v: string) => {
      setHours(v);
      setFrom('manual');
      setMessage(undefined);
    },
    /** Lo que se guarda: nada si nunca tuvo duración y sigue vacía. */
    fields: (): Partial<LegacyCourse> => {
      if (bad) return {};
      if (!value) return course?.length ? { length: 0 } : {};
      return { length: Math.round(value * 3600), lengthFrom: from ?? 'manual' };
    },
    /** Guardado sin duración pero con enlace: se busca después y se completa sola. */
    later: (id: string, url: string, save: (id: string, patch: Partial<LegacyCourse>) => void, empty: { source: boolean }) => {
      if (value || bad || !url || (course?.length && course.url === url)) return;
      void ask(url).then((r) => r && save(id, { length: r.seconds, lengthFrom: r.exact ? 'enlace' : 'aprox', ...(empty.source && r.author ? { source: r.author.slice(0, 120) } : {}) }));
    },
  };
}

/** Valores distintos y no vacíos, sin repetir mayúsculas. */
const uniq = (list: string[]) => {
  const seen = new Map<string, string>();
  for (const v of list.map((x) => x.trim()).filter(Boolean)) if (!seen.has(v.toLocaleLowerCase('es'))) seen.set(v.toLocaleLowerCase('es'), v);
  return [...seen.values()];
};

/** Reparte los cursos en las horas libres de la semana y los pone en el Horario. */
function StudyPlanner({ courses, onDone }: { courses: LegacyCourse[]; onDone: () => void }) {
  const legacy = useLegacyData();
  const classes = useModule('classes');
  const toast = useToast();
  const navigate = useNavigate();
  // Por temas: cada tema estudia un curso a la vez, en el orden de su ruta.
  const topics = coursesByTopic(courses)
    .map((g) => ({ topic: g.topic, route: courseRoute(g.items).filter((c) => statusOf(c) !== 'hecho') }))
    .filter((g) => g.route.length);
  // Todos los temas de entrada: un curso de cada uno va al horario.
  const [chosen, setChosen] = useState<string[]>(() => topics.map((g) => g.topic));
  const [days, setDays] = useState('12345');
  const [from, setFrom] = useState('18:00');
  const [to, setTo] = useState('21:00');
  const [session, setSession] = useState(60);
  const [weekly, setWeekly] = useState(5);
  const badTime = !HHMM_RE.test(from) || !HHMM_RE.test(to) || to <= from;
  const plan = badTime ? null : planTopics(legacy.data?.data, chosen, { days, from, to, session, weekly });
  const name = (id: string) => courseName(courses.find((c) => c.id === id) ?? ({ title: '', url: '' } as LegacyCourse));
  const toggle = (topic: string) => setChosen((list) => (list.includes(topic) ? list.filter((x) => x !== topic) : [...list, topic]));
  const short = plan && plan.fits < weekly && plan.sessions.length > 0;
  const fmtDate = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString('es', { day: 'numeric', month: 'long', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!plan?.sessions.length) return;
    const inTopics = new Set(topics.filter((g) => chosen.includes(g.topic)).flatMap((g) => g.route.map((c) => c.id)));
    const old = legacy.data?.data.classes as Array<{ id: string; course?: string }> | undefined;
    for (const k of old ?? []) if (k.course && inTopics.has(k.course)) classes.remove(k.id);
    plan.sessions.forEach((s) => {
      const c = courses.find((x) => x.id === s.courseId)!;
      const color = CLASS_COLORS[Math.max(0, chosen.findIndex((t) => t.toLocaleLowerCase('es') === c.topic.trim().toLocaleLowerCase('es'))) % CLASS_COLORS.length];
      classes.add({ id: newId(), day: s.day, start: s.start, end: s.end, title: courseName(c).slice(0, 120), room: courseOrigin(c).slice(0, 60), color, subject: '', course: c.id });
    });
    toast(`Listo: ${plural(plan.sessions.length, 'sesión', 'sesiones')} de estudio en tu horario.`, { action: { label: 'Ver horario', run: () => navigate('/horario') } });
    onDone();
  };

  return (
    <form className="stack planner" onSubmit={submit}>
      <p className="muted small">
        Pone en tu horario un curso de cada tema, el que sigue en su orden. Elige cuándo tienes tiempo y listo. Cuando terminas un curso, sus clases pasan solas al siguiente del tema.
      </p>
      <fieldset className="field">
        <legend className="field__label">Temas</legend>
        <div className="planner__courses">
          {topics.map((g) => {
            const known = g.route.map(courseRemaining).filter((r): r is number => r !== null);
            const left = known.reduce((a, b) => a + b, 0);
            return (
              <label key={g.topic} className="check-row">
                <input type="checkbox" checked={chosen.includes(g.topic)} onChange={() => toggle(g.topic)} />
                <span>
                  {g.topic}
                  <span className="small muted">
                    {' '}
                    · {plural(g.route.length, 'curso', 'cursos')} · empieza por «{courseName(g.route[0])}»{known.length ? ` · faltan ${formatLength(left)}` : ''}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <WeekdayPicker legend="Días que puedes estudiar" value={days} onChange={setDays} />
      <div className="grid-2">
        <TextField label="Desde" type="time" value={from} onChange={(e) => setFrom(e.target.value)} required />
        <TextField label="Hasta" type="time" value={to} onChange={(e) => setTo(e.target.value)} required error={badTime && HHMM_RE.test(from) && HHMM_RE.test(to) ? 'Debe ser después de «Desde».' : null} />
        <SelectField label="Horas a la semana" value={weekly} onChange={(e) => setWeekly(Number(e.target.value))}>
          {STUDY_WEEKLY.map((h) => (
            <option key={h} value={h}>
              {h} horas
            </option>
          ))}
        </SelectField>
        <SelectField label="Cada sesión" value={session} onChange={(e) => setSession(Number(e.target.value))}>
          {STUDY_SESSIONS.map((m) => (
            <option key={m} value={m}>
              {m < 60 ? `${m} min` : formatLength(m * 60)}
            </option>
          ))}
        </SelectField>
      </div>
      <section className="planner__preview" aria-labelledby="planner-preview" aria-live="polite">
        <h3 id="planner-preview" className="planner__title">
          Así quedaría
        </h3>
        {!chosen.length ? (
          <p className="muted small">Elige al menos un tema.</p>
        ) : !plan?.sessions.length ? (
          <p className="muted small">No hay huecos libres con esos días y horas. Prueba otros días o amplía el horario.</p>
        ) : (
          <>
            {short && <p className="small">En esos días y horas caben {String(plan.fits).replace('.', ',')} h a la semana, así que usamos esas.</p>}
            <ul className="planner__sessions">
              {plan.sessions.map((s) => (
                <li key={`${s.day}-${s.start}`}>
                  <span className="numeric">
                    {DAY_SHORT[s.day - 1]} {s.start}–{s.end}
                  </span>{' '}
                  {name(s.courseId)}
                </li>
              ))}
            </ul>
            <ul className="planner__finish">
              {plan.topics.map((t) => (
                <li key={t.topic} className="small">
                  <strong>{t.topic}:</strong> {plural(t.perWeek, 'sesión', 'sesiones')} a la semana
                  {!t.perWeek
                    ? ' · no cupo esta semana'
                    : t.finish
                      ? ` · ${t.count > 1 ? `los ${t.count} cursos` : 'lo terminas'} hacia el ${fmtDate(t.finish)} (${plural(t.weeks ?? 0, 'semana', 'semanas')})`
                      : ' · agrega la duración de sus cursos para saber cuándo terminas'}
                  {t.unknown > 0 && t.finish ? ` · ${plural(t.unknown, 'curso sin duración no cuenta', 'cursos sin duración no cuentan')}` : ''}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <p className="muted small">Las clases que ya tenían estos temas en tu horario se cambian por estas.</p>
      <button type="submit" className="btn" disabled={!plan?.sessions.length}>
        Poner en mi horario
      </button>
    </form>
  );
}
