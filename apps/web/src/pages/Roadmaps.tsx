import { checkItems, checkItemsPayload, COLOR_NAMES, donePercent, ROADMAP_COLORS, stepStates, type LegacyCheckItem, type LegacyRoadmap, type StepState } from '@dyc/core';
import { ArrowRight, Check, Lock, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { newId, newSubId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { ColorPicker, TextField } from '../components/Form';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { FormActions, Meter, paletteWith, safeColor } from '../components/ToolParts';
import { plural } from '../lib/format';

type Roadmap = LegacyRoadmap & { steps: LegacyCheckItem[] };
const STATE_LABEL: Record<StepState, string> = { done: 'Completada', current: 'En curso', next: 'Siguiente', locked: 'Bloqueada' };

export function Roadmaps() {
  const legacy = useLegacyData();
  const raw = useLegacyList(legacy.data?.data, 'roadmaps');
  const roadmaps = useMemo<Roadmap[]>(() => raw.map((r) => ({ ...r, steps: checkItems(r.steps, newSubId) })), [raw]);
  const [editing, setEditing] = useState<Roadmap | 'new' | null>(null);
  const steps = roadmaps.flatMap((r) => r.steps);
  const done = steps.filter((s) => s.done).length;

  return (
    <div className="page">
      <PageHeader eyebrow="Herramientas" title="Roadmaps">
        <button type="button" className="btn" onClick={() => setEditing('new')} disabled={!legacy.data}>
          <Plus size={18} aria-hidden="true" /> Nuevo roadmap
        </button>
      </PageHeader>
      {legacy.isPending ? (
        <Loading label="Cargando tus roadmaps" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : roadmaps.length === 0 ? (
        <EmptyState title="Aún no tienes roadmaps">Traza tu ruta de estudio paso a paso: al completar uno, se desbloquea el siguiente.</EmptyState>
      ) : (
        <div className="stack-lg">
          <div className="roadmap-intro">
            <p className="muted">
              <Sparkles size={16} aria-hidden="true" className="inline-icon" /> Al completar un paso, desbloqueas el siguiente.
            </p>
            {steps.length > 0 && (
              <p className="chip numeric">
                {done} de {steps.length} completadas
              </p>
            )}
          </div>
          <ul className="card-grid tool-grid tool-grid--wide">
            {roadmaps.map((r) => (
              <li key={r.id}>
                <RoadmapCard roadmap={r} onEdit={() => setEditing(r)} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo roadmap' : 'Editar roadmap'}>
        {editing !== null && <RoadmapForm roadmap={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

function RoadmapCard({ roadmap: r, onEdit }: { roadmap: Roadmap; onEdit: () => void }) {
  const actions = useModule('roadmaps');
  const [name, setName] = useState('');
  const inputId = useId();
  const color = safeColor(r.color, ROADMAP_COLORS[0]);
  const title = r.name || 'Sin nombre';
  const states = stepStates(r.steps);
  const current = r.steps[states.indexOf('current')];
  const done = r.steps.filter((s) => s.done).length;
  const titleId = `roadmap-${r.id}`;
  const save = (steps: LegacyCheckItem[]) => actions.update(r.id, { steps: checkItemsPayload(steps) });
  const mark = (id: string, value: boolean) => save(r.steps.map((s) => (s.id === id ? { ...s, done: value } : s)));

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    save([...r.steps, { id: newSubId(), name: name.trim(), done: false }]);
    setName('');
  };

  return (
    <article className="card tool-card" style={{ ['--c' as string]: color }} aria-labelledby={titleId}>
      <div className="tool-card__head">
        <div className="stack-xs">
          <h2 id={titleId} className="tool-card__title">
            {title}
          </h2>
          <span className="muted small">
            Ruta de materias{r.steps.length ? ` · ${done}/${r.steps.length}` : ''}
          </span>
        </div>
        <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Editar «${title}»`}>
          <Pencil size={18} aria-hidden="true" />
        </button>
      </div>
      {r.steps.length > 0 && <Meter value={donePercent(r.steps)} color={color} label={`Avance de ${title}`} />}
      {r.steps.length === 0 ? (
        <p className="muted small">Sin pasos todavía. Añade la primera materia abajo.</p>
      ) : (
        <ol className="steps-path" aria-label={`Pasos de «${title}»`}>
          {r.steps.map((s, i) => {
            const state = states[i];
            return (
              <li key={s.id} className={`step step--${state}`}>
                <span className="step__marker" aria-hidden="true">
                  {state === 'done' ? <Check size={15} strokeWidth={2.6} /> : state === 'locked' ? <Lock size={13} /> : i + 1}
                </span>
                <div className="step__body">
                  <div className="step__line">
                    <span className="step__name">{s.name || 'Sin nombre'}</span>
                    <span className={`chip step__state step__state--${state}`}>{STATE_LABEL[state]}</span>
                    <button type="button" className="icon-btn" onClick={() => save(r.steps.filter((x) => x.id !== s.id))} aria-label={`Borrar paso «${s.name}»`}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                  {state === 'current' && (
                    <button type="button" className="btn btn--sm" onClick={() => mark(s.id, true)} aria-label={`Marcar «${s.name}» como completada`}>
                      <Check size={16} aria-hidden="true" /> Marcar como completada
                    </button>
                  )}
                  {state === 'done' && (
                    <button type="button" className="btn btn--ghost btn--sm step__reopen" onClick={() => mark(s.id, false)} aria-label={`Reabrir «${s.name}»`}>
                      Reabrir
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <form className="inline-add inline-add--sm" onSubmit={add}>
        <label className="visually-hidden" htmlFor={inputId}>
          Nuevo paso de «{title}»
        </label>
        <input id={inputId} className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={300} placeholder="Añadir paso" />
        <button type="submit" className="btn btn--secondary btn--sm" disabled={!name.trim()}>
          Añadir
        </button>
      </form>
      <p className="roadmap-next small">
        {current ? (
          <>
            <ArrowRight size={15} aria-hidden="true" className="inline-icon" /> <span className="muted">Siguiente:</span> <strong>{current.name || 'Sin nombre'}</strong>
          </>
        ) : r.steps.length ? (
          <>
            <Check size={15} aria-hidden="true" className="inline-icon" /> <strong>¡Ruta completada!</strong>
          </>
        ) : (
          <span className="muted">Añade materias para empezar tu ruta.</span>
        )}
      </p>
    </article>
  );
}

function RoadmapForm({ roadmap, onDone }: { roadmap: Roadmap | null; onDone: () => void }) {
  const actions = useModule('roadmaps');
  const [name, setName] = useState(roadmap?.name ?? '');
  const [color, setColor] = useState(safeColor(roadmap?.color, ROADMAP_COLORS[0]));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (roadmap) actions.update(roadmap.id, { name: name.trim(), color });
    else actions.add({ id: newId(), name: name.trim(), color, steps: [] });
    onDone();
  };
  const n = roadmap?.steps.length ?? 0;
  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required autoFocus placeholder="Ingeniería de Sistemas" />
      <ColorPicker legend="Color" colors={paletteWith(ROADMAP_COLORS, color)} value={color} onChange={setColor} names={COLOR_NAMES} />
      <FormActions
        submitLabel={roadmap ? 'Guardar' : 'Añadir roadmap'}
        disabled={!name.trim()}
        onDelete={
          roadmap
            ? () => {
                actions.remove(roadmap.id);
                onDone();
              }
            : undefined
        }
        confirm={`Se borrará «${roadmap?.name || 'el roadmap'}»${n ? ` con ${plural(n, 'paso', 'pasos')}` : ''}.`}
      />
    </form>
  );
}
