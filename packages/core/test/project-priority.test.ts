import { describe, expect, it } from 'vitest';
import { firstProject, legacyItemSchemas, projectIdsByPriority, projectPriorityOf, projectsInOrder } from '../src/index.js';

const p = (id: string, priority?: string, status = 'curso') => ({ id, priority, status });

describe('prioridad de proyectos', () => {
  it('sin prioridad (app anterior) cuenta como media', () => {
    expect(projectPriorityOf({})).toBe('media');
    expect(projectPriorityOf({ priority: 'rara' })).toBe('media');
    expect(projectPriorityOf({ priority: 'alta' })).toBe('alta');
  });

  it('un proyecto nuevo se guarda con prioridad media por defecto', () => {
    const out = legacyItemSchemas.projects.parse({ id: 'a1', title: 'App' });
    expect(out.priority).toBe('media');
  });

  it('los entregados van al final y el primero pendiente es el que toca', () => {
    const list = [p('a', 'baja', 'entregado'), p('b', 'media'), p('c', 'alta')];
    expect(projectsInOrder(list).map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(firstProject(list)?.id).toBe('b');
    expect(firstProject([p('a', 'alta', 'entregado')])).toBeUndefined();
  });

  it('ordenar por prioridad respeta el orden dentro de cada nivel', () => {
    const list = [p('a', 'baja'), p('b'), p('c', 'alta'), p('d', 'alta', 'entregado'), p('e', 'alta')];
    expect(projectIdsByPriority(list)).toEqual(['c', 'e', 'b', 'a', 'd']);
  });
});
