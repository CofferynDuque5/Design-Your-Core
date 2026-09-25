import { IDEA_CATEGORIES, IDEA_CATEGORY_INFO, splitTags, type IdeaCategory, type LegacyIdea } from '@dyc/core';
import { Lightbulb, Pencil, Plus, Trash2 } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { newId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { useToast } from '../app/toast';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { SelectField, TextField } from '../components/Form';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { FormActions } from '../components/ToolParts';
import { plural } from '../lib/format';
import { useAutosave } from '../lib/tools';

type Filter = 'todas' | IdeaCategory;
const EXAMPLES = ['App de hábitos', 'Landing para portfolio', 'Reel para Instagram'];
/** Una categoría desconocida se muestra como «Otro», sin cambiar el dato. */
const categoryOf = (i: LegacyIdea): IdeaCategory => (IDEA_CATEGORIES.includes(i.category) ? i.category : 'otro');

export function Ideas() {
  const legacy = useLegacyData();
  const ideas = useLegacyList(legacy.data?.data, 'ideas');
  const actions = useModule('ideas');
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('todas');
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState<LegacyIdea | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // Como la app anterior: una idea nueva toma la categoría del filtro (o App con «Todas»).
  const category: IdeaCategory = filter === 'todas' ? 'app' : filter;
  const shown = ideas.filter((i) => filter === 'todas' || categoryOf(i) === filter);

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    actions.add({ id: newId(), title: title.trim(), body: '', category, tags: '' });
    setTitle('');
  };

  const remove = (idea: LegacyIdea) => {
    const order = ideas.map((i) => i.id);
    actions.remove(idea.id);
    toast('Idea eliminada.', {
      action: {
        label: 'Deshacer',
        run: () => {
          actions.add(idea);
          actions.reorder(order);
        },
      },
    });
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Herramientas" title="Ideas">
        {ideas.length > 0 && <span className="chip numeric">{plural(ideas.length, 'guardada', 'guardadas')}</span>}
      </PageHeader>
      {legacy.isPending ? (
        <Loading label="Cargando tus ideas" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : (
        <div className="stack-lg">
          <div className="chips" role="group" aria-label="Categoría">
            {(['todas', ...IDEA_CATEGORIES] as Filter[]).map((c) => (
              <button key={c} type="button" className="chip-btn" aria-pressed={filter === c} onClick={() => setFilter(c)}>
                {c === 'todas' ? 'Todas' : IDEA_CATEGORY_INFO[c].label}
              </button>
            ))}
          </div>
          <form className="inline-add" onSubmit={add}>
            <label className="visually-hidden" htmlFor="new-idea">
              Nueva idea de {IDEA_CATEGORY_INFO[category].label}
            </label>
            <input ref={input} id="new-idea" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={`Nueva idea de ${IDEA_CATEGORY_INFO[category].label}…`} />
            <button type="submit" className="btn" disabled={!title.trim()}>
              <Plus size={18} aria-hidden="true" /> Añadir
            </button>
          </form>

          {ideas.length === 0 ? (
            <EmptyState
              title="Tu primera idea empieza aquí"
              action={
                <div className="chips center-chips" role="group" aria-label="Ejemplos">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      className="chip-btn"
                      onClick={() => {
                        setTitle(ex);
                        input.current?.focus();
                      }}
                    >
                      <Lightbulb size={15} aria-hidden="true" /> {ex}
                    </button>
                  ))}
                </div>
              }
            >
              Anota lo que se te ocurra: apps, webs o estrategias de marketing. ¿Sin inspiración? Prueba con un ejemplo:
            </EmptyState>
          ) : shown.length === 0 ? (
            <EmptyState title={`Aún no hay ideas de ${IDEA_CATEGORY_INFO[category].label}`}>Escribe la primera arriba.</EmptyState>
          ) : (
            <ul className="card-grid tool-grid" aria-label="Ideas">
              {shown.map((i) => (
                <li key={i.id}>
                  <IdeaCard idea={i} onEdit={() => setEditing(i)} onRemove={() => remove(i)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Editar idea">
        {editing && <IdeaForm idea={editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

function IdeaCard({ idea: i, onEdit, onRemove }: { idea: LegacyIdea; onEdit: () => void; onRemove: () => void }) {
  const actions = useModule('ideas');
  const id = useId();
  const cat = IDEA_CATEGORY_INFO[categoryOf(i)];
  const title = i.title || 'Sin título';
  const body = useAutosave(i.body ?? '', (v) => v !== i.body && actions.update(i.id, { body: v }));
  const tags = useAutosave(i.tags ?? '', (v) => v !== i.tags && actions.update(i.id, { tags: v.slice(0, 300) }), 1000);
  return (
    <article className="card tool-card idea-card" style={{ ['--c' as string]: cat.color }} aria-labelledby={`${id}-t`}>
      <div className="tool-card__head">
        <span className="platform small">
          <span className="legend__dot" aria-hidden="true" />
          <span className="visually-hidden">Categoría: </span>
          {cat.label}
        </span>
        <span className="row">
          <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Editar «${title}»`}>
            <Pencil size={18} aria-hidden="true" />
          </button>
          <button type="button" className="icon-btn" onClick={onRemove} aria-label={`Borrar «${title}»`}>
            <Trash2 size={18} aria-hidden="true" />
          </button>
        </span>
      </div>
      <h2 id={`${id}-t`} className="tool-card__title">
        {title}
      </h2>
      <label className="visually-hidden" htmlFor={`${id}-b`}>
        Desarrollo de «{title}»
      </label>
      <textarea id={`${id}-b`} className="input idea-card__body" value={body.draft} onChange={(e) => body.change(e.target.value)} onBlur={body.flush} rows={3} maxLength={50_000} placeholder="Desarrolla la idea…" />
      {splitTags(tags.draft).length > 0 && (
        <ul className="tag-list" aria-label="Etiquetas">
          {splitTags(tags.draft).map((t) => (
            <li key={t} className="small">
              #{t}
            </li>
          ))}
        </ul>
      )}
      <label className="visually-hidden" htmlFor={`${id}-g`}>
        Etiquetas de «{title}», separadas por comas
      </label>
      <input
        id={`${id}-g`}
        className="input input--quiet"
        value={tags.draft}
        onChange={(e) => tags.change(e.target.value)}
        onBlur={tags.flush}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        maxLength={300}
        placeholder="Etiquetas (coma): urgente, saas"
      />
    </article>
  );
}

function IdeaForm({ idea, onDone }: { idea: LegacyIdea; onDone: () => void }) {
  const actions = useModule('ideas');
  const [title, setTitle] = useState(idea.title ?? '');
  const [category, setCategory] = useState<IdeaCategory>(categoryOf(idea));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    actions.update(idea.id, { title: title.trim(), category });
    onDone();
  };
  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="Idea" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required autoFocus />
      <SelectField label="Categoría" value={category} onChange={(e) => setCategory(e.target.value as IdeaCategory)}>
        {IDEA_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {IDEA_CATEGORY_INFO[c].label}
          </option>
        ))}
      </SelectField>
      <FormActions
        submitLabel="Guardar"
        disabled={!title.trim()}
        onDelete={() => {
          actions.remove(idea.id);
          onDone();
        }}
        confirm={`Se borrará «${idea.title || 'esta idea'}» con su desarrollo y etiquetas.`}
      />
    </form>
  );
}
