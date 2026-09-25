import type { LegacySubtask, LegacyTodo } from '@dyc/core';
import { Check, ChevronDown, ChevronUp, ListChecks, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { newId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { useToast } from '../app/toast';
import { PageHeader } from '../components/AppShell';
import { EmptyState, ErrorState, Loading } from '../components/States';

export function Todos() {
  const legacy = useLegacyData();
  const todos = useLegacyList(legacy.data?.data, 'todos');
  const subtasks = useLegacyList(legacy.data?.data, 'subtasks');
  const actions = useModule('todos');
  const [title, setTitle] = useState('');
  const pending = todos.filter((t) => !t.done).length;

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    actions.add({ id: newId(), title: title.trim(), done: false });
    setTitle('');
  };

  const move = (index: number, delta: -1 | 1) => {
    const ids = todos.map((t) => t.id);
    const j = index + delta;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    actions.reorder(ids);
  };

  return (
    <div className="page page--narrow">
      <PageHeader eyebrow="Herramientas" title="Pendientes" />
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
            <input id="new-todo" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} placeholder="Añade algo que tengas que hacer" />
            <button type="submit" className="btn" disabled={!title.trim()}>
              <Plus size={18} aria-hidden="true" /> Añadir
            </button>
          </form>

          {todos.length === 0 ? (
            <EmptyState title="Nada pendiente">Anota lo que tengas en la cabeza y divídelo en pasos pequeños.</EmptyState>
          ) : (
            <section className="card card--list" aria-labelledby="todos-count">
              <h2 id="todos-count" className="list-count">
                {pending === 0 ? 'Todo hecho' : `${pending} por hacer`}
                <span className="muted small"> · {todos.length} en total</span>
              </h2>
              <ul className="todo-list">
                {todos.map((t, i) => (
                  <TodoRow key={t.id} todo={t} subtasks={subtasks.filter((s) => s.todoId === t.id)} first={i === 0} last={i === todos.length - 1} onMove={(d) => move(i, d)} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function TodoRow({ todo, subtasks, first, last, onMove }: { todo: LegacyTodo; subtasks: LegacySubtask[]; first: boolean; last: boolean; onMove: (d: -1 | 1) => void }) {
  const actions = useModule('todos');
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(todo.title);
  const doneSubs = subtasks.filter((s) => s.done).length;
  const panelId = `subs-${todo.id}`;

  const rename = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && name.trim() !== todo.title) actions.update(todo.id, { title: name.trim() });
    setRenaming(false);
  };

  return (
    <li className={`todo${todo.done ? ' todo--done' : ''}`}>
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
                  toast(subtasks.length ? 'Pendiente y subtareas eliminados.' : 'Pendiente eliminado.');
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
