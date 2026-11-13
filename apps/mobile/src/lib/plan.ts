import { waterPatch, type LegacyData, type Plan } from '@dyc/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { LEGACY_QUERY } from './legacy';

/** Escribe una acción confirmada («Hacer») con la API de módulos, como cualquier otra herramienta. */
export async function runPlan(plan: Plan, data: LegacyData | undefined): Promise<unknown> {
  switch (plan.kind) {
    case 'add':
      return api.modules.add(plan.key, plan.item as never);
    case 'update':
      return api.modules.update(plan.key, plan.id, plan.patch as never);
    case 'water':
      return api.modules.patch('dayLog', waterPatch(data, plan.glasses, plan.today));
    case 'batch':
      // En orden: los hijos necesitan que su padre ya exista.
      for (const op of plan.ops) await runPlan(op, data);
      return null;
  }
}

/** «Hacer» del Asistente y de las sugerencias: en cola con el resto de cambios y luego recarga los datos. */
export function useRunPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['legacy', 'assistant'],
    scope: { id: 'legacy' },
    mutationFn: (plan: Plan) => runPlan(plan, qc.getQueryData<{ data: LegacyData }>(LEGACY_QUERY)?.data),
    onSettled: () => {
      if (qc.isMutating({ mutationKey: ['legacy'] }) <= 1) return qc.invalidateQueries({ queryKey: LEGACY_QUERY });
    },
  });
}
