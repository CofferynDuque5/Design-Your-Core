import { CONTENT_PLATFORM_INFO, CONTENT_PLATFORMS, CONTENT_STAGE_INFO, CONTENT_STAGES, type ContentPlatform, type ContentStage, type LegacyContent } from '@dyc/core';
import { CalendarClock, Pencil, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { newId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { SelectField, TextArea, TextField } from '../components/Form';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { FormActions, Stats } from '../components/ToolParts';

/** Valores desconocidos se muestran como los de por defecto, sin cambiar el dato. */
const platformOf = (c: LegacyContent): ContentPlatform => (CONTENT_PLATFORMS.includes(c.platform) ? c.platform : 'otro');
const stageOf = (c: LegacyContent): ContentStage => (CONTENT_STAGES.includes(c.stage) ? c.stage : 'idea');

export function Content() {
  const legacy = useLegacyData();
  const items = useLegacyList(legacy.data?.data, 'content');
  const actions = useModule('content');
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState<ContentPlatform>('youtube');
  const [editing, setEditing] = useState<LegacyContent | null>(null);
  const published = items.filter((c) => stageOf(c) === 'publicado');
  const inProgress = items.filter((c) => stageOf(c) !== 'publicado');

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    actions.add({ id: newId(), title: title.trim(), stage: 'idea', platform, notes: '', script: '', due: '' });
    setTitle('');
  };

  return (
    <div className="page page--narrow">
      <PageHeader eyebrow="Herramientas" title="Contenido" />
      {legacy.isPending ? (
        <Loading label="Cargando tu contenido" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : (
        <div className="stack-lg">
          <form className="card add-row" onSubmit={add} aria-label="Añadir video">
            <TextField label="Nuevo video" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Probé 100 apps de IA" />
            <SelectField label="Plataforma" value={platform} onChange={(e) => setPlatform(e.target.value as ContentPlatform)}>
              {CONTENT_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {CONTENT_PLATFORM_INFO[p].label}
                </option>
              ))}
            </SelectField>
            <button type="submit" className="btn" disabled={!title.trim()}>
              <Plus size={18} aria-hidden="true" /> Añadir
            </button>
          </form>

          {items.length === 0 ? (
            <EmptyState title="Aún no tienes contenido">Apunta tus ideas de video y llévalas del guion a la publicación.</EmptyState>
          ) : (
            <>
              <Stats
                items={[
                  { value: items.length, label: 'En total' },
                  { value: published.length, label: published.length === 1 ? 'Publicado' : 'Publicados' },
                ]}
              />
              <section className="card stack-sm" aria-labelledby="pipeline-title">
                <h2 id="pipeline-title" className="list-count">
                  Por etapa
                </h2>
                <ol className="pipeline">
                  {CONTENT_STAGES.map((s) => (
                    <li key={s} className={`pipeline__stage pipeline__stage--${s}`}>
                      <span className="pipeline__count numeric">{items.filter((c) => stageOf(c) === s).length}</span>
                      <span className="small">{CONTENT_STAGE_INFO[s].label}</span>
                    </li>
                  ))}
                </ol>
              </section>
              {[
                { id: 'produccion', label: 'En producción', list: inProgress },
                { id: 'publicados', label: 'Publicados', list: published },
              ].map(
                (g) =>
                  g.list.length > 0 && (
                    <section key={g.id} className="card card--list" aria-labelledby={`content-${g.id}`}>
                      <h2 id={`content-${g.id}`} className="list-count">
                        {g.label} <span className="chip small numeric">{g.list.length}</span>
                      </h2>
                      <ul>
                        {g.list.map((c) => (
                          <ContentRow key={c.id} item={c} onEdit={() => setEditing(c)} />
                        ))}
                      </ul>
                    </section>
                  ),
              )}
            </>
          )}
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Editar video">
        {editing && <ContentForm item={editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

function ContentRow({ item: c, onEdit }: { item: LegacyContent; onEdit: () => void }) {
  const actions = useModule('content');
  const platform = CONTENT_PLATFORM_INFO[platformOf(c)];
  const stage = stageOf(c);
  const done = stage === 'publicado';
  const title = c.title || 'Sin título';
  return (
    <li className={`content-row${done ? ' content-row--done' : ''}`}>
      {/* Como la app anterior: publicar y despublicar alterna entre «Publicado» y «Guion». */}
      <input type="checkbox" className="content-row__check" checked={done} onChange={() => actions.update(c.id, { stage: done ? 'guion' : 'publicado' })} aria-label={`Publicado: «${title}»`} />
      <div className="content-row__body">
        <div className="content-row__meta small">
          <span className="platform" style={{ ['--c' as string]: platform.color }}>
            <span className="legend__dot" aria-hidden="true" />
            {platform.label}
          </span>
          <span className={`chip stage stage--${stage}`}>{CONTENT_STAGE_INFO[stage].label}</span>
          {c.due?.trim() && (
            <span className="muted row">
              <CalendarClock size={14} aria-hidden="true" /> {c.due}
            </span>
          )}
        </div>
        <strong className="content-row__title">{title}</strong>
        {c.script?.trim() && <p className="muted small clamp-2">{c.script}</p>}
      </div>
      <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Editar «${title}»`}>
        <Pencil size={18} aria-hidden="true" />
      </button>
    </li>
  );
}

function ContentForm({ item, onDone }: { item: LegacyContent; onDone: () => void }) {
  const actions = useModule('content');
  const [title, setTitle] = useState(item.title ?? '');
  const [platform, setPlatform] = useState<ContentPlatform>(platformOf(item));
  const [due, setDue] = useState(item.due ?? '');
  const [stage, setStage] = useState<ContentStage>(stageOf(item));
  const [script, setScript] = useState(item.script ?? '');
  const [notes, setNotes] = useState(item.notes ?? '');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    actions.update(item.id, { title: title.trim(), platform, due: due.trim(), stage, script, notes });
    onDone();
  };

  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="Título" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required autoFocus />
      <div className="grid-2">
        <SelectField label="Plataforma" value={platform} onChange={(e) => setPlatform(e.target.value as ContentPlatform)}>
          {CONTENT_PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {CONTENT_PLATFORM_INFO[p].label}
            </option>
          ))}
        </SelectField>
        <TextField label="Fecha (opcional)" value={due} onChange={(e) => setDue(e.target.value)} maxLength={60} placeholder="12 sep" />
      </div>
      <SelectField label="Etapa" value={stage} onChange={(e) => setStage(e.target.value as ContentStage)}>
        {CONTENT_STAGES.map((s) => (
          <option key={s} value={s}>
            {CONTENT_STAGE_INFO[s].label}
          </option>
        ))}
      </SelectField>
      <TextArea label="Guion" value={script} onChange={(e) => setScript(e.target.value)} rows={7} maxLength={50_000} placeholder="Gancho, puntos clave y cierre con llamada a la acción." hint="Admite Markdown." />
      <TextArea label="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={50_000} placeholder="Ideas de edición, música, tomas…" />
      <FormActions
        submitLabel="Guardar"
        disabled={!title.trim()}
        onDelete={() => {
          actions.remove(item.id);
          onDone();
        }}
        confirm={`Se borrará «${item.title || 'este video'}» con su guion y sus notas.`}
      />
    </form>
  );
}
