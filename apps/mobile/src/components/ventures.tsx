import { VENTURE_COLORS, VENTURE_STAGE_INFO, VENTURE_STAGES, ventureItemsOf, type LegacyVenture, type VentureStage } from '@dyc/core';
import { space } from '@dyc/tokens';
import { useState } from 'react';
import { View } from 'react-native';
import { deleteFiles } from '../lib/files';
import { newId, useLegacyData, useModule } from '../lib/legacy';
import { ColorSwatches, DotChoices, FormActions } from './tools';
import { Field } from './ui';


export const stageOf = (v: LegacyVenture): VentureStage => (VENTURE_STAGES.includes(v.stage) ? v.stage : 'idea');

/** Crear o editar un emprendimiento (borrar se lleva sus archivos de la nube). */
export function VentureForm({ venture, onDone, onDeleted }: { venture: LegacyVenture | null; onDone: (createdId?: string) => void; onDeleted?: () => void }) {
  const actions = useModule('ventures');
  const legacy = useLegacyData();
  const [name, setName] = useState(venture?.name ?? '');
  const [description, setDescription] = useState(venture?.description ?? '');
  const [stage, setStage] = useState<VentureStage>(venture ? stageOf(venture) : 'idea');
  const [color, setColor] = useState<string>(venture?.color ?? VENTURE_COLORS[0]);
  const submit = () => {
    const fields = { name: name.trim(), description, stage, color };
    if (venture) {
      actions.update(venture.id, fields);
      onDone();
    } else {
      const id = newId();
      actions.add({ id, ...fields });
      onDone(id);
    }
  };
  return (
    <View style={{ gap: space[4] }}>
      <Field label="Nombre" value={name} onChangeText={setName} maxLength={120} autoFocus={!venture} placeholder="Cafetería, tienda en línea, app…" />
      <Field label="De qué trata (opcional)" value={description} onChangeText={setDescription} maxLength={5000} multiline placeholder="Qué vendes, a quién, qué te falta…" style={{ minHeight: 88, textAlignVertical: 'top' }} />
      <DotChoices legend="Etapa" options={VENTURE_STAGES.map((s) => ({ value: s, label: VENTURE_STAGE_INFO[s].label }))} value={stage} onChange={setStage} />
      <ColorSwatches legend="Color" colors={VENTURE_COLORS} value={color} onChange={setColor} />
      <FormActions
        submitLabel={venture ? 'Guardar' : 'Crear emprendimiento'}
        onSubmit={submit}
        disabled={!name.trim()}
        onDelete={
          venture
            ? () => {
                const refs = ventureItemsOf(legacy.data?.data, venture.id)
                  .map((i) => i.ref)
                  .filter(Boolean);
                actions.remove(venture.id);
                void deleteFiles(refs);
                onDeleted?.();
              }
            : undefined
        }
        confirm={venture ? `Se borrará «${venture.name}» con todas sus notas, imágenes, archivos y enlaces.` : undefined}
      />
    </View>
  );
}
