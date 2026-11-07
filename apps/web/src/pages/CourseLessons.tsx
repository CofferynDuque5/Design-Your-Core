import { formatLength, lessonsByUnit, lessonsFromPlaylist, lessonsPatch, nextLesson, normalizeCourseUrl, validCourseUrl, youtubeRef, type CourseLesson, type LegacyCourse } from '@dyc/core';
import { useIsMutating } from '@tanstack/react-query';
import { ExternalLink, ListVideo, Play, Plus, Trash2 } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { newId, useLegacyData, useLegacyList, type ChangeOpts } from '../app/legacy';
import { TextField } from '../components/Form';
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
  // Sin cambios en camino manda lo guardado (otro dispositivo, «Deshacer»…).
  const saving = useIsMutating({ mutationKey: ['legacy'] }) > 0;
  if (!saving) mine.current = null;
  const lessons = mine.current ?? c.lessons ?? [];
  const unitList = useId();
  const [title, setTitle] = useState('');
  const [unit, setUnit] = useState(() => lessons.at(-1)?.unit ?? '');
  const [url, setUrl] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // El curso cambia con cada guardado: se usa siempre el último.
  const latest = useRef(c);
  latest.current = c;
  const current = () => mine.current ?? latest.current.lessons ?? [];
  const save = (next: CourseLesson[], opts?: ChangeOpts) => {
    const patch = lessonsPatch({ ...latest.current, lessons: current() }, next);
    mine.current = next;
    update(latest.current, patch, opts);
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
  const units = [...new Set(lessons.map((l) => (l.unit ?? '').trim()).filter(Boolean))];
  const done = lessons.filter((l) => l.done).length;
  const list = youtubeRef(c.url)?.list;
  const next = nextLesson(c);
  const played = lessons.find((l) => l.id === playing);
  const playedRef = played?.url ? youtubeRef(played.url) : null;

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || badUrl) return;
    save([...lessons, { id: newId(), title: title.trim(), ...(unit.trim() ? { unit: unit.trim() } : {}), ...(link ? { url: link } : {}) }]);
    setTitle('');
    setUrl('');
    setStatus(`Añadida «${title.trim()}».`);
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
      {lessonsByUnit(lessons).map((g) => (
        <section key={g.unit || '-'} className="lessons__unit" aria-label={g.unit || 'Lecciones'}>
          {g.unit && (
            <h3 className="course-sub__title">
              {g.unit} <span className="numeric">· {g.items.filter((l) => l.done).length}/{g.items.length}</span>
            </h3>
          )}
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
                    </span>
                  </label>
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
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <form className="stack lessons__add" onSubmit={add}>
        <h3 className="planner__title">Añadir lección</h3>
        <div className="grid-2">
          <TextField label="Unidad (opcional)" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={120} placeholder="Unidad 1, Módulo 2…" list={units.length ? unitList : undefined} />
          <TextField label="Lección o video" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Introducción, Clase 3…" />
        </div>
        {units.length > 0 && (
          <datalist id={unitList}>
            {units.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        )}
        <TextField
          label="Enlace de la lección (opcional)"
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => setUrl(link)}
          maxLength={2000}
          placeholder="https://youtube.com/watch?v=…"
          error={badUrl ? 'Pega un enlace completo, por ejemplo https://youtube.com/watch?v=…' : null}
        />
        <button type="submit" className="btn btn--sm" disabled={!title.trim() || badUrl || lessons.length >= 500} style={{ alignSelf: 'flex-start' }}>
          <Plus size={16} aria-hidden="true" /> Añadir lección
        </button>
      </form>
    </div>
  );
}
