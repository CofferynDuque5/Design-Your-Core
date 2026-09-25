import { CARE_KIND_INFO, CARE_KINDS, daysLabel, nextDue, PET_SPECIES, PET_SPECIES_INFO, utcDayKey, type CareKind, type LegacyPet, type LegacyPetCare, type PetSpecies } from '@dyc/core';
import { Pencil, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { newId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { SelectField, TextField } from '../components/Form';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { FormActions, Stats, WeekdayPicker } from '../components/ToolParts';
import { plural } from '../lib/format';
import { useNow } from '../lib/tools';

const WEEKDAY_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
/** Valores desconocidos se muestran como los de por defecto, sin cambiar el dato. */
const speciesOf = (p: LegacyPet): PetSpecies => (PET_SPECIES.includes(p.species) ? p.species : 'other');
const kindOf = (c: LegacyPetCare): CareKind => (CARE_KINDS.includes(c.kind) ? c.kind : 'otro');
const validDays = (d: unknown) => (typeof d === 'string' && /^[1-7]{1,7}$/.test(d) ? d : '1234567');

/** "Hoy a las 08:00 · pendiente", "Mañana a las 18:00", "El jueves". */
function dueLabel(care: LegacyPetCare, now: Date): string {
  const due = nextDue(care, now);
  if (!due) return 'Aviso desactivado';
  const at = due.time ? ` a las ${due.time}` : '';
  if (due.inDays === 0) return `Hoy${at}${due.late ? ' · pendiente' : ''}`;
  if (due.inDays === 1) return `Mañana${at}`;
  // Si solo toca un día a la semana, «Los sábados» ya dice cuándo es el próximo.
  if (validDays(care.days).length === 1) return `${daysLabel(validDays(care.days))}${at}`;
  const iso = ((now.getDay() === 0 ? 7 : now.getDay()) - 1 + due.inDays) % 7;
  return `El ${WEEKDAY_LONG[iso]}${at}`;
}

function careWhen(care: LegacyPetCare, done: boolean, now: Date): string {
  const days = daysLabel(validDays(care.days));
  if (done) return `Hecho hoy · ${days}`;
  const due = dueLabel(care, now);
  return due.startsWith(days) ? due : `${due} · ${days}`;
}

export function Pets() {
  const legacy = useLegacyData();
  const pets = useLegacyList(legacy.data?.data, 'pets');
  const cares = useLegacyList(legacy.data?.data, 'petCares');
  const now = useNow();
  const today = utcDayKey(now);
  const [editing, setEditing] = useState<LegacyPet | 'new' | null>(null);
  const [care, setCare] = useState<{ pet: LegacyPet; care: LegacyPetCare | null } | null>(null);
  const known = new Set(pets.map((p) => p.id));
  const ownCares = cares.filter((c) => known.has(c.petId));
  const doneToday = ownCares.filter((c) => c.lastDone === today).length;
  const pendingToday = ownCares.filter((c) => nextDue(c, now)?.inDays === 0).length;

  return (
    <div className="page">
      <PageHeader eyebrow="Vida personal" title="Mascotas">
        <button type="button" className="btn" onClick={() => setEditing('new')} disabled={!legacy.data}>
          <Plus size={18} aria-hidden="true" /> Nueva mascota
        </button>
      </PageHeader>
      {legacy.isPending ? (
        <Loading label="Cargando tus mascotas" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : pets.length === 0 ? (
        <EmptyState
          title="Aún no tienes mascotas"
          action={
            <button type="button" className="btn btn--secondary" onClick={() => setEditing('new')}>
              <Plus size={18} aria-hidden="true" /> Añadir mascota
            </button>
          }
        >
          Añade a tus mascotas y sus cuidados (comida, agua, paseos, veterinario) para saber qué toca cada día.
        </EmptyState>
      ) : (
        <div className="stack-lg">
          <Stats
            items={[
              { value: pets.length, label: pets.length === 1 ? 'Mascota' : 'Mascotas' },
              { value: pendingToday, label: 'Cuidados por hacer hoy' },
              { value: doneToday, label: doneToday === 1 ? 'Hecho hoy' : 'Hechos hoy' },
            ]}
          />
          <ul className="card-grid tool-grid tool-grid--wide" aria-label="Mascotas">
            {pets.map((p) => (
              <li key={p.id}>
                <PetCard pet={p} cares={cares.filter((c) => c.petId === p.id)} today={today} now={now} onEdit={() => setEditing(p)} onCare={(c) => setCare({ pet: p, care: c })} />
              </li>
            ))}
          </ul>
          <p className="muted small">Los avisos con sonido de la app anterior todavía no están en la app nueva: aquí ves cuándo toca cada cuidado y lo marcas al hacerlo.</p>
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nueva mascota' : 'Editar mascota'}>
        {editing !== null && <PetForm pet={editing === 'new' ? null : editing} cares={editing === 'new' ? 0 : cares.filter((c) => c.petId === editing.id).length} onDone={() => setEditing(null)} />}
      </Dialog>
      <Dialog open={care !== null} onClose={() => setCare(null)} title={care?.care ? 'Editar cuidado' : `Nuevo cuidado${care ? ` de ${care.pet.name}` : ''}`}>
        {care !== null && <CareForm pet={care.pet} care={care.care} onDone={() => setCare(null)} />}
      </Dialog>
    </div>
  );
}

function PetCard({ pet: p, cares, today, now, onEdit, onCare }: { pet: LegacyPet; cares: LegacyPetCare[]; today: string; now: Date; onEdit: () => void; onCare: (c: LegacyPetCare | null) => void }) {
  const actions = useModule('petCares');
  const species = PET_SPECIES_INFO[speciesOf(p)];
  const name = p.name || 'Sin nombre';
  const titleId = `pet-${p.id}`;
  const sorted = [...cares].sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  return (
    <article className="card tool-card pet-card" style={{ ['--c' as string]: '#E8912A' }} aria-labelledby={titleId}>
      <div className="tool-card__head">
        <div className="pet-card__who">
          <span className="pet-card__avatar emoji" aria-hidden="true">
            {species.emoji}
          </span>
          <div>
            <h2 id={titleId} className="tool-card__title">
              {name}
            </h2>
            <p className="muted small">
              {species.label}
              {p.note ? ` · ${p.note}` : ''}
            </p>
          </div>
        </div>
        <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Editar a ${name}`}>
          <Pencil size={18} aria-hidden="true" />
        </button>
      </div>
      {sorted.length === 0 ? (
        <p className="muted small">Sin cuidados todavía.</p>
      ) : (
        <ul className="care-list" aria-label={`Cuidados de ${name}`}>
          {sorted.map((c) => {
            const kind = CARE_KIND_INFO[kindOf(c)];
            const title = c.title || kind.label;
            const done = c.lastDone === today;
            const off = c.enabled === false;
            return (
              <li key={c.id} className={`care-row${done ? ' care-row--done' : ''}${off ? ' care-row--off' : ''}`}>
                <input className="care-row__check" type="checkbox" checked={done} onChange={() => actions.update(c.id, { lastDone: done ? '' : today })} aria-label={`Hecho hoy: «${title}» de ${name}`} />
                <span className="care-row__emoji emoji" aria-hidden="true">
                  {kind.emoji}
                </span>
                <span className="care-row__text">
                  <strong>{title}</strong>
                  <span className="muted small">
                    {careWhen(c, done, now)}
                  </span>
                </span>
                <label className="switch">
                  <input type="checkbox" role="switch" checked={!off} onChange={() => actions.update(c.id, { enabled: off })} />
                  <span aria-hidden="true" />
                  <span className="visually-hidden">
                    Aviso activo: «{title}» de {name}
                  </span>
                </label>
                <button type="button" className="icon-btn" onClick={() => onCare(c)} aria-label={`Editar «${title}» de ${name}`}>
                  <Pencil size={16} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div>
        <button type="button" className="btn btn--ghost btn--sm disclosure" onClick={() => onCare(null)}>
          <Plus size={16} aria-hidden="true" /> Añadir cuidado
          <span className="visually-hidden"> para {name}</span>
        </button>
      </div>
    </article>
  );
}

function PetForm({ pet, cares, onDone }: { pet: LegacyPet | null; cares: number; onDone: () => void }) {
  const actions = useModule('pets');
  const [name, setName] = useState(pet?.name ?? '');
  const [species, setSpecies] = useState<PetSpecies>(pet ? speciesOf(pet) : 'dog');
  const [note, setNote] = useState(pet?.note ?? '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const fields = { name: name.trim(), species, note: note.trim() };
    if (pet) actions.update(pet.id, fields);
    else actions.add({ id: newId(), ...fields });
    onDone();
  };
  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus placeholder="Luna" />
      <SelectField label="Especie" value={species} onChange={(e) => setSpecies(e.target.value as PetSpecies)}>
        {PET_SPECIES.map((s) => (
          <option key={s} value={s}>
            {PET_SPECIES_INFO[s].emoji} {PET_SPECIES_INFO[s].label}
          </option>
        ))}
      </SelectField>
      <TextField label="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Raza, edad…" />
      <FormActions
        submitLabel={pet ? 'Guardar' : 'Añadir mascota'}
        disabled={!name.trim()}
        onDelete={
          pet
            ? () => {
                actions.remove(pet.id);
                onDone();
              }
            : undefined
        }
        confirm={`Se borrará a ${pet?.name || 'esta mascota'}${cares ? ` con ${plural(cares, 'cuidado', 'cuidados')}` : ''}.`}
      />
    </form>
  );
}

function CareForm({ pet, care, onDone }: { pet: LegacyPet; care: LegacyPetCare | null; onDone: () => void }) {
  const actions = useModule('petCares');
  const [kind, setKind] = useState<CareKind>(care ? kindOf(care) : 'comida');
  const [title, setTitle] = useState(care?.title ?? '');
  const [time, setTime] = useState(care?.time ?? '');
  const [days, setDays] = useState(validDays(care?.days));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    // Sin título, el cuidado se llama como su tipo.
    const fields = { kind, title: title.trim() || CARE_KIND_INFO[kind].label, time, days };
    if (care) actions.update(care.id, fields);
    else actions.add({ id: newId(), petId: pet.id, ...fields, sound: true, enabled: true, lastDone: '' });
    onDone();
  };
  return (
    <form className="stack" onSubmit={submit}>
      <SelectField label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as CareKind)}>
        {CARE_KINDS.map((k) => (
          <option key={k} value={k}>
            {CARE_KIND_INFO[k].emoji} {CARE_KIND_INFO[k].label}
          </option>
        ))}
      </SelectField>
      <div className="grid-2">
        <TextField label="Qué hay que hacer" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus placeholder={kind === 'comida' ? 'Darle de comer' : CARE_KIND_INFO[kind].label} />
        <TextField label="Hora (opcional)" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <WeekdayPicker legend="Días" value={days} onChange={setDays} />
      <FormActions
        submitLabel={care ? 'Guardar' : 'Añadir cuidado'}
        onDelete={
          care
            ? () => {
                actions.remove(care.id);
                onDone();
              }
            : undefined
        }
        confirm={`Se borrará «${care?.title || 'este cuidado'}».`}
      />
    </form>
  );
}
