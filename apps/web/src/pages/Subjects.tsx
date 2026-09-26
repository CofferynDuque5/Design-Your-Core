import { byWeekday, CLASS_DAYS, checkItems, checkItemsPayload, COLOR_NAMES, donePercent, legacyList, SUBJECT_COLORS, type LegacyCheckItem, type LegacyClass, type LegacySubject } from '@dyc/core';
import { CalendarPlus, ChevronDown, Clock, MapPin, Pencil, Plus, User } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { newId, newSubId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { useToast } from '../app/toast';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { ColorPicker, TextField } from '../components/Form';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { CheckList, FormActions, Meter, paletteWith, safeColor, Stats } from '../components/ToolParts';
import { plural } from '../lib/format';

type Subject = LegacySubject & { topics: LegacyCheckItem[] };

export function Subjects() {
  const legacy = useLegacyData();
  const raw = useLegacyList(legacy.data?.data, 'subjects');
  const classes = useLegacyList(legacy.data?.data, 'classes');
  // Temas con la defensa de la app anterior (lista, id y done garantizados).
  const subjects = useMemo<Subject[]>(() => raw.map((s) => ({ ...s, topics: checkItems(s.topics, newSubId) })), [raw]);
  const [editing, setEditing] = useState<Subject | 'new' | null>(null);

  const topics = subjects.flatMap((s) => s.topics);
  const linked = classes.filter((c) => subjects.some((s) => s.id === c.subject));

  return (
    <div className="page">
      <PageHeader eyebrow="Herramientas" title="Materias">
        <button type="button" className="btn" onClick={() => setEditing('new')} disabled={!legacy.data}>
          <Plus size={18} aria-hidden="true" /> Nueva materia
        </button>
      </PageHeader>
      {legacy.isPending ? (
        <Loading label="Cargando tus materias" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : subjects.length === 0 ? (
        <EmptyState title="Aún no tienes materias">Añade tus asignaturas con su profesor y aula, divide cada una en temas y lleva la cuenta de tu avance.</EmptyState>
      ) : (
        <div className="stack-lg">
          <Stats
            items={[
              { value: subjects.length, label: subjects.length === 1 ? 'Materia' : 'Materias' },
              { value: `${topics.filter((t) => t.done).length}/${topics.length}`, label: 'Temas vistos' },
              { value: linked.length, label: linked.length === 1 ? 'Clase a la semana' : 'Clases a la semana' },
            ]}
          />
          <ul className="card-grid tool-grid">
            {subjects.map((s) => (
              <li key={s.id}>
                <SubjectCard subject={s} classes={classes.filter((c) => c.subject === s.id)} onEdit={() => setEditing(s)} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nueva materia' : 'Editar materia'}>
        {editing !== null && <SubjectForm subject={editing === 'new' ? null : editing} count={subjects.length} data={legacy.data?.data} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

const byWeek = byWeekday;

function SubjectCard({ subject: s, classes, onEdit }: { subject: Subject; classes: LegacyClass[]; onEdit: () => void }) {
  const subjects = useModule('subjects');
  const classActions = useModule('classes');
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const color = safeColor(s.color, SUBJECT_COLORS[0]);
  const name = s.name || 'Sin nombre';
  const done = s.topics.filter((t) => t.done).length;
  const pct = donePercent(s.topics);
  const panelId = `topics-${s.id}`;
  const titleId = `subject-${s.id}`;

  // Como el botón «Horario» de la app anterior: una clase el lunes de 8:00 a 9:30 con los datos de la materia.
  const addClass = () => {
    classActions.add({ id: newId(), day: 1, start: '08:00', end: '09:30', title: name.slice(0, 120), room: (s.room ?? '').trim().slice(0, 60), color, subject: s.id });
    toast(`Clase de ${name} añadida al Horario el lunes de 8:00 a 9:30. Ajústala allí.`, { action: { label: 'Ver horario', run: () => navigate('/horario') } });
  };

  return (
    <article className="card tool-card" style={{ ['--c' as string]: color }} aria-labelledby={titleId}>
      <div className="tool-card__head">
        <h2 id={titleId} className="tool-card__title">
          {name}
        </h2>
        <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Editar «${name}»`}>
          <Pencil size={18} aria-hidden="true" />
        </button>
      </div>
      {(s.teacher || s.room || s.nextClass) && (
        <ul className="meta-list">
          {s.teacher && (
            <li>
              <User size={15} aria-hidden="true" />
              <span className="visually-hidden">Profesor: </span>
              {s.teacher}
            </li>
          )}
          {s.room && (
            <li>
              <MapPin size={15} aria-hidden="true" />
              <span className="visually-hidden">Aula: </span>
              {s.room}
            </li>
          )}
          {s.nextClass && (
            <li>
              <Clock size={15} aria-hidden="true" />
              <span className="visually-hidden">Próxima clase: </span>
              {s.nextClass}
            </li>
          )}
        </ul>
      )}
      <div className="chips class-chips">
        {[...classes].sort(byWeek).map((c) => (
          <span key={c.id} className="chip">
            <span className="visually-hidden">Clase: </span>
            {CLASS_DAYS[c.day - 1] ?? '—'} {c.start}
            {c.room ? ` · ${c.room}` : ''}
          </span>
        ))}
        <button type="button" className="chip-btn" onClick={addClass} aria-label={`Añadir «${name}» al horario`}>
          <CalendarPlus size={15} aria-hidden="true" /> Horario
        </button>
      </div>
      <div className="stack-xs">
        <div className="section-head small">
          <span className="muted">Avance del curso</span>
          <span className="numeric">{s.topics.length ? `${pct} %` : 'Sin temas aún'}</span>
        </div>
        {s.topics.length > 0 && <Meter value={pct} color={color} label={`Avance de ${name}`} />}
      </div>
      <button type="button" className="btn btn--ghost btn--sm disclosure" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen((o) => !o)}>
        Temas{s.topics.length ? ` · ${done}/${s.topics.length}` : ''}
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <CheckList
          id={panelId}
          items={s.topics}
          onChange={(topics) => subjects.update(s.id, { topics: checkItemsPayload(topics) })}
          owner={name}
          noun="tema"
          listLabel="Temas"
          placeholder="Añadir tema"
          make={(n) => ({ id: newSubId(), name: n, done: false })}
        />
      )}
    </article>
  );
}

function SubjectForm({ subject, count, data, onDone }: { subject: Subject | null; count: number; data: Record<string, unknown> | undefined; onDone: () => void }) {
  const actions = useModule('subjects');
  const projectActions = useModule('projects');
  const toast = useToast();
  const [name, setName] = useState(subject?.name ?? '');
  const [teacher, setTeacher] = useState(subject?.teacher ?? '');
  const [room, setRoom] = useState(subject?.room ?? '');
  const [nextClass, setNextClass] = useState(subject?.nextClass ?? '');
  // Color cíclico para las nuevas, como la app anterior.
  const [color, setColor] = useState(safeColor(subject?.color, SUBJECT_COLORS[count % SUBJECT_COLORS.length]));
  // Los proyectos guardan el NOMBRE de la materia: al renombrarla se actualizan con ella.
  const projects = subject ? legacyList(data, 'projects').filter((p) => p.subject && p.subject === subject.name) : [];
  const classCount = subject ? legacyList(data, 'classes').filter((c) => c.subject === subject.id).length : 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fields = { name: name.trim(), teacher: teacher.trim(), room: room.trim(), nextClass: nextClass.trim(), color };
    if (subject) {
      actions.update(subject.id, fields);
      if (fields.name !== subject.name) projects.forEach((p) => projectActions.update(p.id, { subject: fields.name }));
    } else actions.add({ id: newId(), ...fields, topics: [] });
    onDone();
  };

  const remove = () => {
    if (!subject) return;
    actions.remove(subject.id);
    toast('Materia eliminada. Sus clases y proyectos se conservan.');
    onDone();
  };

  const topicCount = subject?.topics.length ?? 0;
  const keeps = classCount || projects.length ? ' Sus clases del Horario y sus proyectos no se borran.' : '';

  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required autoFocus placeholder="Física" />
      {subject && projects.length > 0 && name.trim() && name.trim() !== subject.name && (
        <p className="field__hint">{projects.length === 1 ? 'Su proyecto se actualizará con el nuevo nombre.' : `Sus ${projects.length} proyectos se actualizarán con el nuevo nombre.`}</p>
      )}
      <TextField label="Profesor o profesora (opcional)" value={teacher} onChange={(e) => setTeacher(e.target.value)} maxLength={120} placeholder="Prof. Ruiz" />
      <div className="grid-2">
        <TextField label="Aula (opcional)" value={room} onChange={(e) => setRoom(e.target.value)} maxLength={60} placeholder="B-3" />
        <TextField label="Próxima clase (opcional)" value={nextClass} onChange={(e) => setNextClass(e.target.value)} maxLength={60} placeholder="Lunes 8:00" />
      </div>
      <ColorPicker legend="Color" colors={paletteWith(SUBJECT_COLORS, color)} value={color} onChange={setColor} names={COLOR_NAMES} />
      <FormActions
        submitLabel={subject ? 'Guardar' : 'Añadir materia'}
        disabled={!name.trim()}
        onDelete={subject ? remove : undefined}
        confirm={`Se borrará «${subject?.name || 'la materia'}»${topicCount ? ` con ${plural(topicCount, 'tema', 'temas')}` : ''}.${keeps}`}
      />
    </form>
  );
}
