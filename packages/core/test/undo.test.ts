import { describe, expect, it } from 'vitest';
import { applyLegacyOp, undoLegacyObjectPatch, undoLegacyOp, type LegacyData, type LegacyKey, type LegacyOp } from '../src/legacy.js';

const base: LegacyData = {
  todos: [
    { id: 'a', title: 'Uno', done: false },
    { id: 'b', title: 'Dos', done: true },
  ],
  subtasks: [{ id: 's1', todoId: 'a', title: 'Paso', done: false }],
} as unknown as LegacyData;

/** Aplica el cambio y luego sus pasos de deshacer: debe quedar como estaba. */
function roundTrip<K extends LegacyKey>(key: K, op: LegacyOp<K>) {
  const steps = undoLegacyOp(base, key, op);
  let d = applyLegacyOp(base, key, op);
  for (const s of steps ?? []) d = applyLegacyOp(d, s.key, s.op);
  return { steps, d };
}

describe('undoLegacyOp', () => {
  it('deshace añadir quitándolo', () => {
    const { d } = roundTrip('todos', { type: 'add', item: { id: 'c', title: 'Tres', done: false } });
    expect(d.todos).toEqual(base.todos);
  });
  it('deshace borrar con su lugar y sus pasos', () => {
    const { d } = roundTrip('todos', { type: 'remove', id: 'a' });
    expect(d.todos).toEqual(base.todos);
    expect(d.subtasks).toEqual(base.subtasks);
  });
  it('deshace un cambio volviendo a los valores anteriores', () => {
    const { d, steps } = roundTrip('todos', { type: 'update', id: 'b', patch: { done: false, title: 'Dos bis' } });
    expect(steps).toHaveLength(1);
    expect(d.todos).toEqual(base.todos);
  });
  it('no hay nada que deshacer si el cambio no cambia nada', () => {
    expect(undoLegacyOp(base, 'todos', { type: 'update', id: 'b', patch: { done: true } })).toBeNull();
    expect(undoLegacyOp(base, 'todos', { type: 'reorder', ids: ['a', 'b'] })).toBeNull();
  });
  it('deshace el orden', () => {
    const { d } = roundTrip('todos', { type: 'reorder', ids: ['b', 'a'] });
    expect(d.todos).toEqual(base.todos);
  });
});

describe('undoLegacyObjectPatch', () => {
  it('devuelve los valores anteriores de los campos cambiados', () => {
    const data = { budget: { amount: 100 } } as unknown as LegacyData;
    expect(undoLegacyObjectPatch(data, 'budget', { amount: 250 } as never)).toEqual({ amount: 100 });
  });
});
