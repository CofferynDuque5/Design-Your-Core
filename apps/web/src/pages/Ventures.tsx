import {
  COLOR_NAMES,
  formatBytes,
  utcDayKey,
  VENTURE_COLORS,
  VENTURE_FILE_MAX_BYTES,
  VENTURE_STAGE_INFO,
  VENTURE_STAGES,
  ventureItemName,
  ventureItemsOf,
  ventureSummary,
  type LegacyVenture,
  type LegacyVentureItem,
  type VentureItemKind,
  type VentureStage,
} from '@dyc/core';
import { ArrowLeft, Download, ExternalLink, FileText, ImagePlus, Link2, NotebookPen, Paperclip, Pencil, Plus, Rocket, Trash2 } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../app/api';
import { deleteFiles, readDataUrl, saveDataUrl, uploadFile, useFiles } from '../app/files';
import { compressImage } from '../app/images';
import { newId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { ColorPicker, Segmented, SelectField, TextArea, TextField } from '../components/Form';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { ConfirmDelete, FormActions } from '../components/ToolParts';
import { Markdown } from '../lib/markdown';

type Filter = 'todo' | VentureItemKind;
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'todo', label: 'Todo' },
  { value: 'note', label: 'Notas' },
  { value: 'image', label: 'Imágenes' },
  { value: 'file', label: 'Archivos' },
  { value: 'link', label: 'Enlaces' },
];
const stageOf = (v: LegacyVenture): VentureStage => (VENTURE_STAGES.includes(v.stage) ? v.stage : 'idea');

export function Ventures() {
  const { ventureId } = useParams();
  const legacy = useLegacyData();
  const ventures = useLegacyList(legacy.data?.data, 'ventures');
  const [editing, setEditing] = useState<LegacyVenture | 'new' | null>(null);
  const navigate = useNavigate();

  if (ventureId) {
    const v = ventures.find((x) => x.id === ventureId);
    if (legacy.isPending) return <Loading label="Cargando tu emprendimiento" />;
    if (legacy.isError) return <ErrorState error={legacy.error} retry={() => legacy.refetch()} />;
    if (!v)
      return (
        <div className="page">
          <BackLink />
          <EmptyState title="Este emprendimiento ya no existe">Puede que lo hayas borrado desde otro dispositivo.</EmptyState>
        </div>
      );
    return <VentureDetail venture={v} />;
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Estudio y trabajo" title="Emprendimientos">
        <button type="button" className="btn" onClick={() => setEditing('new')} disabled={!legacy.data}>
          <Plus size={18} aria-hidden="true" /> Nuevo emprendimiento
        </button>
      </PageHeader>
      {legacy.isPending ? (
        <Loading label="Cargando tus emprendimientos" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : ventures.length === 0 ? (
        <EmptyState
          title="Guarda aquí cada negocio o proyecto"
          action={
            <button type="button" className="btn" onClick={() => setEditing('new')}>
              <Plus size={18} aria-hidden="true" /> Crear el primero
            </button>
          }
        >
          Cada emprendimiento tiene su espacio para notas, imágenes, archivos (PDF, presentaciones, hojas de cálculo) y enlaces. Lo ves igual en la web y en el móvil.
        </EmptyState>
      ) : (
        <ul className="card-grid venture-grid" aria-label="Tus emprendimientos">
          {ventures.map((v) => {
            const items = ventureItemsOf(legacy.data?.data, v.id);
            return (
              <li key={v.id}>
                <Link to={`/emprendimientos/${v.id}`} className="card venture-card" style={{ ['--venture' as string]: v.color }}>
                  <span className="venture-card__icon" aria-hidden="true">
                    <Rocket size={20} />
                  </span>
                  <span className="venture-card__name">{v.name}</span>
                  <span className="chip small">{VENTURE_STAGE_INFO[stageOf(v)].label}</span>
                  {v.description && <span className="small muted venture-card__desc">{v.description}</span>}
                  <span className="small muted numeric">{ventureSummary(items)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo emprendimiento' : 'Editar emprendimiento'}>
        {editing && (
          <VentureForm
            venture={editing === 'new' ? null : editing}
            onDone={(id) => {
              setEditing(null);
              if (id) navigate(`/emprendimientos/${id}`);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/emprendimientos" className="back-link">
      <ArrowLeft size={16} aria-hidden="true" /> Emprendimientos
    </Link>
  );
}

function VentureForm({ venture, onDone }: { venture: LegacyVenture | null; onDone: (createdId?: string) => void }) {
  const actions = useModule('ventures');
  const legacy = useLegacyData();
  const navigate = useNavigate();
  const [name, setName] = useState(venture?.name ?? '');
  const [description, setDescription] = useState(venture?.description ?? '');
  const [stage, setStage] = useState<VentureStage>(venture ? stageOf(venture) : 'idea');
  const [color, setColor] = useState<string>(venture?.color ?? VENTURE_COLORS[0]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fields = { name: name.trim(), description, stage, color };
    if (venture) {
      actions.update(venture.id, fields);
      onDone();
    } else {
      const id = newId();
      actions.add({ id, ...fields });
      onDone(id);
    }
  };
  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required autoFocus placeholder="Cafetería, tienda en línea, app…" />
      <TextArea label="De qué trata (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} rows={3} placeholder="Qué vendes, a quién, qué te falta…" />
      <SelectField label="Etapa" value={stage} onChange={(e) => setStage(e.target.value as VentureStage)}>
        {VENTURE_STAGES.map((s) => (
          <option key={s} value={s}>
            {VENTURE_STAGE_INFO[s].label}
          </option>
        ))}
      </SelectField>
      <ColorPicker legend="Color" colors={VENTURE_COLORS} value={color} onChange={setColor} names={COLOR_NAMES} />
      <FormActions
        submitLabel={venture ? 'Guardar' : 'Crear emprendimiento'}
        disabled={!name.trim()}
        onDelete={
          venture
            ? () => {
                const refs = ventureItemsOf(legacy.data?.data, venture.id)
                  .map((i) => i.ref)
                  .filter(Boolean);
                actions.remove(venture.id);
                void deleteFiles(refs);
                onDone();
                navigate('/emprendimientos');
              }
            : undefined
        }
        confirm={venture ? `Se borrará «${venture.name}» con todas sus notas, imágenes, archivos y enlaces.` : undefined}
      />
    </form>
  );
}

// ---------- Un emprendimiento ----------

function VentureDetail({ venture: v }: { venture: LegacyVenture }) {
  const legacy = useLegacyData();
  const items = ventureItemsOf(legacy.data?.data, v.id);
  const itemActions = useModule('ventureItems');
  const [filter, setFilter] = useState<Filter>('todo');
  const [editingVenture, setEditingVenture] = useState(false);
  const [editing, setEditing] = useState<LegacyVentureItem | { kind: 'note' | 'link' } | null>(null);
  const [viewing, setViewing] = useState<LegacyVentureItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const shown = items.filter((i) => filter === 'todo' || i.kind === filter);
  const images = useFiles(items.filter((i) => i.kind === 'image' && i.ref).map((i) => i.ref));
  const imageSrc = (i: LegacyVentureItem) => images.data?.images[i.ref];

  const upload = async (e: ChangeEvent<HTMLInputElement>, kind: 'image' | 'file') => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    setError(null);
    for (const [n, f] of files.slice(0, 10).entries()) {
      if (kind === 'file' && f.size > VENTURE_FILE_MAX_BYTES) {
        setError(`«${f.name}» pesa ${formatBytes(f.size)}; el máximo es ${formatBytes(VENTURE_FILE_MAX_BYTES)}.`);
        continue;
      }
      setBusy(files.length > 1 ? `Subiendo ${n + 1} de ${files.length}…` : `Subiendo «${f.name}»…`);
      try {
        const data = kind === 'image' ? await compressImage(f, 2000, 0.82) : await readDataUrl(f);
        const ref = await uploadFile(data, 'vf');
        itemActions.add({
          id: newId(),
          ventureId: v.id,
          kind,
          title: kind === 'image' ? f.name.replace(/\.[^.]+$/, '').slice(0, 200) : f.name.slice(0, 200),
          text: '',
          url: '',
          ref,
          mime: (kind === 'image' ? 'image/jpeg' : f.type || 'application/octet-stream').slice(0, 120),
          size: f.size,
          date: utcDayKey(),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : `No se pudo subir «${f.name}».`);
      }
    }
    setBusy(null);
  };

  const remove = (i: LegacyVentureItem) => {
    itemActions.remove(i.id);
    if (i.ref) void deleteFiles([i.ref]);
  };

  return (
    <div className="page">
      <BackLink />
      <PageHeader eyebrow="Emprendimientos" title={v.name}>
        <button type="button" className="btn btn--secondary" onClick={() => setEditingVenture(true)}>
          <Pencil size={16} aria-hidden="true" /> Editar
        </button>
      </PageHeader>
      <div className="stack-lg">
        <section className="card venture-head" style={{ ['--venture' as string]: v.color }} aria-label="Resumen">
          <div className="row">
            <span className="chip">{VENTURE_STAGE_INFO[stageOf(v)].label}</span>
            <span className="small muted numeric">{ventureSummary(items)}</span>
          </div>
          {v.description ? <p className="venture-head__desc">{v.description}</p> : <p className="muted small">Sin descripción. Pulsa «Editar» para contar de qué trata.</p>}
        </section>

        <div className="venture-add" role="group" aria-label="Añadir">
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setEditing({ kind: 'note' })}>
            <NotebookPen size={16} aria-hidden="true" /> Nota
          </button>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => imageInput.current?.click()} disabled={!!busy}>
            <ImagePlus size={16} aria-hidden="true" /> Imagen
          </button>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => fileInput.current?.click()} disabled={!!busy}>
            <Paperclip size={16} aria-hidden="true" /> Archivo
          </button>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setEditing({ kind: 'link' })}>
            <Link2 size={16} aria-hidden="true" /> Enlace
          </button>
          <input ref={imageInput} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e, 'image')} aria-label="Elegir imágenes" />
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => upload(e, 'file')} aria-label="Elegir archivos" />
        </div>
        {busy && (
          <p className="small muted" role="status">
            {busy}
          </p>
        )}
        {error && (
          <div className="alert alert--danger" role="alert">
            {error}
          </div>
        )}

        {items.length > 0 && <Segmented label="Mostrar" options={FILTERS} value={filter} onChange={setFilter} />}
        {items.length === 0 ? (
          <EmptyState title="Todavía está vacío">Añade una nota con tu plan, fotos de productos o del local, archivos como presupuestos o presentaciones, y enlaces a tu tienda o redes.</EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState title={`Sin ${FILTERS.find((f) => f.value === filter)?.label.toLowerCase()}`}>Usa los botones de arriba para añadir.</EmptyState>
        ) : (
          <>
            {shown.some((i) => i.kind === 'image') && (
              <section aria-label="Imágenes">
                <ul className="venture-gallery">
                  {shown
                    .filter((i) => i.kind === 'image')
                    .map((i) => (
                      <li key={i.id}>
                        <button type="button" className="venture-thumb" onClick={() => setViewing(i)} aria-label={`Ver «${ventureItemName(i)}»`}>
                          {imageSrc(i) ? <img src={imageSrc(i)} alt="" /> : <span className="small muted">{images.isPending ? 'Cargando…' : 'No disponible'}</span>}
                        </button>
                      </li>
                    ))}
                </ul>
              </section>
            )}
            <ul className="venture-items" aria-label="Notas, archivos y enlaces">
              {shown
                .filter((i) => i.kind !== 'image')
                .map((i) => (
                  <ItemRow key={i.id} item={i} onEdit={() => setEditing(i)} />
                ))}
            </ul>
          </>
        )}
      </div>

      <Dialog open={editingVenture} onClose={() => setEditingVenture(false)} title="Editar emprendimiento">
        {editingVenture && <VentureForm venture={v} onDone={() => setEditingVenture(false)} />}
      </Dialog>
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={itemDialogTitle(editing)}>
        {editing && (
          <ItemForm
            ventureId={v.id}
            item={'id' in editing ? editing : null}
            kind={editing.kind as VentureItemKind}
            onDone={() => setEditing(null)}
            onDelete={(i) => {
              remove(i);
              setEditing(null);
            }}
          />
        )}
      </Dialog>
      <Dialog open={viewing !== null} onClose={() => setViewing(null)} title={viewing ? ventureItemName(viewing) : 'Imagen'}>
        {viewing && (
          <ImageView
            item={viewing}
            src={imageSrc(viewing)}
            onEdit={() => {
              setEditing(viewing);
              setViewing(null);
            }}
            onDelete={() => {
              remove(viewing);
              setViewing(null);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

const itemDialogTitle = (e: LegacyVentureItem | { kind: string } | null) => {
  if (!e) return '';
  const isNew = !('id' in e);
  const noun = e.kind === 'note' ? 'nota' : e.kind === 'link' ? 'enlace' : e.kind === 'image' ? 'imagen' : 'archivo';
  return `${isNew ? 'Nueva' : 'Editar'} ${noun}`.replace('Nueva enlace', 'Nuevo enlace').replace('Nueva archivo', 'Nuevo archivo');
};

function ItemRow({ item: i, onEdit }: { item: LegacyVentureItem; onEdit: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    setDownloading(true);
    try {
      const r = await api.legacy.images([i.ref]);
      const data = r.images[i.ref];
      if (data) saveDataUrl(data, i.title || 'archivo');
    } finally {
      setDownloading(false);
    }
  };
  const name = ventureItemName(i);
  return (
    <li className={`card venture-item venture-item--${i.kind}`}>
      <div className="venture-item__head">
        {i.kind === 'note' ? <NotebookPen size={18} aria-hidden="true" /> : i.kind === 'link' ? <Link2 size={18} aria-hidden="true" /> : <FileText size={18} aria-hidden="true" />}
        {i.kind === 'link' ? (
          <a href={i.url} target="_blank" rel="noopener noreferrer" className="venture-item__title">
            {name}
            <ExternalLink size={14} aria-hidden="true" />
            <span className="visually-hidden"> (se abre en otra pestaña)</span>
          </a>
        ) : (
          <h2 className="venture-item__title">{name}</h2>
        )}
        {i.kind === 'file' && <span className="small muted numeric">{formatBytes(i.size)}</span>}
        <span className="venture-item__actions">
          {i.kind === 'file' && i.ref && (
            <button type="button" className="icon-btn" onClick={download} disabled={downloading} aria-label={`Descargar «${name}»`}>
              <Download size={18} aria-hidden="true" />
            </button>
          )}
          <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Editar «${name}»`}>
            <Pencil size={18} aria-hidden="true" />
          </button>
        </span>
      </div>
      {i.text && (i.kind === 'note' ? <Markdown text={i.text} headingBase={3} /> : <p className="small muted">{i.text}</p>)}
    </li>
  );
}

function ImageView({ item, src, onEdit, onDelete }: { item: LegacyVentureItem; src: string | undefined; onEdit: () => void; onDelete: () => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <div className="stack">
      {src ? <img src={src} alt={ventureItemName(item)} className="venture-full" /> : <p className="muted">La imagen no está disponible.</p>}
      {item.text && <p>{item.text}</p>}
      {asking ? (
        <ConfirmDelete onConfirm={onDelete} onCancel={() => setAsking(false)}>
          Se borrará esta imagen.
        </ConfirmDelete>
      ) : (
        <div className="form-actions">
          <button type="button" className="btn btn--ghost danger-text" onClick={() => setAsking(true)}>
            <Trash2 size={16} aria-hidden="true" /> Borrar
          </button>
          {src && (
            <button type="button" className="btn btn--secondary" onClick={() => saveDataUrl(src, `${item.title || 'imagen'}.jpg`)}>
              <Download size={16} aria-hidden="true" /> Descargar
            </button>
          )}
          <button type="button" className="btn" onClick={onEdit}>
            <Pencil size={16} aria-hidden="true" /> Editar
          </button>
        </div>
      )}
    </div>
  );
}

function ItemForm({ ventureId, item, kind, onDone, onDelete }: { ventureId: string; item: LegacyVentureItem | null; kind: VentureItemKind; onDone: () => void; onDelete: (i: LegacyVentureItem) => void }) {
  const actions = useModule('ventureItems');
  const [title, setTitle] = useState(item?.title ?? '');
  const [text, setText] = useState(item?.text ?? '');
  const [url, setUrl] = useState(item?.url ?? '');
  const link = /^https?:\/\//i.test(url.trim()) || !url.trim() ? url.trim() : `https://${url.trim()}`;
  const badUrl = kind === 'link' && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(link);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fields = { title: title.trim(), text, ...(kind === 'link' ? { url: link } : {}) };
    if (item) actions.update(item.id, fields);
    else actions.add({ id: newId(), ventureId, kind, url: '', ref: '', mime: '', size: 0, date: utcDayKey(), ...fields });
    onDone();
  };
  const noun = kind === 'note' ? 'la nota' : kind === 'link' ? 'el enlace' : kind === 'image' ? 'la imagen' : 'el archivo';
  return (
    <form className="stack" onSubmit={submit}>
      {kind === 'link' && (
        <TextField
          label="Enlace"
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => setUrl(link)}
          maxLength={2000}
          required
          autoFocus
          placeholder="https://tu-tienda.com"
          error={url.trim() && badUrl ? 'Pega un enlace completo, por ejemplo https://instagram.com/tu-marca' : null}
        />
      )}
      <TextField label={kind === 'note' ? 'Título' : 'Nombre (opcional)'} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus={kind === 'note'} placeholder={kind === 'note' ? 'Plan de lanzamiento' : ''} />
      <TextArea
        label={kind === 'note' ? 'Texto' : 'Descripción (opcional)'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={100_000}
        rows={kind === 'note' ? 10 : 3}
        hint={kind === 'note' ? 'Admite Markdown: **negrita**, listas con «-» y títulos con «#».' : undefined}
      />
      <FormActions
        submitLabel={item ? 'Guardar' : kind === 'note' ? 'Guardar nota' : 'Guardar enlace'}
        disabled={kind === 'note' ? !title.trim() && !text.trim() : kind === 'link' ? badUrl : false}
        onDelete={item ? () => onDelete(item) : undefined}
        confirm={item ? `Se borrará ${noun}.` : undefined}
      />
    </form>
  );
}
