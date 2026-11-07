import { matchesSearch, todoGroups, type LegacySubtask, type LegacyTodo } from '@dyc/core';
import { Check, ChevronDown, ChevronUp, ListChecks, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { newId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { PageHeader } from '../components/AppShell';
import { Segmented } from '../components/Form';
import { SearchBox } from '../components/SearchBox';
import { EmptyState, ErrorState, Loading } from '../components/States';

type View = { group: boolean; hideDone: boolean };
const VIEW_KEY = 'dyc-pendientes-vista';
function readView(): View {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') as Partial<View>;
    return { group: v.group === true, hideDone: v.hideDone === true };
  } catch {
    return { group: false, hideDone: false };
  }
}

export function Todos() {
  const legacy = useLegacyData();
  const todos = useLegacyList(legacy.data?.data, 'todos');
  const subtasks = useLegacyList(legacy.data?.data, 'subtasks');
  const actions = useModule('todos');
  const [title, setTitle] = useState('');
  const [empty, setEmpty] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [view, setViewState] = useState<View>(readView);
  const setView = (v: Partial<View>) => {
    const next = { ...view, ...v };
    setViewState(next);
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(next));
    } catch {
      /* sin almacenamiento: la vista no se recuerda */
    }
  };
  const found = todos.filter((t) => (!view.hideDone || !t.done || t.id === added) && matchesSearch(q, t.title, ...subtasks.filter((s) => s.todoId === t.id).map((s) => s.title)));
  const doneCount = todos.filter((t) => t.done).length;
  const row = (t: LegacyTodo) => {
    const i = todos.indexOf(t);
    return <TodoRow key={t.id} fresh={t.id === added} todo={t} subtasks={subtasks.filter((s) => s.todoId === t.id)} first={i === 0} last={i === todos.length - 1} onMove={(d) => move(i, d)} />;
  };
  const pending = todos.filter((t) => !t.done).length;

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setEmpty(true);
    const id = newId();
    actions.add({ id, title: title.trim(), done: false });
    setTitle('');
    setAdded(id);
  };

  const move = (index: number, delta: -1 | 1) => {
    const ids = todos.map((t) => t.id);
    const j = index + delta;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    actions.reorder(ids);
  };

  return (
    <div className="page page--narrow">
      <PageHeader eyebrow="Organización" title="Pendientes" />
      {legacy.isPending ? (
        <Loading label="Cargando tus pendientes" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : (
        <div className="stack-lg">
          <form className="inline-add" onSubmit={add}>
            <label className="visually-hidden" htmlFor="new-todo">
              Nuevo pendiente
            </label>
            <input
              id="new-todo"
              className="input"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setEmpty(false);
              }}
              maxLength={300}
              placeholder="¿Qué tienes que hacer?"
              aria-invalid={empty || undefined}
              aria-describedby={empty ? 'new-todo-error' : undefined}
            />
            <button type="submit" className="btn">
              <Plus size={18} aria-hidden="true" /> Añadir
            </button>
          </form>
          {empty && (
            <p id="new-todo-error" className="field__error" role="alert">
              Escribe qué tienes que hacer antes de añadirlo.
            </p>
          )}

          {todos.length === 0 ? (
            <EmptyState title="Nada pendiente">Anota lo que tengas en la cabeza y divídelo en pasos pequeños.</EmptyState>
          ) : (
            <>
              {todos.length > 3 && <SearchBox label="Buscar en tus pendientes" value={q} onChange={setQ} placeholder="Buscar un pendiente o un paso…" count={found.length} />}
              {todos.length > 3 && (
                <div className="todo-view">
                  <Segmented
                    label="Cómo ver tus pendientes"
                    value={view.group ? 'grupos' : 'lista'}
                    onChange={(v) => setView({ group: v === 'grupos' })}
                    options={[
                      { value: 'lista', label: 'Lista' },
                      { value: 'grupos', label: 'Por proyecto' },
                    ]}
                  />
                  {doneCount > 0 && (
                    <label className="check-inline small">
                      <input type="checkbox" checked={view.hideDone} onChange={(e) => setView({ hideDone: e.target.checked })} /> Ocultar los hechos ({doneCount})
                    </label>
                  )}
                </div>
              )}
              <section className="card card--list" aria-labelledby="todos-count">
                <h2 id="todos-count" className="list-count">
                  {pending === 0 ? 'Todo hecho' : `${pending} por hacer`}
                  <span className="muted small"> · {todos.length} en total</span>
                </h2>
                {view.group ? (
                  todoGroups(found).map((g) => (
                    <div key={g.label} className="todo-group">
                      <h3 className="group-title">
                        {g.label} <span className="muted small numeric">{g.items.filter((t) => !t.done).length} por hacer</span>
                      </h3>
                      <ul className="todo-list">{g.items.map(row)}</ul>
                    </div>
                  ))
                ) : (
                  <ul className="todo-list">{found.map(row)}</ul>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TodoRow({ todo, subtasks, first, last, onMove, fresh }: { fresh?: boolean; todo: LegacyTodo; subtasks: LegacySubtask[]; first: boolean; last: boolean; onMove: (d: -1 | 1) => void }) {
  const actions = useModule('todos');
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(todo.title);
  const doneSubs = subtasks.filter((s) => s.done).length;
  const panelId = `subs-${todo.id}`;
  // Lo recién añadido va al final de la lista: se lleva a la vista para que se vea que entró.
  const row = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (fresh) row.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [fresh]);

  const rename = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && name.trim() !== todo.title) actions.update(todo.id, { title: name.trim() });
    setRenaming(false);
  };

  return (
    <li ref={row} className={`todo${todo.done ? ' todo--done' : ''}`}>
      <div className="todo__main">
        {renaming ? (
          <form className="todo__rename" onSubmit={rename}>
            <label className="visually-hidden" htmlFor={`rename-${todo.id}`}>
              Nuevo nombre de «{todo.title}»
            </label>
            <input
              id={`rename-${todo.id}`}
              className="input"
              value={name}
              maxLength={300}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setName(todo.title);
                  setRenaming(false);
                }
              }}
            />
            <button type="submit" className="icon-btn" aria-label="Guardar nombre" disabled={!name.trim()}>
              <Check size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Cancelar"
              onClick={() => {
                setName(todo.title);
                setRenaming(false);
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </form>
        ) : (
          <>
            <label className="check-row__label">
              <input type="checkbox" checked={!!todo.done} onChange={() => actions.update(todo.id, { done: !todo.done })} />
              <span>{todo.title}</span>
            </label>
            <div className="todo__actions">
              <button
                type="button"
                className="btn btn--ghost btn--sm todo__subs"
                aria-expanded={open}
                aria-controls={open ? panelId : undefined}
                aria-label={`Subtareas de «${todo.title}»${subtasks.length ? `: ${doneSubs} de ${subtasks.length} hechas` : ''}`}
                onClick={() => setOpen((o) => !o)}
              >
                <ListChecks size={16} aria-hidden="true" />
                {subtasks.length > 0 && <span className="numeric">{`${doneSubs}/${subtasks.length}`}</span>}
              </button>
              <button type="button" className="icon-btn" disabled={first} onClick={() => onMove(-1)} aria-label={`Subir «${todo.title}»`}>
                <ChevronUp size={18} aria-hidden="true" />
              </button>
              <button type="button" className="icon-btn" disabled={last} onClick={() => onMove(1)} aria-label={`Bajar «${todo.title}»`}>
                <ChevronDown size={18} aria-hidden="true" />
              </button>
              <button type="button" className="icon-btn" onClick={() => setRenaming(true)} aria-label={`Renombrar «${todo.title}»`}>
                <Pencil size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  actions.remove(todo.id);
                }}
                aria-label={`Borrar «${todo.title}»`}
              >
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>
      {open && <Subtasks id={panelId} todo={todo} subtasks={subtasks} />}
    </li>
  );
}

function Subtasks({ id, todo, subtasks }: { id: string; todo: LegacyTodo; subtasks: LegacySubtask[] }) {
  const actions = useModule('subtasks');
  const [title, setTitle] = useState('');
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    actions.add({ id: newId(), todoId: todo.id, title: title.trim(), done: false });
    setTitle('');
  };
  return (
    <div id={id} className="subtasks">
      {subtasks.length > 0 && (
        <ul className="stack-xs" aria-label={`Subtareas de «${todo.title}»`}>
          {subtasks.map((s) => (
            <li key={s.id} className={`check-row check-row--sub${s.done ? ' check-row--done' : ''}`}>
              <label className="check-row__label">
                <input type="checkbox" checked={!!s.done} onChange={() => actions.update(s.id, { done: !s.done })} />
                <span>{s.title}</span>
              </label>
              <button type="button" className="icon-btn" onClick={() => actions.remove(s.id)} aria-label={`Borrar subtarea «${s.title}»`}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="inline-add inline-add--sm" onSubmit={add}>
        <label className="visually-hidden" htmlFor={`${id}-new`}>
          Nueva subtarea de «{todo.title}»
        </label>
        <input id={`${id}-new`} className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} placeholder="Añadir un paso" />
        <button type="submit" className="btn btn--secondary btn--sm" disabled={!title.trim()}>
          Añadir paso
        </button>
      </form>
    </div>
  );
}
