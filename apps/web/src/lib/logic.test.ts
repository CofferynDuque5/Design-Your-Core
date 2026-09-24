import { describe, expect, it } from 'vitest';
import { countItems } from '../pages/More';

describe('lógica de pantallas', () => {
  it('cuenta los datos de la app anterior sin fallar con formas raras', () => {
    expect(countItems({ tasks: [1, 2], todos: [3], notes: 'x' }, ['tasks', 'todos', 'notes'])).toBe(3);
    expect(countItems({}, ['vault'])).toBe(0);
  });
});
