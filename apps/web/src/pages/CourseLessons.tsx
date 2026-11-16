import { ACTIVITY_KINDS, ACTIVITY_KIND_LABEL, activityCount, guessActivityKind, materialsFromText, nextSubtopicNumber, pastedLines, subtopicLessons, type ActivityKind, type LessonActivity, unitWord, addUnitPatch, courseUnits, nextUnitNumber, numberedUnit, formatLength, lessonsByUnit, removeUnitPatch, renameUnitPatch, lessonsFromPlaylist, lessonsPatch, nextLesson, normalizeCourseUrl, validCourseUrl, youtubeRef, type CourseLesson, type LegacyCourse } from '@dyc/core';
import { useIsMutating } from '@tanstack/react-query';
import { BookOpen, Check, Circle, CircleHelp, CirclePlay, ClipboardPaste, ExternalLink, FileCheck, FolderKanban, FolderPlus, Globe, Hammer, ListChecks, ListVideo, PenLine, Pencil, Play, Plus, Trash2, X, type LucideIcon } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { newId, useLegacyData, useLegacyList, type ChangeOpts } from '../app/legacy';
import { TextArea, TextField } from '../components/Form';
import { YouTubePlayer } from '../components/YouTubePlayer';
import { readYouTubeLength } from '../lib/youtubeLength';

/**
 * Unidades y lecciones de un curso: se marcan como vistas, se añaden a mano o
 * se traen de la lista de YouTube del curso. El avance del curso sale de aquí.
 */
export function CourseLessons({ course, update }: { course: LegacyCourse; update: (c: LegacyCourse, patch: Partial<LegacyCourse>, opts?: ChangeOpts) => void }) {
  // Siempre la copia más reciente del curso (la ventana puede conservar la que se abrió).
  const legacy = useLegacyData();
  const c = useLegacyList(legacy.data?.data, 'courses').find((x) => x.id === course.id) ?? course;
  // Lo último guardado desde aquí: dos cambios seguidos no se pisan aunque el curso aún no se haya recargado.
  const mine = useRef<CourseLesson[] | null>(null);
  const mineUnits = useRef<string[] | null>(null);
  // Sin cambios en camino manda lo guardado (otro dispositivo, «Deshacer»…).
  const saving = useIsMutating({ mutationKey: ['legacy'] }) > 0;
  if (!saving) {
    mine.current = null;
    mineUnits.current = null;
  }
  const lessons = mine.current ?? c.lessons ?? [];
  const created = mineUnits.current ?? c.units ?? [];
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [newUnit, setNewUnit] = useState('');
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const unitList = useId();
  const newUnitId = useId();
  const [title, setTitle] = useState('');
  const [unit, setUnit] = useState(() => lessons.at(-1)?.unit ?? '');
  const [url, setUrl] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const [editingLesson, setEditingLesson] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // El curso cambia con cada guardado: se usa siempre el último.
  const latest = useRef(c);
  latest.current = c;
  const current = () => mine.current ?? latest.current.lessons ?? [];
  const now = (): LegacyCourse => ({ ...latest.current, lessons: current(), units: mineUnits.current ?? latest.current.units ?? [] });
  const apply = (patch: Partial<LegacyCourse>, opts?: ChangeOpts) => {
    if (patch.lessons) mine.current = patch.lessons;
    if (patch.units) mineUnits.current = patch.units;
    update(latest.current, patch, opts);
  };
  const save = (next: CourseLesson[], opts?: ChangeOpts) => apply(lessonsPatch(now(), next), opts);
  const addUnit = (e: FormEvent) => {
    e.preventDefault();
    const name = numberedUnit(nextUnitNumber(courseUnits(now())), newUnit, now().language);
    const patch = addUnitPatch(now(), name);
    if (!patch) return setStatus(`Ya tienes una unidad llamada «${name}».`);
    apply(patch);
    setUnit(name);
    setStatus(`Añadida «${name}». Ahora añádele lecciones.`);
    setNewUnit('');
  };
  const rename = (e: FormEvent) => {
    e.preventDefault();
    if (!renaming) return;
    const patch = renameUnitPatch(now(), renaming.from, renaming.to);
    if (!patch) return setStatus(`Ya tienes una unidad llamada «${renaming.to.trim()}».`);
    apply(patch);
    if (unit.trim() === renaming.from) setUnit(renaming.to.trim());
    setRenaming(null);
  };
  const toggle = (id: string, done?: boolean, opts?: ChangeOpts) => {
    const cur = current();
    save(
      cur.map((l) => (l.id === id ? { ...l, done: done ?? !l.done } : l)),
      opts,
    );
  };
  const link = normalizeCourseUrl(url);
  const badUrl = !!url.trim() && !validCourseUrl(link);
  const units = courseUnits({ lessons, units: created });
  const nextNumber = nextUnitNumber(units);
  const done = lessons.filter((l) => l.done).length;
  const list = youtubeRef(c.url)?.list;
  const next = nextLesson(c);
  const played = lessons.find((l) => l.id === playing);
  const playedRef = played?.url ? youtubeRef(played.url) : null;

  // Uno por línea: en una unidad numerada se numeran solos («1.3: …»).
  const lines = pastedLines(title);
  const many = lines.length > 1;
  const nextSub = nextSubtopicNumber(unit, lessons);
  const preview = subtopicLessons(title, unit, lessons, () => '');
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!lines.length || (!many && badUrl)) return;
    const fresh = subtopicLessons(title, unit, current(), newId);
    if (!fresh.length) return setStatus('Ya llegaste al máximo de 500 lecciones en este curso.');
    if (fresh.length === 1 && link && !fresh[0].url) fresh[0] = { ...fresh[0], url: link };
    save([...current(), ...fresh]);
    setTitle('');
    setUrl('');
    setStatus(fresh.length === 1 ? `Añadido «${fresh[0].title}». Ábrelo con el lápiz para anotar sus materiales.` : `Añadidos ${fresh.length} subtemas, de «${fresh[0].title}» a «${fresh.at(-1)!.title}».`);
  };

  const importList = async () => {
    if (!list || busy) return;
    setBusy(true);
    setStatus('Leyendo los videos de la lista…');
    try {
      const r = await readYouTubeLength(c.url, (n, total) => setStatus(`Leyendo los videos de la lista: ${n} de ${total}…`));
      const found = lessonsFromPlaylist(r.items ?? [], list, newId);
      const have = new Set(lessons.map((l) => l.url));
      const fresh = found.filter((l) => !have.has(l.url));
      if (!fresh.length) setStatus('Ya tenías todos los videos de la lista.');
      else {
        save([...lessons, ...fresh]);
        setStatus(`Listo: ${fresh.length} ${fresh.length === 1 ? 'lección nueva' : 'lecciones nuevas'} de la lista.`);
      }
    } catch {
      setStatus('No pude leer la lista de YouTube. Añade las lecciones a mano.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack lessons">
      {playedRef && played && (
        <div className="stack">
          <YouTubePlayer
            key={played.id}
            video={playedRef.video}
            list=""
            start={playedRef.start}
            title={played.title}
            onProgress={(s) => {
              // Al terminar el video, la lección queda vista sola.
              const l = current().find((x) => x.id === played.id);
              if (l && !l.done && s.duration && s.position / s.duration >= 0.97) toggle(played.id, true, { undo: false });
            }}
          />
          <p className="small muted">Al terminar el video, la lección se marca como vista.</p>
        </div>
      )}
      <p className="small muted" role="status">
        {status ??
          (lessons.length
            ? `${done} de ${lessons.length} vistas${next ? `. Sigue «${next.title}».` : '. Terminaste todas.'}`
            : 'Divide el curso en unidades y lecciones (o videos) y márcalas al verlas. El avance del curso se calcula solo.')}
      </p>
      {list && (
        <button type="button" className="btn btn--secondary btn--sm" onClick={importList} disabled={busy} style={{ alignSelf: 'flex-start' }}>
          <ListVideo size={16} aria-hidden="true" /> {busy ? 'Leyendo…' : lessons.length ? 'Traer los videos nuevos de la lista' : 'Traer los videos de la lista de YouTube'}
        </button>
      )}
      <form className="lessons__new-unit" onSubmit={addUnit}>
        <div className="field">
          <label className="field__label" htmlFor={newUnitId}>
            Nueva unidad
          </label>
          <div className="prefixed-input">
            <span className="prefixed-input__prefix" aria-hidden="true">
              {unitWord(c.language)} {nextNumber}:
            </span>
            <input
              id={newUnitId}
              className="input"
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              maxLength={110}
              placeholder="Nombre de la unidad (opcional)"
              aria-describedby={`${newUnitId}-hint`}
            />
            <button type="submit" className="btn btn--secondary btn--sm prefixed-input__action" disabled={units.length >= 100}>
              <FolderPlus size={16} aria-hidden="true" /> Añadir unidad {nextNumber}
            </button>
          </div>
          <p className="field__hint" id={`${newUnitId}-hint`}>
            Se guarda como «{numberedUnit(nextNumber, newUnit, c.language)}».
          </p>
        </div>
      </form>
      {lessonsByUnit(lessons, created).map((g) => (
        <section key={g.unit || '-'} className="lessons__unit" aria-label={g.unit || 'Lecciones'}>
          {g.unit &&
            (renaming?.from === g.unit ? (
              <form className="lessons__unit-head" onSubmit={rename}>
                <TextField label={`Nuevo nombre de «${g.unit}»`} value={renaming.to} onChange={(e) => setRenaming({ ...renaming, to: e.target.value })} maxLength={120} autoFocus />
                <button type="submit" className="icon-btn" aria-label="Guardar el nombre" disabled={!renaming.to.trim()}>
                  <Check size={18} aria-hidden="true" />
                </button>
                <button type="button" className="icon-btn" aria-label="Cancelar" onClick={() => setRenaming(null)}>
                  <X size={18} aria-hidden="true" />
                </button>
              </form>
            ) : (
              <div className="lessons__unit-head">
                <h3 className="course-sub__title">
                  {g.unit} <span className="numeric">· {g.items.filter((l) => l.done).length}/{g.items.length}</span>
                </h3>
                <span className="lessons__unit-actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    setUnit(g.unit);
                    titleRef.current?.focus();
                  }}
                  aria-label={`Añadir subtemas a «${g.unit}»`}
                >
                  <Plus size={16} aria-hidden="true" /> Subtemas
                </button>
                <button type="button" className="icon-btn" onClick={() => setRenaming({ from: g.unit, to: g.unit })} aria-label={`Cambiar el nombre de «${g.unit}»`}>
                  <Pencil size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => {
                    apply(removeUnitPatch(now(), g.unit));
                    if (unit.trim() === g.unit) setUnit('');
                    setStatus(g.items.length ? `Quitaste «${g.unit}» y sus ${g.items.length} ${g.items.length === 1 ? 'lección' : 'lecciones'}.` : `Quitaste «${g.unit}».`);
                  }}
                  aria-label={`Quitar la unidad «${g.unit}»${g.items.length ? ` y sus lecciones` : ''}`}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
                </span>
              </div>
            ))}
          {g.items.length === 0 && <p className="small muted">Sin lecciones todavía.</p>}
          <ul className="lessons__list">
            {g.items.map((l) => {
              const yt = l.url ? youtubeRef(l.url) : null;
              return (
                <li key={l.id} className={`check-row lessons__row${l.done ? ' is-done' : ''}`}>
                  <label className="check-row__label">
                    <input type="checkbox" checked={!!l.done} onChange={() => toggle(l.id)} />
                    <span>
                      {l.title}
                      {l.seconds ? <span className="small muted"> · {formatLength(l.seconds)}</span> : null}
                      {l.activities?.length ? (
                        <span className="small muted lessons__acts">
                          {' · '}
                          {activityCount(l).done}/{activityCount(l).total} {activityCount(l).total === 1 ? 'material' : 'materiales'}
                        </span>
                      ) : null}
                    </span>
                  </label>
                  <button type="button" className="icon-btn" onClick={() => setEditingLesson(editingLesson === l.id ? null : l.id)} aria-label={`Editar «${l.title}» y sus materiales`} aria-expanded={editingLesson === l.id}>
                    <Pencil size={18} aria-hidden="true" />
                  </button>
                  {yt ? (
                    <button type="button" className="icon-btn" onClick={() => setPlaying(l.id)} aria-label={`Ver «${l.title}» aquí`} aria-pressed={playing === l.id}>
                      <Play size={18} aria-hidden="true" />
                    </button>
                  ) : l.url ? (
                    <a className="icon-btn" href={l.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir «${l.title}» (se abre en otra pestaña)`}>
                      <ExternalLink size={18} aria-hidden="true" />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => {
                      if (playing === l.id) setPlaying(null);
                      save(current().filter((x) => x.id !== l.id));
                    }}
                    aria-label={`Quitar «${l.title}»`}
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                  {editingLesson === l.id && (
                    <LessonEditor
                      lesson={l}
                      units={units}
                      onSave={(patch) => save(current().map((x) => (x.id === l.id ? { ...x, ...patch } : x)))}
                      onClose={() => setEditingLesson(null)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <form className="stack lessons__add" onSubmit={add}>
        <h3 className="planner__title">Añadir subtemas o lecciones</h3>
        <TextField label="En la unidad (opcional)" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={120} placeholder={`${unitWord(c.language)} 1, ${c.language === 'en' ? 'Module' : 'Módulo'} 2…`} list={units.length ? unitList : undefined} />
        {units.length > 0 && (
          <datalist id={unitList}>
            {units.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        )}
        <TextArea
          ref={titleRef}
          label="Subtemas, uno por línea"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          rows={many ? Math.min(10, lines.length + 1) : 3}
          maxLength={20000}
          placeholder={nextSub ? `Generic Programming\nTemplates\nIterators` : 'Introducción\nClase 2\nClase 3'}
          hint={
            preview.length
              ? `Se ${preview.length === 1 ? 'guarda' : 'guardan'} como ${preview
                  .slice(0, 3)
                  .map((l) => `«${l.title}»`)
                  .join(', ')}${preview.length > 3 ? ` y ${preview.length - 3} más` : ''}.`
              : nextSub
                ? `Pega la lista de subtemas de la unidad. Los que no traen número se numeran solos desde ${nextSub}. Si una línea lleva su enlace, se guarda con él.`
                : 'Pega varios a la vez, uno por línea. Si una línea lleva su enlace, se guarda con él. Elige una unidad numerada para que se numeren solos (1.1, 1.2…).'
          }
        />
        {!many && (
          <TextField
            label="Enlace (opcional)"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => setUrl(link)}
            maxLength={2000}
            placeholder="https://learn.saylor.org/…"
            error={badUrl ? 'Pega un enlace completo, por ejemplo https://learn.saylor.org/…' : null}
          />
        )}
        <button type="submit" className="btn btn--sm" disabled={!lines.length || (!many && badUrl) || lessons.length >= 500} style={{ alignSelf: 'flex-start' }}>
          <Plus size={16} aria-hidden="true" /> {many ? `Añadir ${Math.min(lines.length, 500 - lessons.length)} subtemas` : 'Añadir subtema'}
        </button>
      </form>
    </div>
  );
}

export const ACTIVITY_ICON: Record<ActivityKind, LucideIcon> = {
  video: CirclePlay,
  lectura: BookOpen,
  pagina: Globe,
  ejercicio: ListChecks,
  cuestionario: CircleHelp,
  examen: FileCheck,
  tarea: PenLine,
  practica: Hammer,
  proyecto: FolderKanban,
  otro: Circle,
};

/**
 * Editar una lección: su nombre, unidad y enlace, y lo que hay que hacer
 * dentro (videos, lecturas, cuestionarios, exámenes…). Al marcar todas las
 * actividades, la lección queda vista.
 */
function LessonEditor({ lesson, units, onSave, onClose }: { lesson: CourseLesson; units: string[]; onSave: (patch: Partial<CourseLesson>) => void; onClose: () => void }) {
  const [name, setName] = useState(lesson.title);
  const [unit, setUnit] = useState(lesson.unit ?? '');
  const [url, setUrl] = useState(lesson.url ?? '');
  const [kind, setKind] = useState<ActivityKind>('video');
  const [what, setWhat] = useState('');
  const [whatUrl, setWhatUrl] = useState('');
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const unitList = useId();
  const actLink = normalizeCourseUrl(whatUrl);
  const badActUrl = !!whatUrl.trim() && !validCourseUrl(actLink);
  const pastedActs = materialsFromText(pasted, () => '', 60 - (lesson.activities?.length ?? 0));
  const link = normalizeCourseUrl(url);
  const badUrl = !!url.trim() && !validCourseUrl(link);
  const acts = lesson.activities ?? [];
  const changed = name.trim() !== lesson.title || unit.trim() !== (lesson.unit ?? '') || link !== (lesson.url ?? '');
  const saveActs = (next: LessonActivity[]) => {
    const all = next.length > 0 && next.every((a) => a.done);
    onSave({ activities: next, ...(next.length ? { done: all } : {}) });
  };
  const addActivity = () => {
    if ((!what.trim() && !actLink) || badActUrl || acts.length >= 60) return;
    const title = what.trim() || pastedLines(actLink)[0]?.title || actLink;
    saveActs([...acts, { id: newId(), kind, title, ...(actLink ? { url: actLink } : {}) }]);
    setWhat('');
    setWhatUrl('');
  };
  const addPasted = () => {
    const fresh = materialsFromText(pasted, newId, 60 - acts.length);
    if (!fresh.length) return;
    saveActs([...acts, ...fresh]);
    setPasted('');
    setPasting(false);
  };
  return (
    <div className="lesson-editor stack-sm" role="region" aria-label={`Editar «${lesson.title}»`}>
      <div className="grid-2">
        <TextField label="Nombre del subtema o lección" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus />
        <TextField label="Unidad" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={120} list={units.length ? unitList : undefined} placeholder="Sin unidad" />
      </div>
      {units.length > 0 && (
        <datalist id={unitList}>
          {units.map((u) => (
            <option key={u} value={u} />
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
        error={badUrl ? 'Pega un enlace completo, por ejemplo https://youtube.com/watch?v=…' : null}
      />
      <div className="row wrap">
        <button
          type="button"
          className="btn btn--sm"
          disabled={!changed || !name.trim() || badUrl}
          onClick={() => {
            onSave({ title: name.trim(), unit: unit.trim() || undefined, url: link || undefined });
          }}
        >
          <Check size={16} aria-hidden="true" /> Guardar cambios
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
          Cerrar
        </button>
      </div>

      <h4 className="lesson-editor__title">Materiales y actividades{acts.length ? ` · ${activityCount(lesson).done}/${acts.length}` : ''}</h4>
      {acts.length === 0 ? (
        <p className="small muted">Anota todo lo que trae el subtema: lecturas, videos, páginas web, ejercicios, cuestionarios… Al marcarlos todos, el subtema queda visto.</p>
      ) : (
        <ul className="lesson-acts" aria-label={`Materiales de «${lesson.title}»`}>
          {acts.map((a) => {
            const Icon = ACTIVITY_ICON[a.kind] ?? Circle;
            return (
              <li key={a.id} className={`lesson-act${a.done ? ' is-done' : ''}`}>
                <label className="lesson-act__label">
                  <input type="checkbox" checked={!!a.done} onChange={() => saveActs(acts.map((x) => (x.id === a.id ? { ...x, done: !x.done } : x)))} />
                  <span className={`act-kind act-kind--${a.kind}`}>
                    <Icon size={14} aria-hidden="true" /> {ACTIVITY_KIND_LABEL[a.kind]}
                  </span>
                  <span className="lesson-act__name">{a.title}</span>
                </label>
                {a.url && (
                  <a className="icon-btn" href={a.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir «${a.title}» (se abre en otra pestaña)`}>
                    <ExternalLink size={16} aria-hidden="true" />
                  </a>
                )}
                <button type="button" className="icon-btn" onClick={() => saveActs(acts.filter((x) => x.id !== a.id))} aria-label={`Quitar la actividad «${a.title}»`}>
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {pasting ? (
        <div className="lesson-editor__paste stack-sm">
          <TextArea
            label="Materiales, uno por línea"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={6}
            maxLength={30000}
            autoFocus
            placeholder={'Read this: Generic Programming https://…\nWatch this lecture https://youtube.com/…\nComplete these exercises'}
            hint={
              pastedActs.length
                ? `Se ${pastedActs.length === 1 ? 'añade' : 'añaden'}: ${pastedActs
                    .slice(0, 4)
                    .map((a) => `${ACTIVITY_KIND_LABEL[a.kind]} «${a.title.length > 40 ? `${a.title.slice(0, 40)}…` : a.title}»`)
                    .join(', ')}${pastedActs.length > 4 ? ` y ${pastedActs.length - 4} más` : ''}.`
                : 'Copia la lista de materiales del subtema. El tipo (lectura, video, página web, ejercicio…) se reconoce por sus palabras o su enlace.'
            }
          />
          <div className="row wrap">
            <button type="button" className="btn btn--secondary btn--sm" onClick={addPasted} disabled={!pastedActs.length}>
              <Plus size={16} aria-hidden="true" /> {pastedActs.length > 1 ? `Añadir ${pastedActs.length} materiales` : 'Añadir material'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPasting(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPasting(true)} disabled={acts.length >= 60} style={{ alignSelf: 'flex-start' }}>
          <ClipboardPaste size={16} aria-hidden="true" /> Pegar varios materiales
        </button>
      )}
      <div className="lesson-editor__add stack-sm">
        <div className="opt-picker__chips" role="group" aria-label="Tipo de material">
          {ACTIVITY_KINDS.map((k) => {
            const Icon = ACTIVITY_ICON[k];
            return (
              <button key={k} type="button" className={`opt-chip${kind === k ? ' is-on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
                <Icon size={14} aria-hidden="true" /> {ACTIVITY_KIND_LABEL[k]}
              </button>
            );
          })}
        </div>
        <div className="lesson-editor__add-row">
          <TextField
            label="Material o actividad"
            value={what}
            onChange={(e) => setWhat(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addActivity();
              }
            }}
            maxLength={200}
            placeholder={ACTIVITY_PLACEHOLDER[kind]}
          />
          <TextField
            label="Enlace (opcional)"
            type="url"
            inputMode="url"
            value={whatUrl}
            onChange={(e) => {
              setWhatUrl(e.target.value);
              const u = normalizeCourseUrl(e.target.value);
              // Con el enlace se reconoce el tipo, salvo que ya hayas elegido otro (ejercicio, examen…).
              if (validCourseUrl(u) && (kind === 'video' || kind === 'pagina' || kind === 'lectura')) setKind(guessActivityKind(what, u));
            }}
            onBlur={() => setWhatUrl(actLink)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addActivity();
              }
            }}
            maxLength={2000}
            placeholder="https://…"
            error={badActUrl ? 'Pega un enlace completo (https://…)' : null}
          />
          <button type="button" className="btn btn--secondary btn--sm" onClick={addActivity} disabled={(!what.trim() && !actLink) || badActUrl || acts.length >= 60}>
            <Plus size={16} aria-hidden="true" /> Añadir {ACTIVITY_KIND_LABEL[kind].toLowerCase()}
          </button>
        </div>
      </div>
    </div>
  );
}

const ACTIVITY_PLACEHOLDER: Record<ActivityKind, string> = {
  video: 'Ver el video de la clase',
  lectura: 'Read this article',
  pagina: 'Explore this webpage',
  ejercicio: 'Complete these exercises',
  cuestionario: 'Cuestionario de repaso',
  examen: 'Examen de la unidad',
  tarea: 'Entregar el ejercicio 3',
  practica: 'Practicar con el ejemplo',
  proyecto: 'Proyecto final',
  otro: 'Otra cosa por hacer',
};
