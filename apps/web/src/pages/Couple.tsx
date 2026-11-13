import {
  COUPLE_KIND_LABEL,
  COUPLE_PHOTO_MAX,
  COUPLE_VENTURE_STAGES,
  COUPLE_VENTURE_STAGE_LABEL,
  coupleProgress,
  type CoupleData,
  type CoupleItem,
  type CoupleKind,
  type CoupleVentureStage,
} from '@dyc/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, HeartHandshake, Images, Plus, Store, Target, Trash2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../app/api';
import { newId } from '../app/legacy';
import { useToast } from '../app/toast';
import { compressImage } from '../app/images';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { Segmented, TextArea, TextField } from '../components/Form';
import { ChipChoice } from '../components/OptionPicker';
import { EmptyState, ErrorState, errorMessage, Loading } from '../components/States';
import { FormActions } from '../components/ToolParts';

const KEY = ['couple'] as const;
type Item<K extends CoupleKind> = CoupleItem<K>;

/**
 * Espacio en pareja: lo que comparten las dos personas vinculadas. Una
 * galería de fotos, metas en común y los emprendimientos que hacen juntas.
 * Las dos ven y cambian lo mismo.
 */
export function Couple() {
  const space = useQuery({ queryKey: KEY, queryFn: api.couple.get });
  const [tab, setTab] = useState<CoupleKind>('foto');
  const items = space.data?.items ?? [];
  const of = <K extends CoupleKind>(k: K) => items.filter((i): i is Item<K> => i.kind === k);
  const partner = space.data?.partner;

  return (
    <div className="page">
      <PageHeader eyebrow="Vida personal" title="En pareja" />
      {space.isPending ? (
        <Loading label="Cargando lo que comparten" />
      ) : space.isError ? (
        <ErrorState error={space.error} retry={() => space.refetch()} />
      ) : !partner ? (
        <EmptyState
          title="Vincúlate con tu pareja"
          action={
            <Link className="btn" to="/perfil">
              Ir a Perfil para vincularse
            </Link>
          }
        >
          Cuando se vinculen, aquí tendrán una galería de fotos, metas y emprendimientos que los dos pueden ver y cambiar.
        </EmptyState>
      ) : (
        <div className="stack-lg">
          <div className="couple-head card">
            <span className="couple-head__icon" aria-hidden="true">
              <HeartHandshake size={26} />
            </span>
            <div>
              <p className="couple-head__title">Tú y {partner.name}</p>
              <p className="small muted">Lo que agreguen aquí lo ven los dos al momento.</p>
            </div>
          </div>
          <Segmented<CoupleKind>
            label="Sección"
            value={tab}
            onChange={setTab}
            options={(['foto', 'meta', 'emprendimiento'] as const).map((k) => ({ value: k, label: `${COUPLE_KIND_LABEL[k]}\u00a0${of(k).length}` }))}
          />
          {tab === 'foto' && <Gallery photos={of('foto')} partner={partner.name} />}
          {tab === 'meta' && <Goals goals={of('meta')} partner={partner.name} />}
          {tab === 'emprendimiento' && <Ventures ventures={of('emprendimiento')} partner={partner.name} />}
        </div>
      )}
    </div>
  );
}

/** Cambios en lo compartido, con la lista al día y el error a la vista. */
function useCouple() {
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });
  const onError = (e: unknown) => toast(errorMessage(e), { tone: 'error' });
  const add = useMutation({ mutationFn: api.couple.add, onSuccess: refresh, onError });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => api.couple.update(id, data),
    onMutate: ({ id, data }) => {
      qc.setQueryData<{ partner: unknown; items: CoupleItem[] }>(KEY, (prev) => prev && { ...prev, items: prev.items.map((i) => (i.id === id ? ({ ...i, data: { ...i.data, ...data } } as CoupleItem) : i)) });
    },
    onSettled: refresh,
    onError,
  });
  const remove = useMutation({ mutationFn: api.couple.remove, onSuccess: refresh, onError });
  return { add, update, remove };
}

const by = (i: CoupleItem, partner: string) => (i.byMe ? 'Lo agregaste tú' : `Lo agregó ${partner}`);

// ---- Fotos ----

function Gallery({ photos, partner }: { photos: Item<'foto'>[]; partner: string }) {
  const { add } = useCouple();
  const toast = useToast();
  const fileId = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const shown = photos.find((p) => p.id === open) ?? null;

  const upload = async (files: FileList | null) => {
    const list = [...(files ?? [])].slice(0, 20);
    for (const [i, file] of list.entries()) {
      setBusy(list.length > 1 ? `Subiendo ${i + 1} de ${list.length}…` : 'Subiendo…');
      try {
        const image = await compressImage(file, 1600, 0.78);
        if (image.length > COUPLE_PHOTO_MAX) throw new Error('La foto es demasiado grande incluso reducida.');
        const thumb = await compressImage(file, 420, 0.72);
        const taken = file.lastModified ? new Date(file.lastModified).toISOString().slice(0, 10) : '';
        await add.mutateAsync({ kind: 'foto', data: { caption: '', takenOn: taken }, image, thumb });
      } catch (e) {
        toast(e instanceof Error ? e.message : 'No se pudo subir la foto.', { tone: 'error' });
      }
    }
    setBusy(null);
  };

  return (
    <section className="stack couple-section" aria-labelledby="fotos-title">
      <div className="section-head">
        <h2 id="fotos-title" className="section-title">
          <Images size={18} aria-hidden="true" className="inline-icon" /> Galería
        </h2>
        <label htmlFor={fileId} className={`btn btn--sm${busy ? ' is-disabled' : ''}`}>
          <Camera size={16} aria-hidden="true" /> {busy ?? 'Subir fotos'}
        </label>
        <input
          id={fileId}
          type="file"
          accept="image/*"
          multiple
          className="visually-hidden"
          disabled={!!busy}
          onChange={(e) => {
            void upload(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {photos.length === 0 ? (
        <EmptyState title="Su primera foto juntos">Sube fotos de sus salidas, viajes y momentos. Las ven los dos.</EmptyState>
      ) : (
        <ul className="couple-gallery" aria-label="Fotos de los dos">
          {photos.map((p) => (
            <li key={p.id}>
              <button type="button" className="couple-gallery__item" onClick={() => setOpen(p.id)} aria-label={`Ver la foto${p.data.caption ? ` «${p.data.caption}»` : ''}`}>
                {p.thumb ? <img src={p.thumb} alt="" loading="lazy" /> : null}
                {p.data.caption && <span className="couple-gallery__caption">{p.data.caption}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!shown} onClose={() => setOpen(null)} title={shown?.data.caption || 'Foto'} wide>
        {shown && <PhotoView photo={shown} partner={partner} onDone={() => setOpen(null)} />}
      </Dialog>
    </section>
  );
}

function PhotoView({ photo, partner, onDone }: { photo: Item<'foto'>; partner: string; onDone: () => void }) {
  const full = useQuery({ queryKey: ['couple-image', photo.id], queryFn: () => api.couple.image(photo.id), staleTime: Infinity });
  const { update, remove } = useCouple();
  const [caption, setCaption] = useState(photo.data.caption);
  const [takenOn, setTakenOn] = useState(photo.data.takenOn);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    update.mutate({ id: photo.id, data: { caption: caption.trim(), takenOn } });
    onDone();
  };
  return (
    <form className="stack" onSubmit={submit}>
      <img className="couple-photo" src={full.data ?? photo.thumb} alt={photo.data.caption || 'Foto de los dos'} />
      <p className="small muted">{by(photo, partner)}</p>
      <div className="grid-2">
        <TextField label="Descripción (opcional)" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={300} placeholder="Nuestro viaje a la playa" />
        <TextField label="Fecha (opcional)" type="date" value={takenOn} onChange={(e) => setTakenOn(e.target.value)} />
      </div>
      <FormActions
        submitLabel="Guardar"
        onDelete={() => {
          remove.mutate(photo.id);
          onDone();
        }}
        confirm="Se borrará la foto para los dos."
      />
    </form>
  );
}

// ---- Listas con pasos (metas y emprendimientos) ----

function Steps({ list, onChange, label, placeholder }: { list: Array<{ id: string; name: string; done: boolean }>; onChange: (next: Array<{ id: string; name: string; done: boolean }>) => void; label: string; placeholder: string }) {
  const [name, setName] = useState('');
  const add = () => {
    if (!name.trim()) return;
    onChange([...list, { id: newId(), name: name.trim(), done: false }]);
    setName('');
  };
  return (
    <div className="stack-sm">
      {list.length > 0 && (
        <ul className="couple-steps" aria-label={label}>
          {list.map((t) => (
            <li key={t.id} className={`check-row${t.done ? ' is-done' : ''}`}>
              <label className="check-row__label">
                <input type="checkbox" checked={t.done} onChange={() => onChange(list.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))} />
                <span>{t.name}</span>
              </label>
              <button type="button" className="icon-btn" onClick={() => onChange(list.filter((x) => x.id !== t.id))} aria-label={`Quitar «${t.name}»`}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="couple-steps__add">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          maxLength={200}
          placeholder={placeholder}
          aria-label={`Nuevo paso: ${label}`}
        />
        <button type="button" className="btn btn--secondary btn--sm" onClick={add} disabled={!name.trim()}>
          <Plus size={16} aria-hidden="true" /> Añadir
        </button>
      </div>
    </div>
  );
}

function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div className="couple-progress">
      <div className="couple-progress__bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <span style={{ width: `${value}%` }} />
      </div>
      <span className="small muted numeric">{value}%</span>
    </div>
  );
}

// ---- Metas ----

function Goals({ goals, partner }: { goals: Item<'meta'>[]; partner: string }) {
  const { update } = useCouple();
  const [editing, setEditing] = useState<Item<'meta'> | 'new' | null>(null);
  const sorted = [...goals].sort((a, b) => Number(a.data.done) - Number(b.data.done));
  return (
    <section className="stack couple-section" aria-labelledby="metas-title">
      <div className="section-head">
        <h2 id="metas-title" className="section-title">
          <Target size={18} aria-hidden="true" className="inline-icon" /> Metas juntos
        </h2>
        <button type="button" className="btn btn--sm" onClick={() => setEditing('new')}>
          <Plus size={16} aria-hidden="true" /> Nueva meta
        </button>
      </div>
      {goals.length === 0 ? (
        <EmptyState title="Su primera meta en común">Un viaje, ahorrar para algo, mudarse, aprender juntos… divídanla en pasos y avancen los dos.</EmptyState>
      ) : (
        <div className="card-grid">
          {sorted.map((g) => (
            <article key={g.id} className={`card stack-sm couple-card${g.data.done ? ' is-done' : ''}`} aria-labelledby={`g-${g.id}`}>
              <div className="couple-card__head">
                <h3 id={`g-${g.id}`} className="couple-card__title">
                  {g.data.title}
                </h3>
                <button type="button" className={`chip-btn${g.data.done ? ' is-on' : ''}`} aria-pressed={g.data.done} onClick={() => update.mutate({ id: g.id, data: { done: !g.data.done } })}>
                  <Check size={14} aria-hidden="true" /> {g.data.done ? 'Cumplida' : 'Marcar cumplida'}
                </button>
              </div>
              {g.data.note && <p className="small">{g.data.note}</p>}
              <p className="small muted">
                {g.data.deadline ? `Para el ${new Date(`${g.data.deadline}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })} · ` : ''}
                {by(g, partner)}
              </p>
              <Progress value={coupleProgress(g.data.steps, g.data.done)} label={`Avance de «${g.data.title}»`} />
              <Steps list={g.data.steps} label={`Pasos de «${g.data.title}»`} placeholder="Siguiente paso…" onChange={(steps) => update.mutate({ id: g.id, data: { steps } })} />
              <button type="button" className="btn btn--ghost btn--sm couple-card__edit" onClick={() => setEditing(g)}>
                Editar meta
              </button>
            </article>
          ))}
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nueva meta en pareja' : 'Editar meta'}>
        {editing && <GoalForm goal={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </section>
  );
}

function GoalForm({ goal, onDone }: { goal: Item<'meta'> | null; onDone: () => void }) {
  const { add, update, remove } = useCouple();
  const [title, setTitle] = useState(goal?.data.title ?? '');
  const [note, setNote] = useState(goal?.data.note ?? '');
  const [deadline, setDeadline] = useState(goal?.data.deadline ?? '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const data: Partial<CoupleData['meta']> = { title: title.trim(), note: note.trim(), deadline };
    if (goal) update.mutate({ id: goal.id, data });
    else add.mutate({ kind: 'meta', data: { ...data, title: title.trim(), done: false, steps: [] } as CoupleData['meta'] });
    onDone();
  };
  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="Meta" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required autoFocus placeholder="Viajar a Mérida en diciembre" />
      <TextArea label="Detalles (opcional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} placeholder="Cuánto ahorrar, qué necesitamos…" />
      <TextField label="Fecha límite (opcional)" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      <FormActions
        submitLabel={goal ? 'Guardar' : 'Añadir meta'}
        disabled={!title.trim()}
        onDelete={
          goal
            ? () => {
                remove.mutate(goal.id);
                onDone();
              }
            : undefined
        }
        confirm={goal ? `Se borrará «${goal.data.title}» para los dos.` : undefined}
      />
    </form>
  );
}

// ---- Emprendimientos ----

function Ventures({ ventures, partner }: { ventures: Item<'emprendimiento'>[]; partner: string }) {
  const { update } = useCouple();
  const [editing, setEditing] = useState<Item<'emprendimiento'> | 'new' | null>(null);
  return (
    <section className="stack couple-section" aria-labelledby="emp-title">
      <div className="section-head">
        <h2 id="emp-title" className="section-title">
          <Store size={18} aria-hidden="true" className="inline-icon" /> Emprendimientos juntos
        </h2>
        <button type="button" className="btn btn--sm" onClick={() => setEditing('new')}>
          <Plus size={16} aria-hidden="true" /> Nuevo emprendimiento
        </button>
      </div>
      {ventures.length === 0 ? (
        <EmptyState title="Un negocio entre los dos">Anoten la idea, en qué etapa va y las tareas de cada uno. Los dos ven el avance.</EmptyState>
      ) : (
        <div className="card-grid">
          {ventures.map((v) => (
            <article key={v.id} className="card stack-sm couple-card" aria-labelledby={`v-${v.id}`}>
              <div className="couple-card__head">
                <h3 id={`v-${v.id}`} className="couple-card__title">
                  {v.data.name}
                </h3>
                <span className="chip">{COUPLE_VENTURE_STAGE_LABEL[v.data.stage]}</span>
              </div>
              {v.data.description && <p className="small couple-card__desc">{v.data.description}</p>}
              <p className="small muted">{by(v, partner)}</p>
              <Progress value={coupleProgress(v.data.tasks)} label={`Avance de «${v.data.name}»`} />
              <Steps list={v.data.tasks} label={`Tareas de «${v.data.name}»`} placeholder="Nueva tarea: logo, precios, primera venta…" onChange={(tasks) => update.mutate({ id: v.id, data: { tasks } })} />
              <button type="button" className="btn btn--ghost btn--sm couple-card__edit" onClick={() => setEditing(v)}>
                Editar emprendimiento
              </button>
            </article>
          ))}
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo emprendimiento en pareja' : 'Editar emprendimiento'}>
        {editing && <VentureForm venture={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </section>
  );
}

function VentureForm({ venture, onDone }: { venture: Item<'emprendimiento'> | null; onDone: () => void }) {
  const { add, update, remove } = useCouple();
  const [name, setName] = useState(venture?.data.name ?? '');
  const [description, setDescription] = useState(venture?.data.description ?? '');
  const [stage, setStage] = useState<CoupleVentureStage>(venture?.data.stage ?? 'idea');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const data = { name: name.trim(), description: description.trim(), stage };
    if (venture) update.mutate({ id: venture.id, data });
    else add.mutate({ kind: 'emprendimiento', data: { ...data, tasks: [] } });
    onDone();
  };
  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required autoFocus placeholder="Velas artesanales" />
      <TextArea label="De qué se trata (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} rows={4} placeholder="Qué venden, a quién, cómo se reparten el trabajo…" />
      <ChipChoice<CoupleVentureStage> label="Etapa" value={stage} onChange={(v) => setStage(v as CoupleVentureStage)} options={COUPLE_VENTURE_STAGES.map((s) => ({ value: s, label: COUPLE_VENTURE_STAGE_LABEL[s] }))} />
      <FormActions
        submitLabel={venture ? 'Guardar' : 'Añadir emprendimiento'}
        disabled={!name.trim()}
        onDelete={
          venture
            ? () => {
                remove.mutate(venture.id);
                onDone();
              }
            : undefined
        }
        confirm={venture ? `Se borrará «${venture.data.name}» para los dos.` : undefined}
      />
    </form>
  );
}
