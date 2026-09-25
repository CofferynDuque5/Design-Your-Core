import { BOX_COLORS, CODE_BOX_COLOR, CODE_LANGS, COLOR_NAMES, NOTEBOOK_COLORS, NOTEBOOK_EMOJIS, type LegacyNoteBox, type LegacyNotebook } from '@dyc/core';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Code2, Copy, ImageOff, Palette, Plus, Trash2, Type } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../app/api';
import { newId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { useToast } from '../app/toast';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { ColorPicker, SelectField, TextField } from '../components/Form';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { FormActions, optionsWith, paletteWith, safeColor } from '../components/ToolParts';
import { plural } from '../lib/format';
import { useAutosave } from '../lib/tools';

const uniq = (list: unknown[]) => Array.from(new Set(list.filter((x): x is string => typeof x === 'string' && !!x.trim()))).sort((a, b) => a.localeCompare(b, 'es'));
const kindOf = (b: LegacyNoteBox) => (b.kind === 'code' ? 'code' : 'text');

// ---------- Lista de cuadernos ----------

export function Notebooks() {
  const legacy = useLegacyData();
  const notebooks = useLegacyList(legacy.data?.data, 'notebooks');
  const boxes = useLegacyList(legacy.data?.data, 'noteBoxes');
  const [creating, setCreating] = useState(false);
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');

  // Filtros en cascada Categoría → Materia → Tema, con los valores que existen (como la app anterior).
  const inCategory = notebooks.filter((n) => !category || n.category === category);
  const inSubject = inCategory.filter((n) => !subject || n.subject === subject);
  const shown = inSubject.filter((n) => !topic || n.topic === topic);
  const filtering = !!(category || subject || topic);

  return (
    <div className="page">
      <PageHeader eyebrow="Herramientas" title="Cuadernos">
        <button type="button" className="btn" onClick={() => setCreating(true)} disabled={!legacy.data}>
          <Plus size={18} aria-hidden="true" /> Nuevo cuaderno
        </button>
      </PageHeader>
      {legacy.isPending ? (
        <Loading label="Cargando tus cuadernos" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : notebooks.length === 0 ? (
        <EmptyState title="Aún no tienes cuadernos">Organiza tus apuntes por categoría, materia y tema, y guárdalos en cajitas de texto o de código fáciles de copiar.</EmptyState>
      ) : (
        <div className="stack-lg">
          <div className="filters" role="group" aria-label="Filtrar cuadernos">
            <SelectField
              label="Categoría"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setSubject('');
                setTopic('');
              }}
            >
              <option value="">Todas</option>
              {uniq(notebooks.map((n) => n.category)).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </SelectField>
            <SelectField
              label="Materia"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setTopic('');
              }}
            >
              <option value="">Todas</option>
              {uniq(inCategory.map((n) => n.subject)).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </SelectField>
            <SelectField label="Tema" value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="">Todos</option>
              {uniq(inSubject.map((n) => n.topic)).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </SelectField>
            {filtering && (
              <button
                type="button"
                className="btn btn--ghost filters__clear"
                onClick={() => {
                  setCategory('');
                  setSubject('');
                  setTopic('');
                }}
              >
                Limpiar
              </button>
            )}
          </div>
          {shown.length === 0 ? (
            <EmptyState title="Ningún cuaderno con estos filtros" />
          ) : (
            <ul className="notebook-grid" aria-label="Cuadernos">
              {shown.map((n) => {
                const count = boxes.filter((b) => b.notebookId === n.id).length;
                return (
                  <li key={n.id}>
                    <Link to={`/cuadernos/${encodeURIComponent(n.id)}`} className="notebook-card" style={{ ['--c' as string]: safeColor(n.color, NOTEBOOK_COLORS[0]) }}>
                      <span className="notebook-card__cover" aria-hidden="true">
                        {n.emoji || '📓'}
                      </span>
                      <span className="notebook-card__body">
                        <strong className="notebook-card__title">{n.title || 'Cuaderno'}</strong>
                        <Tags notebook={n} />
                        <span className="muted small">{plural(count, 'cajita', 'cajitas')}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      <Dialog open={creating} onClose={() => setCreating(false)} title="Nuevo cuaderno">
        {creating && <NotebookForm notebook={null} all={notebooks} subjects={subjectNames(legacy.data?.data)} onDone={() => setCreating(false)} />}
      </Dialog>
    </div>
  );
}

function Tags({ notebook: n }: { notebook: LegacyNotebook }) {
  return (
    <span className="notebook-tags">
      <span className="chip">{n.category || 'General'}</span>
      {n.subject && <span className="chip">{n.subject}</span>}
      {n.topic && <span className="chip">{n.topic}</span>}
    </span>
  );
}

function subjectNames(data: Record<string, unknown> | undefined): string[] {
  const list = data?.subjects;
  return Array.isArray(list) ? uniq(list.map((s) => (s && typeof s === 'object' ? (s as { name?: unknown }).name : null))) : [];
}

function NotebookForm({ notebook, all, subjects, boxCount = 0, onDone, onDeleted }: { notebook: LegacyNotebook | null; all: LegacyNotebook[]; subjects: string[]; boxCount?: number; onDone: () => void; onDeleted?: () => void }) {
  const actions = useModule('notebooks');
  const listId = useId();
  const [title, setTitle] = useState(notebook?.title ?? '');
  const [category, setCategory] = useState(notebook?.category ?? 'General');
  const [subject, setSubject] = useState(notebook?.subject ?? '');
  const [topic, setTopic] = useState(notebook?.topic ?? '');
  const [color, setColor] = useState(safeColor(notebook?.color, NOTEBOOK_COLORS[0]));
  const [emoji, setEmoji] = useState(notebook?.emoji || NOTEBOOK_EMOJIS[0]);
  const emojis = optionsWith(NOTEBOOK_EMOJIS, emoji);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // Como la app anterior: sin título es «Cuaderno» y sin categoría, «General». La materia es texto libre.
    const fields = { title: title.trim() || 'Cuaderno', category: category.trim() || 'General', subject: subject.trim(), topic: topic.trim(), color, emoji };
    if (notebook) actions.update(notebook.id, fields);
    else actions.add({ id: newId(), ...fields });
    onDone();
  };

  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="Título" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus placeholder="Cuaderno" />
      <TextField label="Categoría" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={60} placeholder="General" list={`${listId}-cat`} />
      <div className="grid-2">
        <TextField label="Materia (opcional)" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder="Cálculo" list={`${listId}-sub`} />
        <TextField label="Tema (opcional)" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={120} placeholder="Derivadas" list={`${listId}-top`} />
      </div>
      <datalist id={`${listId}-cat`}>
        {uniq(['General', 'Universidad', ...all.map((n) => n.category)]).map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id={`${listId}-sub`}>
        {uniq([...subjects, ...all.map((n) => n.subject)]).map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id={`${listId}-top`}>
        {uniq(all.map((n) => n.topic)).map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <ColorPicker legend="Color" colors={paletteWith(NOTEBOOK_COLORS, color)} value={color} onChange={setColor} names={COLOR_NAMES} />
      <fieldset className="field">
        <legend className="field__label">Icono</legend>
        <div className="emoji-picker">
          {emojis.map((em) => (
            <label key={em} className="emoji-option">
              <input type="radio" name={`${listId}-emoji`} checked={emoji === em} onChange={() => setEmoji(em)} aria-label={`Icono ${em}`} />
              <span aria-hidden="true">{em}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <FormActions
        submitLabel={notebook ? 'Guardar' : 'Crear cuaderno'}
        onDelete={
          notebook
            ? () => {
                actions.remove(notebook.id);
                onDone();
                onDeleted?.();
              }
            : undefined
        }
        confirm={`Se borrará «${notebook?.title || 'Cuaderno'}»${boxCount ? ` con ${plural(boxCount, 'cajita', 'cajitas')}` : ''}.`}
      />
    </form>
  );
}

// ---------- Un cuaderno y sus cajitas ----------

export function NotebookDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const legacy = useLegacyData();
  const notebooks = useLegacyList(legacy.data?.data, 'notebooks');
  const allBoxes = useLegacyList(legacy.data?.data, 'noteBoxes');
  const actions = useModule('noteBoxes');
  const [decorating, setDecorating] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const notebook = notebooks.find((n) => n.id === id);
  const boxes = allBoxes.filter((b) => b.notebookId === id);

  const addBox = (kind: 'text' | 'code') => {
    if (!notebook) return;
    const box: LegacyNoteBox = { id: newId(), notebookId: notebook.id, title: '', text: '', color: kind === 'code' ? CODE_BOX_COLOR : BOX_COLORS[0], kind, lang: kind === 'code' ? CODE_LANGS[0] : '' };
    actions.add(box);
    setAdded(box.id);
  };

  if (legacy.isPending || legacy.isError || !notebook) {
    return (
      <div className="page">
        <BackLink />
        <PageHeader eyebrow="Cuadernos" title={notebook?.title || 'Cuaderno'} />
        {legacy.isPending ? (
          <Loading label="Cargando el cuaderno" />
        ) : legacy.isError ? (
          <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
        ) : (
          <EmptyState title="Este cuaderno ya no existe" action={<Link to="/cuadernos" className="btn btn--secondary btn--sm">Ver tus cuadernos</Link>}>
            Puede que lo hayas borrado aquí o en la app anterior.
          </EmptyState>
        )}
      </div>
    );
  }

  const color = safeColor(notebook.color, NOTEBOOK_COLORS[0]);
  return (
    <div className="page">
      <BackLink />
      <div className="notebook-hero" style={{ ['--c' as string]: color }}>
        <span className="notebook-hero__emoji" aria-hidden="true">
          {notebook.emoji || '📓'}
        </span>
        <div className="notebook-hero__text">
          <PageHeader eyebrow="Cuaderno" title={notebook.title || 'Cuaderno'} />
          <Tags notebook={notebook} />
        </div>
        <button type="button" className="btn btn--secondary notebook-hero__edit" onClick={() => setDecorating(true)}>
          <Palette size={18} aria-hidden="true" /> Decorar
        </button>
      </div>

      <section className="stack" aria-labelledby="boxes-title">
        <div className="section-head section-head--wrap">
          <h2 id="boxes-title" className="section-title">
            Cajitas
          </h2>
          <div className="row">
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => addBox('text')}>
              <Type size={16} aria-hidden="true" /> Texto
            </button>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => addBox('code')}>
              <Code2 size={16} aria-hidden="true" /> Código
            </button>
          </div>
        </div>
        {boxes.length === 0 ? (
          <EmptyState title="Sin cajitas todavía">Añade cajitas para separar tus apuntes en bloques que puedes copiar con un toque.</EmptyState>
        ) : (
          <ul className="box-grid">
            {boxes.map((b, i) => (
              <li key={b.id} className={kindOf(b) === 'code' ? 'box-grid__wide' : undefined}>
                {kindOf(b) === 'code' ? <CodeBox box={b} n={i + 1} autoFocus={added === b.id} /> : <TextBox box={b} n={i + 1} autoFocus={added === b.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={decorating} onClose={() => setDecorating(false)} title="Decorar cuaderno">
        {decorating && (
          <NotebookForm
            notebook={notebook}
            all={notebooks}
            subjects={subjectNames(legacy.data.data)}
            boxCount={boxes.length}
            onDone={() => setDecorating(false)}
            onDeleted={() => {
              toast('Cuaderno eliminado con sus cajitas.');
              navigate('/cuadernos');
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/cuadernos" className="back-link">
      <ArrowLeft size={16} aria-hidden="true" /> Cuadernos
    </Link>
  );
}

/** Copiar al portapapeles con aviso. */
function useCopy() {
  const toast = useToast();
  return (text: string) => {
    const done = navigator.clipboard?.writeText(text);
    if (!done) return toast('No se pudo copiar en este navegador.', { tone: 'error' });
    done.then(
      () => toast('Copiado.'),
      () => toast('No se pudo copiar en este navegador.', { tone: 'error' }),
    );
  };
}

function useBoxFields(box: LegacyNoteBox) {
  const actions = useModule('noteBoxes');
  const title = useAutosave(box.title ?? '', (v) => v !== box.title && actions.update(box.id, { title: v.slice(0, 200) }));
  const text = useAutosave(box.text ?? '', (v) => v !== box.text && actions.update(box.id, { text: v }));
  return { actions, title, text };
}

function BoxTools({ box, name, copyText, dark }: { box: LegacyNoteBox; name: string; copyText: string; dark?: boolean }) {
  const copy = useCopy();
  const toast = useToast();
  const actions = useModule('noteBoxes');
  const cls = dark ? 'icon-btn icon-btn--on-dark' : 'icon-btn';
  return (
    <>
      <button type="button" className={cls} onClick={() => copy(copyText)} aria-label={`Copiar ${name}`}>
        <Copy size={17} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={cls}
        onClick={() => {
          actions.remove(box.id);
          toast('Cajita eliminada.');
        }}
        aria-label={`Borrar ${name}`}
      >
        <Trash2 size={17} aria-hidden="true" />
      </button>
    </>
  );
}

function TextBox({ box, n, autoFocus }: { box: LegacyNoteBox; n: number; autoFocus: boolean }) {
  const { actions, title, text } = useBoxFields(box);
  const id = useId();
  const name = title.draft.trim() ? `la cajita «${title.draft.trim()}»` : `la cajita ${n}`;
  const color = safeColor(box.color, BOX_COLORS[0]);
  return (
    <section className="note-box" style={{ ['--c' as string]: color }} aria-label={title.draft.trim() ? `Cajita «${title.draft.trim()}»` : `Cajita ${n}`}>
      <div className="note-box__head">
        <label className="visually-hidden" htmlFor={`${id}-t`}>
          Título de {name}
        </label>
        <input id={`${id}-t`} className="note-box__title" value={title.draft} onChange={(e) => title.change(e.target.value)} onBlur={title.flush} maxLength={200} placeholder="Título" />
        <BoxTools box={box} name={name} copyText={(title.draft ? `${title.draft}\n` : '') + text.draft} />
      </div>
      <label className="visually-hidden" htmlFor={`${id}-x`}>
        Texto de {name}
      </label>
      <textarea id={`${id}-x`} className="note-box__text" value={text.draft} onChange={(e) => text.change(e.target.value)} onBlur={text.flush} placeholder="Escribe aquí…" rows={5} autoFocus={autoFocus} />
      <BoxImages text={text.draft} />
      <ColorPicker legend={`Color de ${name}`} colors={paletteWith(BOX_COLORS, color)} value={color} onChange={(c) => actions.update(box.id, { color: c })} names={COLOR_NAMES} compact />
    </section>
  );
}

function CodeBox({ box, n, autoFocus }: { box: LegacyNoteBox; n: number; autoFocus: boolean }) {
  const { actions, title, text } = useBoxFields(box);
  const id = useId();
  const name = title.draft.trim() ? `la cajita de código «${title.draft.trim()}»` : `la cajita de código ${n}`;
  const lang = box.lang || CODE_LANGS[0];
  const lines = Math.max(6, text.draft.split('\n').length + 1);
  return (
    <section className="code-box" aria-label={title.draft.trim() ? `Cajita de código «${title.draft.trim()}»` : `Cajita de código ${n}`}>
      <div className="code-box__head">
        <span className="code-box__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <label className="visually-hidden" htmlFor={`${id}-t`}>
          Nombre del archivo de {name}
        </label>
        <input id={`${id}-t`} className="code-box__title" value={title.draft} onChange={(e) => title.change(e.target.value)} onBlur={title.flush} maxLength={200} placeholder="archivo.js" spellCheck={false} />
        <label className="visually-hidden" htmlFor={`${id}-l`}>
          Lenguaje de {name}
        </label>
        {/* La app anterior no guardaba este cambio; aquí se guarda en el mismo campo `lang`. */}
        <select id={`${id}-l`} className="code-box__lang" value={lang} onChange={(e) => actions.update(box.id, { lang: e.target.value })}>
          {optionsWith(CODE_LANGS, lang).map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <BoxTools box={box} name={name} copyText={text.draft} dark />
      </div>
      <label className="visually-hidden" htmlFor={`${id}-x`}>
        Contenido de {name}
      </label>
      <textarea
        id={`${id}-x`}
        className="code-box__text"
        value={text.draft}
        onChange={(e) => text.change(e.target.value)}
        onBlur={text.flush}
        rows={Math.min(lines, 30)}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoFocus={autoFocus}
        placeholder="// Tu código"
      />
    </section>
  );
}

// ---------- Imágenes de la app anterior ----------

const CORE_IMG = /coreimg:([A-Za-z0-9_-]{1,80})/g;
const DATA_IMG = /data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+/g;

/**
 * La app anterior referencia las imágenes como `coreimg:<id>` (guardadas en el
 * navegador y, con nube, en /api/images) o las incrusta en base64. Aquí se
 * muestran las que se pueden leer; subir imágenes llegará más adelante.
 */
function BoxImages({ text }: { text: string }) {
  const ids = useMemo(() => Array.from(new Set(Array.from(text.matchAll(CORE_IMG), (m) => m[1]))), [text]);
  const inline = useMemo(() => Array.from(new Set(text.match(DATA_IMG) ?? [])), [text]);
  const cloud = useQuery({ queryKey: ['legacy-images', ids], queryFn: () => api.legacy.images(ids.slice(0, 100)), enabled: ids.length > 0, staleTime: Infinity });
  if (!ids.length && !inline.length) return null;
  const found = cloud.data?.images ?? {};
  const missing = cloud.isSuccess || cloud.isError ? ids.filter((i) => !found[i]).length : 0;
  return (
    <div className="box-images">
      {[...ids.filter((i) => found[i]).map((i) => found[i]), ...inline].map((src, i) => (
        <img key={i} src={src} alt={`Imagen ${i + 1} de la cajita`} loading="lazy" />
      ))}
      {missing > 0 && (
        <p className="muted small row">
          <ImageOff size={15} aria-hidden="true" />
          {missing === 1 ? 'Una imagen' : `${missing} imágenes`} solo está{missing === 1 ? '' : 'n'} en el navegador donde se añadi{missing === 1 ? 'ó' : 'eron'}.
        </p>
      )}
    </div>
  );
}
