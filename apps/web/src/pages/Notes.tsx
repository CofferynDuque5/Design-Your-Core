import { NOTE_DEFAULT_SUBJECT, NOTE_DEFAULT_TITLE, noteDateLabel, noteTag, splitTags, type LegacyNote } from '@dyc/core';
import { useIsMutating } from '@tanstack/react-query';
import { ArrowLeft, Bold, Code, Heading2, ImagePlus, Italic, List, ListChecks, Plus, Quote, Search, Trash2 } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { compressImage, uploadImage, useCoreImages } from '../app/images';
import { newId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { useToast } from '../app/toast';
import { PageHeader } from '../components/AppShell';
import { Segmented, TextField } from '../components/Form';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { ConfirmDelete, safeColor } from '../components/ToolParts';
import { plural } from '../lib/format';
import { Markdown, markdownToText } from '../lib/markdown';
import { applyFormat, insertBlock, type FormatKind } from '../lib/noteFormat';
import { useAutosave } from '../lib/tools';

const byName = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' });
const subjectOf = (n: LegacyNote) => (typeof n.subject === 'string' && n.subject.trim() ? n.subject.trim() : NOTE_DEFAULT_SUBJECT);
const titleOf = (n: LegacyNote) => (typeof n.title === 'string' && n.title.trim() ? n.title : NOTE_DEFAULT_TITLE);
const bodyOf = (n: LegacyNote) => (typeof n.body === 'string' ? n.body : '');
const colorOf = (n: LegacyNote) => safeColor(n.tag, noteTag(subjectOf(n)));
/** Texto de la tarjeta: el principio de la nota sin marcas de Markdown. */
const previewOf = (n: LegacyNote) => markdownToText(bodyOf(n).slice(0, 1500)).slice(0, 160);
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------- Biblioteca ----------

export function Notes() {
  const legacy = useLegacyData();
  const notes = useLegacyList(legacy.data?.data, 'notes');
  const actions = useModule('notes');
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  // La nota nueva se abre cuando ya está en la lista (el cambio optimista tarda un instante).
  const [opening, setOpening] = useState<string | null>(null);
  useEffect(() => {
    if (opening && notes.some((n) => n.id === opening)) navigate(`/notas/${encodeURIComponent(opening)}`, { state: { fresh: true } });
  }, [opening, notes, navigate]);

  const tags = useMemo(() => Array.from(new Set(notes.flatMap((n) => splitTags(n.tags).map((t) => t.toLowerCase())))).sort(byName), [notes]);
  const shown = useMemo(() => {
    const q = norm(query.trim());
    return notes.filter(
      (n) =>
        (!tag || splitTags(n.tags).some((t) => t.toLowerCase() === tag)) &&
        (!q || norm(`${titleOf(n)} ${subjectOf(n)} ${n.tags ?? ''} ${bodyOf(n).slice(0, 20_000)}`).includes(q)),
    );
  }, [notes, query, tag]);
  // Biblioteca por materia, como la app anterior.
  const groups = useMemo(() => {
    const map = new Map<string, LegacyNote[]>();
    for (const n of shown) map.set(subjectOf(n), [...(map.get(subjectOf(n)) ?? []), n]);
    return [...map].sort(([a], [b]) => byName(a, b));
  }, [shown]);

  const create = () => {
    const subject = NOTE_DEFAULT_SUBJECT;
    const note: LegacyNote = { id: newId(), title: NOTE_DEFAULT_TITLE, subject, date: noteDateLabel(), tag: noteTag(subject), excerpt: '', body: '', commit: false, tags: tag, shareId: null };
    actions.add(note);
    setOpening(note.id);
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Conocimiento" title="Notas">
        <button type="button" className="btn" onClick={create} disabled={!legacy.data}>
          <Plus size={18} aria-hidden="true" /> Nueva nota
        </button>
      </PageHeader>
      {legacy.isPending ? (
        <Loading label="Cargando tus notas" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : notes.length === 0 ? (
        <EmptyState title="Aún no tienes notas" action={<button type="button" className="btn btn--secondary btn--sm" onClick={create}>Escribir la primera</button>}>
          Guarda apuntes en Markdown con títulos, listas, casillas, código e imágenes, agrupados por materia.
        </EmptyState>
      ) : (
        <div className="stack-lg">
          <div className="stack-sm">
            <div className="search-field">
              <Search size={18} aria-hidden="true" />
              <label className="visually-hidden" htmlFor="notes-search">
                Buscar en tus notas
              </label>
              <input id="notes-search" type="search" className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por título, materia o texto…" />
            </div>
            {tags.length > 0 && (
              <div className="chips" role="group" aria-label="Etiqueta">
                <button type="button" className="chip-btn" aria-pressed={!tag} onClick={() => setTag('')}>
                  Todas
                </button>
                {tags.map((t) => (
                  <button key={t} type="button" className="chip-btn" aria-pressed={tag === t} onClick={() => setTag(tag === t ? '' : t)}>
                    #{t}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="visually-hidden" aria-live="polite">
            {query || tag ? plural(shown.length, 'nota encontrada', 'notas encontradas') : ''}
          </p>
          {groups.length === 0 ? (
            <EmptyState title="Ninguna nota coincide">Prueba con otra palabra o quita el filtro de etiqueta.</EmptyState>
          ) : (
            groups.map(([subject, list], gi) => (
              <section key={subject} className="stack-sm" aria-labelledby={`notes-group-${gi}`}>
                <h2 id={`notes-group-${gi}`} className="section-title note-group-title">
                  <span className="legend__dot" style={{ ['--c' as string]: colorOf(list[0]) }} aria-hidden="true" />
                  {subject} <span className="chip small numeric">{list.length}</span>
                </h2>
                <ul className="note-grid">
                  {list.map((n) => (
                    <li key={n.id}>
                      <Link to={`/notas/${encodeURIComponent(n.id)}`} className="card note-card" style={{ ['--c' as string]: colorOf(n) }}>
                        <strong className="note-card__title">{titleOf(n)}</strong>
                        <span className="note-card__text muted small">{previewOf(n) || 'Nota vacía'}</span>
                        <span className="note-card__meta small">
                          {typeof n.date === 'string' && n.date && <span className="muted">{n.date}</span>}
                          {splitTags(n.tags)
                            .slice(0, 4)
                            .map((t) => (
                              <span key={t} className="note-card__tag">
                                #{t}
                              </span>
                            ))}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Editor ----------

export function NoteEditor() {
  const { id } = useParams();
  const legacy = useLegacyData();
  const notes = useLegacyList(legacy.data?.data, 'notes');
  const note = notes.find((n) => n.id === id);

  if (legacy.isPending || legacy.isError || !note) {
    return (
      <div className="page">
        <BackLink />
        <PageHeader eyebrow="Notas" title="Nota" />
        {legacy.isPending ? (
          <Loading label="Cargando la nota" />
        ) : legacy.isError ? (
          <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
        ) : (
          <EmptyState title="Esta nota ya no existe" action={<Link to="/notas" className="btn btn--secondary btn--sm">Ver tus notas</Link>}>
            Puede que la hayas borrado aquí o en la app anterior.
          </EmptyState>
        )}
      </div>
    );
  }
  return <Editor key={note.id} note={note} subjects={Array.from(new Set(notes.map(subjectOf))).sort(byName)} />;
}

function BackLink() {
  return (
    <Link to="/notas" className="back-link">
      <ArrowLeft size={16} aria-hidden="true" /> Notas
    </Link>
  );
}

const TOOLBAR: Array<{ kind: FormatKind; label: string; icon: typeof Bold }> = [
  { kind: 'bold', label: 'Negrita', icon: Bold },
  { kind: 'italic', label: 'Cursiva', icon: Italic },
  { kind: 'heading', label: 'Encabezado', icon: Heading2 },
  { kind: 'list', label: 'Lista', icon: List },
  { kind: 'task', label: 'Casilla', icon: ListChecks },
  { kind: 'code', label: 'Código', icon: Code },
  { kind: 'quote', label: 'Cita', icon: Quote },
];

function Editor({ note, subjects }: { note: LegacyNote; subjects: string[] }) {
  const actions = useModule('notes');
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const fid = useId();
  const fresh = !!(location.state as { fresh?: boolean } | null)?.fresh;
  const [mode, setMode] = useState<'write' | 'preview'>(fresh || !bodyOf(note) ? 'write' : 'preview');
  const [asking, setAsking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const selection = useRef<{ start: number; end: number } | null>(null);
  // Dónde estaba el cursor al salir del texto (para insertar la imagen ahí; si nunca se tocó, al final).
  const caret = useRef<{ start: number; end: number } | null>(null);
  const saving = useIsMutating({ mutationKey: ['legacy'] }) > 0;

  // Como la app anterior: se guarda con una espera de 500 ms. Un título vacío se guarda al salir del campo.
  const title = useAutosave(note.title ?? '', (v) => v.trim() && v !== note.title && actions.update(note.id, { title: v.slice(0, 200) }), 500);
  const body = useAutosave(bodyOf(note), (v) => v !== note.body && actions.update(note.id, { body: v }), 500);
  const tags = useAutosave(note.tags ?? '', (v) => v !== note.tags && actions.update(note.id, { tags: v.slice(0, 300) }), 1000);
  const [subject, setSubject] = useState(subjectOf(note));
  // Solo cambia si otra pantalla o la app anterior cambian la materia (aquí se guarda al salir del campo).
  const savedSubject = subjectOf(note);
  useEffect(() => setSubject(savedSubject), [savedSubject]);
  const saveSubject = () => {
    const s = subject.trim().slice(0, 120) || NOTE_DEFAULT_SUBJECT;
    setSubject(s);
    if (s !== note.subject) actions.update(note.id, { subject: s });
  };
  const resolve = useCoreImages(body.draft);

  useEffect(() => {
    document.title = `${title.draft.trim() || NOTE_DEFAULT_TITLE} · Notas · Design Your Core`;
  }, [title.draft]);
  useEffect(() => {
    if (!fresh) return;
    titleInput.current?.focus();
    titleInput.current?.select();
    // Solo la primera vez: al recargar, la nota ya no es «nueva».
    navigate(location.pathname, { replace: true, state: null });
  }, [fresh, navigate, location.pathname]);

  // Tras cambiar el texto desde la barra, se recupera la selección.
  useLayoutEffect(() => {
    const sel = selection.current;
    if (!sel || !area.current) return;
    selection.current = null;
    area.current.focus();
    area.current.setSelectionRange(sel.start, sel.end);
  });

  const format = (kind: FormatKind) => {
    const el = area.current;
    const start = el?.selectionStart ?? body.draft.length;
    const end = el?.selectionEnd ?? body.draft.length;
    const edit = applyFormat(body.draft, start, end, kind);
    selection.current = { start: edit.start, end: edit.end };
    body.change(edit.value);
  };

  const addImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const start = caret.current?.start ?? body.draft.length;
    const end = caret.current?.end ?? body.draft.length;
    setUploading(true);
    try {
      const imgId = await uploadImage(await compressImage(file));
      const current = area.current?.value ?? body.draft;
      const edit = insertBlock(current, Math.min(start, current.length), Math.min(end, current.length), `![imagen](coreimg:${imgId})`);
      selection.current = { start: edit.start, end: edit.end };
      caret.current = { start: edit.start, end: edit.end };
      setMode('write');
      body.change(edit.value);
      toast('Imagen añadida a la nota.');
    } catch (err) {
      toast(err instanceof Error && err.message ? err.message : 'No se pudo añadir la imagen.', { tone: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const remove = () => {
    actions.remove(note.id);
    toast('Nota eliminada.');
    navigate('/notas');
  };

  const name = title.draft.trim() || NOTE_DEFAULT_TITLE;
  return (
    <div className="page note-page">
      <div className="note-page__top">
        <BackLink />
        <span className="muted small" aria-live="polite">
          {uploading ? 'Subiendo la imagen…' : saving ? 'Guardando…' : 'Guardado'}
        </span>
      </div>
      <h1 className="visually-hidden">Nota: {name}</h1>
      <label className="visually-hidden" htmlFor={`${fid}-title`}>
        Título
      </label>
      <input
        ref={titleInput}
        id={`${fid}-title`}
        className="note-title-input"
        value={title.draft}
        onChange={(e) => title.change(e.target.value)}
        onBlur={() => {
          if (!title.draft.trim()) title.change(NOTE_DEFAULT_TITLE);
          title.flush();
        }}
        onKeyDown={(e) => e.key === 'Enter' && area.current?.focus()}
        maxLength={200}
        placeholder={NOTE_DEFAULT_TITLE}
        style={{ ['--c' as string]: noteTag(subject.trim() || NOTE_DEFAULT_SUBJECT) }}
      />
      <div className="note-meta">
        <TextField
          label="Materia"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          onBlur={saveSubject}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          maxLength={120}
          list={`${fid}-subjects`}
          placeholder={NOTE_DEFAULT_SUBJECT}
        />
        <datalist id={`${fid}-subjects`}>
          {subjects.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <TextField
          label="Etiquetas"
          hint="Separadas por comas: examen, física"
          value={tags.draft}
          onChange={(e) => tags.change(e.target.value)}
          onBlur={tags.flush}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          maxLength={300}
        />
      </div>

      <section className="card note-editor" aria-label="Contenido">
        <div className="note-toolbar">
          <Segmented
            label="Modo"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'write', label: 'Escribir' },
              { value: 'preview', label: 'Vista previa' },
            ]}
          />
          {mode === 'write' && (
            <div className="note-toolbar__tools" role="group" aria-label="Formato">
              {TOOLBAR.map(({ kind, label, icon: Icon }) => (
                <button key={kind} type="button" className="icon-btn" onClick={() => format(kind)} aria-label={label} title={label}>
                  <Icon size={18} aria-hidden="true" />
                </button>
              ))}
              <label className={`icon-btn note-toolbar__file${uploading ? ' is-busy' : ''}`} title="Insertar imagen">
                <ImagePlus size={18} aria-hidden="true" />
                <input type="file" accept="image/*" className="visually-hidden" onChange={addImage} disabled={uploading} aria-label="Insertar imagen" />
              </label>
            </div>
          )}
        </div>
        {mode === 'write' ? (
          <>
            <label className="visually-hidden" htmlFor={`${fid}-body`}>
              Texto de la nota, en Markdown
            </label>
            <textarea
              ref={area}
              id={`${fid}-body`}
              className="note-body-input"
              value={body.draft}
              onChange={(e) => body.change(e.target.value)}
              onBlur={body.flush}
              onSelect={(e) => (caret.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd })}
              placeholder={'# Tema\n\nEscribe tus apuntes. **Negrita**, *cursiva*, listas, - [ ] casillas, `código` y $fórmulas$.'}
              rows={16}
              spellCheck
            />
          </>
        ) : body.draft.trim() ? (
          <Markdown text={body.draft} resolveImage={resolve} className="note-preview" />
        ) : (
          <p className="muted note-preview">Esta nota está vacía. Pulsa «Escribir» para empezar.</p>
        )}
      </section>
      <p className="muted small">Se guarda sola mientras escribes. Las fórmulas entre $ se muestran como texto, sin dibujarlas.</p>

      <div className="note-page__danger">
        {asking ? (
          <ConfirmDelete onConfirm={remove} onCancel={() => setAsking(false)}>
            Se borrará «{name}». No se puede deshacer.
          </ConfirmDelete>
        ) : (
          <button type="button" className="btn btn--ghost danger-text" onClick={() => setAsking(true)}>
            <Trash2 size={16} aria-hidden="true" /> Borrar nota
          </button>
        )}
      </div>
    </div>
  );
}
