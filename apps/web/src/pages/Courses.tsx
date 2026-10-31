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
  coursesByTopic,
  courseSource,
  HHMM_RE,
  normalizeCourseUrl,
  validCourseUrl,
  youtubeRef,
  type CourseStatus,
  type LegacyCourse,
} from "@dyc/core";
import {
  CalendarPlus,
  ExternalLink,
  Gauge,
  GraduationCap,
  Link2,
  MonitorPlay,
  Pencil,
  Play,
  Plus,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { newId, useLegacyData, useLegacyList, useModule } from "../app/legacy";
import { PageHeader } from "../components/AppShell";
import { Dialog } from "../components/Dialog";
import { SelectField, TextArea, TextField } from "../components/Form";
import { EmptyState, ErrorState, Loading } from "../components/States";
import { FormActions, WeekdayPicker } from "../components/ToolParts";
import { YouTubePlayer } from "../components/YouTubePlayer";
import { plural } from "../lib/format";

type Filter = "todos" | CourseStatus;
const NEXT_STATUS: Record<CourseStatus, CourseStatus> = {
  pendiente: "curso",
  curso: "hecho",
  hecho: "pendiente",
};
const statusOf = (c: LegacyCourse): CourseStatus =>
  COURSE_STATUSES.includes(c.status) ? c.status : "pendiente";

export function Courses() {
  const legacy = useLegacyData();
  const courses = useLegacyList(legacy.data?.data, "courses");
  const actions = useModule("courses");
  const [filter, setFilter] = useState<Filter>("todos");
  // `topic` sin curso: añadir uno nuevo a ese tema.
  const [editing, setEditing] = useState<
    LegacyCourse | { topic: string } | null
  >(null);
  const shown = courses.filter(
    (c) => filter === "todos" || statusOf(c) === filter,
  );
  const groups = coursesByTopic(shown);
  const topics = coursesByTopic(courses).map((g) => g.topic);
  const pending = courses.filter((c) => statusOf(c) !== "hecho").length;
  const [watching, setWatching] = useState<string | null>(null);
  const [logging, setLogging] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  // Volver de otra pestaña después de abrir un curso de Udemy, Coursera…: pregunta hasta dónde llegaste.
  const away = useRef<string | null>(null);
  useEffect(() => {
    const back = () => {
      if (document.visibilityState === "visible" && away.current) {
        setLogging(away.current);
        away.current = null;
      }
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => {
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
    };
  }, []);
  // «/cursos?abrir=<id>» (desde el Horario o un aviso): abre el curso.
  const toOpen = params.get("abrir");
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
        ...(statusOf(c) === "pendiente" ? { status: "curso" } : {}),
      });
    }
  };
  const byId = (id: string | null) =>
    id ? courses.find((c) => c.id === id) : undefined;
  const watched = byId(watching);
  const logged = byId(logging);
  const scheduled = byId(scheduling);

  return (
    <div className="page">
      <PageHeader eyebrow="Estudio y trabajo" title="Cursos">
        <button
          type="button"
          className="btn"
          onClick={() => setEditing({ topic: "" })}
          disabled={!legacy.data}
        >
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
            <button
              type="button"
              className="btn"
              onClick={() => setEditing({ topic: "" })}
            >
              <Plus size={18} aria-hidden="true" /> Añadir el primero
            </button>
          }
        >
          Escribe un tema y pega el enlace del curso o del video: YouTube,
          Udemy, Coursera, Platzi o cualquier página. Lo abres desde aquí cuando
          quieras estudiar.
        </EmptyState>
      ) : (
        <div className="stack-lg">
          <div className="row course-bar">
            <div className="chips" role="group" aria-label="Estado">
              {(["todos", ...COURSE_STATUSES] as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  className="chip-btn"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {f === "todos" ? "Todos" : COURSE_STATUS_INFO[f].label}
                </button>
              ))}
            </div>
            <span className="chip numeric">
              {plural(pending, "por ver", "por ver")}
            </span>
          </div>
          {groups.length === 0 ? (
            <EmptyState
              title={`Nada en «${COURSE_STATUS_INFO[filter as CourseStatus].label}»`}
            >
              Cambia el estado de un curso con el botón que tiene al lado.
            </EmptyState>
          ) : (
            <div className="card-grid tool-grid">
              {groups.map((g) => (
                <TopicCard
                  key={g.topic}
                  topic={g.topic}
                  items={g.items}
                  classes={(c) => courseClasses(legacy.data?.data, c.id)}
                  onEdit={setEditing}
                  onAdd={() => setEditing({ topic: g.topic })}
                  onStatus={(c) =>
                    actions.update(c.id, { status: NEXT_STATUS[statusOf(c)] })
                  }
                  onOpen={open}
                  onLog={(c) => setLogging(c.id)}
                  onSchedule={(c) => setScheduling(c.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing && "id" in editing ? "Editar curso" : "Nuevo curso"}
      >
        {editing && (
          <CourseForm
            course={"id" in editing ? editing : null}
            topic={editing.topic}
            topics={topics}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
      <Dialog
        open={!!watched}
        onClose={() => setWatching(null)}
        title={watched ? courseName(watched) : "Curso"}
        wide
      >
        {watched && <Watch course={watched} />}
      </Dialog>
      <Dialog
        open={!!logged}
        onClose={() => setLogging(null)}
        title="¿Hasta dónde llegaste?"
      >
        {logged && (
          <ProgressForm course={logged} onDone={() => setLogging(null)} />
        )}
      </Dialog>
      <Dialog
        open={!!scheduled}
        onClose={() => setScheduling(null)}
        title="Agregar al horario"
      >
        {scheduled && (
          <ScheduleForm
            course={scheduled}
            count={
              (legacy.data?.data.classes as unknown[] | undefined)?.length ?? 0
            }
            onDone={() => setScheduling(null)}
          />
        )}
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

function TopicCard({
  topic,
  items,
  onAdd,
  ...row
}: { topic: string; items: LegacyCourse[]; onAdd: () => void } & RowActions) {
  const id = useId();
  const done = items.filter((c) => statusOf(c) === "hecho").length;
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
          <CourseRow key={c.id} course={c} {...row} />
        ))}
      </ul>
      <button type="button" className="btn btn--ghost btn--sm" onClick={onAdd}>
        <Plus size={16} aria-hidden="true" /> Añadir a {topic}
      </button>
    </section>
  );
}

const DAY_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
/** «Lun y Mié 18:00» */
export function scheduleText(
  list: Array<{ day: number; start: string }>,
): string {
  if (!list.length) return "";
  const sorted = [...list].sort(
    (a, b) => a.day - b.day || a.start.localeCompare(b.start),
  );
  const days = [...new Set(sorted.map((k) => DAY_SHORT[k.day - 1]))];
  const times = [...new Set(sorted.map((k) => k.start))];
  const d =
    days.length > 1
      ? `${days.slice(0, -1).join(", ")} y ${days.at(-1)}`
      : days[0];
  return times.length === 1 ? `${d} ${times[0]}` : d;
}

function CourseRow({
  course: c,
  onEdit,
  onStatus,
  onOpen,
  onLog,
  onSchedule,
  classes,
}: { course: LegacyCourse } & RowActions) {
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
          <button
            type="button"
            className="course-row__name course-row__play"
            onClick={() => onOpen(c)}
            aria-label={`${pct > 0 && status !== "hecho" ? "Continuar" : "Ver"} «${name}» aquí`}
          >
            {name}
            <Play size={14} aria-hidden="true" />
          </button>
        ) : c.url ? (
          <a
            className="course-row__name"
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onOpen(c)}
          >
            {name}
            <ExternalLink size={14} aria-hidden="true" />
            <span className="visually-hidden"> (se abre en otra pestaña)</span>
          </a>
        ) : (
          <span className="course-row__name">{name}</span>
        )}
        {(source || c.notes) && (
          <span className="small muted course-row__meta">
            {[source?.label, c.notes.split("\n")[0]]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
        {(pct > 0 || resume) && status !== "hecho" && (
          <span className="course-progress">
            <span
              className="course-progress__bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label={`Avance de «${name}»`}
            >
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
          <button
            type="button"
            className="icon-btn"
            onClick={() => onLog(c)}
            aria-label={`Anotar avance de «${name}»`}
          >
            <Gauge size={18} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          onClick={() => onSchedule(c)}
          aria-label={`Agregar «${name}» al horario`}
        >
          <CalendarPlus size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => onEdit(c)}
          aria-label={`Editar «${name}»`}
        >
          <Pencil size={18} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

/** El video de YouTube dentro de la app: empieza donde lo dejaste y guarda al pausar. */
function Watch({ course: c }: { course: LegacyCourse }) {
  const actions = useModule("courses");
  const ref = youtubeRef(c.url)!;
  // Si se guardó un video de la lista, se sigue en ese; si no, en el del enlace.
  const video = c.video || ref.video;
  const start =
    c.position && (!c.video || c.video === video) && courseProgress(c) < 100
      ? Math.max(0, c.position - 3)
      : ref.start;
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
          actions.update(c.id, patch);
          setSaved(
            courseResume({ ...latest.current, ...patch } as LegacyCourse),
          );
        }}
      />
      <p className="small muted" role="status">
        {saved
          ? `Guardado: ${saved}.`
          : c.position
            ? `Sigue desde ${courseResume(c)}. Se guarda cada vez que pausas.`
            : "Se guarda dónde lo pausas, para seguir después desde aquí o desde el teléfono."}
      </p>
      <a
        className="btn btn--ghost btn--sm"
        href={c.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ alignSelf: "flex-start" }}
      >
        <ExternalLink size={16} aria-hidden="true" /> Abrir en YouTube
      </a>
    </div>
  );
}

/** Udemy, Coursera…: no dicen cuánto viste, así que lo anotas tú al volver. */
function ProgressForm({
  course: c,
  onDone,
}: {
  course: LegacyCourse;
  onDone: () => void;
}) {
  const actions = useModule("courses");
  const [spot, setSpot] = useState(c.spot ?? "");
  const [pct, setPct] = useState(courseProgress(c));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    actions.update(c.id, {
      spot: spot.trim(),
      progress: pct,
      lastAt: new Date().toISOString(),
      status: pct >= 100 ? "hecho" : "curso",
    });
    onDone();
  };
  return (
    <form className="stack" onSubmit={submit}>
      <p className="muted small">
        «{courseName(c)}» se abre en{" "}
        {courseSource(c.url)?.label ?? "otra página"}, que no le cuenta a Design
        Your Core cuánto viste. Anótalo aquí y lo verás la próxima vez.
      </p>
      <TextField
        label="Dónde lo dejaste (opcional)"
        value={spot}
        onChange={(e) => setSpot(e.target.value)}
        maxLength={200}
        placeholder="Lección 12, módulo 3…"
        autoFocus
      />
      <div className="field">
        <label className="field__label" htmlFor="course-pct">
          Avance: <span className="numeric">{pct} %</span>
        </label>
        <input
          id="course-pct"
          type="range"
          min={0}
          max={100}
          step={5}
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
        />
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
function ScheduleForm({
  course: c,
  count,
  onDone,
}: {
  course: LegacyCourse;
  count: number;
  onDone: () => void;
}) {
  const actions = useModule("classes");
  const [days, setDays] = useState("");
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("19:00");
  const badTime = !HHMM_RE.test(start) || !HHMM_RE.test(end) || end <= start;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const color = CLASS_COLORS[count % CLASS_COLORS.length];
    for (const d of days.split("").map(Number)) {
      actions.add({
        id: newId(),
        day: d,
        start,
        end,
        title: courseName(c).slice(0, 120),
        room: (courseSource(c.url)?.label ?? "").slice(0, 60),
        color,
        subject: "",
        course: c.id,
      });
    }
    onDone();
  };
  return (
    <form className="stack" onSubmit={submit}>
      <p className="muted small">
        Se añade a tu Horario los días que elijas. Desde ahí lo abres con un
        toque y, en el teléfono, te avisamos antes de empezar.
      </p>
      <WeekdayPicker
        legend="Días"
        value={days}
        onChange={setDays}
        hint={
          days
            ? `${days
                .split("")
                .map((d) => CLASS_DAY_NAMES[Number(d) - 1])
                .join(", ")}`
            : "Elige uno o más días."
        }
      />
      <div className="grid-2">
        <TextField
          label="Empieza"
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          required
        />
        <TextField
          label="Termina"
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          required
          error={
            HHMM_RE.test(start) && HHMM_RE.test(end) && end <= start
              ? "Debe ser después de la hora de inicio."
              : null
          }
        />
      </div>
      <FormActions
        submitLabel="Agregar al horario"
        disabled={!days || badTime}
      />
    </form>
  );
}

function CourseForm({
  course,
  topic: initialTopic,
  topics,
  onDone,
}: {
  course: LegacyCourse | null;
  topic: string;
  topics: string[];
  onDone: () => void;
}) {
  const actions = useModule("courses");
  const listId = useId();
  const [topic, setTopic] = useState(course?.topic ?? initialTopic);
  const [url, setUrl] = useState(course?.url ?? "");
  const [title, setTitle] = useState(course?.title ?? "");
  const [status, setStatus] = useState<CourseStatus>(
    course ? statusOf(course) : "pendiente",
  );
  const [notes, setNotes] = useState(course?.notes ?? "");
  const link = normalizeCourseUrl(url);
  const badUrl = !validCourseUrl(link);
  const source = !badUrl ? courseSource(link) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fields = {
      topic: topic.trim(),
      url: link,
      title: title.trim(),
      status,
      notes,
    };
    if (course) actions.update(course.id, fields);
    else actions.add({ id: newId(), ...fields });
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
        label="Enlace (opcional)"
        type="url"
        inputMode="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={() => setUrl(link)}
        maxLength={2000}
        autoFocus={!!initialTopic && !course}
        placeholder="https://youtube.com/…"
        error={
          url.trim() && badUrl
            ? "Pega un enlace completo, por ejemplo https://youtube.com/watch?v=…"
            : null
        }
        hint={
          source
            ? `Se abrirá en ${source.label}.`
            : "De YouTube, Udemy, Coursera, Platzi o cualquier página."
        }
      />
      <TextField
        label="Nombre (opcional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        placeholder="Curso completo de inglés básico"
      />
      <SelectField
        label="Estado"
        value={status}
        onChange={(e) => setStatus(e.target.value as CourseStatus)}
      >
        {COURSE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {COURSE_STATUS_INFO[s].label}
          </option>
        ))}
      </SelectField>
      <TextArea
        label="Notas (opcional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={5000}
        rows={3}
        placeholder="Voy en la lección 4…"
      />
      <FormActions
        submitLabel={course ? "Guardar" : "Añadir curso"}
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
