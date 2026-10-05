import {
  checkItems,
  checkItemsPayload,
  donePercent,
  newLegacySubId,
  paletteWith,
  plural,
  ROADMAP_COLORS,
  safeColor,
  STEP_STATE_LABEL,
  stepStates,
  type LegacyCheckItem,
  type LegacyRoadmap,
  type StepState,
} from '@dyc/core';
import { radius, space } from '@dyc/tokens';
import { ArrowRight, Check, Lock, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { ColorSwatches, FormActions, IconButton, Meter, Pill, tint, ToolScreen } from '../../components/tools';
import { Button, Card, EmptyState, ErrorState, Field, Loading, T, fonts } from '../../components/ui';
import { newId, useLegacyData, useLegacyList, useModule } from '../../lib/legacy';
import { useTheme } from '../../lib/theme';

type Roadmap = LegacyRoadmap & { steps: LegacyCheckItem[] };

export default function Roadmaps() {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const raw = useLegacyList(legacy.data?.data, 'roadmaps');
  const roadmaps = useMemo<Roadmap[]>(() => raw.map((r) => ({ ...r, steps: checkItems(r.steps, newLegacySubId) })), [raw]);
  const [editing, setEditing] = useState<Roadmap | 'new' | null>(null);
  const steps = roadmaps.flatMap((r) => r.steps);
  const done = steps.filter((s) => s.done).length;

  return (
    <ToolScreen
      title="Roadmaps"
      refreshing={legacy.isRefetching}
      onRefresh={() => legacy.refetch()}
      right={<Button small label="Nuevo roadmap" icon={<Plus size={16} color={colors.onPrimary} />} onPress={() => setEditing('new')} disabled={!legacy.data} />}
    >
      {legacy.isPending ? (
        <Loading label="Cargando tus roadmaps" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : roadmaps.length === 0 ? (
        <EmptyState title="Aún no tienes roadmaps">Traza tu ruta de estudio paso a paso: al completar uno, se desbloquea el siguiente.</EmptyState>
      ) : (
        <>
          <View style={{ gap: space[2], marginTop: -space[2] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <Sparkles size={16} color={colors.inkMuted} />
              <T v="small" tint="muted" style={{ flex: 1 }}>
                Al completar un paso, desbloqueas el siguiente.
              </T>
            </View>
            {steps.length > 0 && (
              <Pill>
                {done} de {steps.length} completadas
              </Pill>
            )}
          </View>
          {roadmaps.map((r) => (
            <RoadmapCard key={r.id} roadmap={r} onEdit={() => setEditing(r)} />
          ))}
        </>
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo roadmap' : 'Editar roadmap'}>
        {editing !== null && <RoadmapForm roadmap={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </ToolScreen>
  );
}

function RoadmapCard({ roadmap: r, onEdit }: { roadmap: Roadmap; onEdit: () => void }) {
  const { colors } = useTheme();
  const actions = useModule('roadmaps');
  const [name, setName] = useState('');
  const color = safeColor(r.color, ROADMAP_COLORS[0]);
  const title = r.name || 'Sin nombre';
  const states = stepStates(r.steps);
  const current = r.steps[states.indexOf('current')];
  const done = r.steps.filter((s) => s.done).length;
  const save = (steps: LegacyCheckItem[]) => actions.update(r.id, { steps: checkItemsPayload(steps) });
  const mark = (id: string, value: boolean) => save(r.steps.map((s) => (s.id === id ? { ...s, done: value } : s)));

  const add = () => {
    if (!name.trim()) return;
    save([...r.steps, { id: newLegacySubId(), name: name.trim(), done: false }]);
    setName('');
  };

  return (
    <Card style={[st.card, { borderLeftColor: color }]}>
      <View style={st.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="heading" accessibilityRole="header" style={{ fontSize: 19, lineHeight: 24 }}>
            {title}
          </T>
          <T v="small" tint="muted">
            Ruta de materias{r.steps.length ? ` · ${done}/${r.steps.length}` : ''}
          </T>
        </View>
        <IconButton label={`Editar «${title}»`} onPress={onEdit} style={{ marginRight: -space[2], marginTop: -space[2] }}>
          <Pencil size={18} color={colors.inkMuted} />
        </IconButton>
      </View>
      {r.steps.length > 0 && <Meter value={donePercent(r.steps)} color={color} label={`Avance de ${title}`} />}
      {r.steps.length === 0 ? (
        <T v="small" tint="muted">
          Sin pasos todavía. Añade la primera materia abajo.
        </T>
      ) : (
        <View accessibilityLabel={`Pasos de «${title}»`}>
          {r.steps.map((s, i) => (
            <Step
                key={s.id}
                step={s}
                index={i}
                state={states[i]}
                color={color}
                last={i === r.steps.length - 1}
                onMark={(v) => mark(s.id, v)}
                onRemove={() => save(r.steps.filter((x) => x.id !== s.id))}
              />
          ))}
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[2] }}>
        <View style={{ flex: 1 }}>
          <Field label="Nuevo paso" accessibilityLabel={`Nuevo paso de «${title}»`} value={name} onChangeText={setName} maxLength={300} placeholder="Añadir paso" returnKeyType="done" onSubmitEditing={add} />
        </View>
        <Button small variant="secondary" label="Añadir" onPress={add} disabled={!name.trim()} />
      </View>
      <View style={[st.next, { borderTopColor: colors.line }]}>
        {current ? (
          <>
            <ArrowRight size={16} color={color} />
            <T v="small" tint="muted">
              Siguiente:
            </T>
            <T v="small" style={{ fontFamily: fonts.semibold, flexShrink: 1 }}>
              {current.name || 'Sin nombre'}
            </T>
          </>
        ) : r.steps.length ? (
          <>
            <Check size={16} color={colors.success} />
            <T v="small" style={{ fontFamily: fonts.semibold }}>
              ¡Ruta completada!
            </T>
          </>
        ) : (
          <T v="small" tint="muted">
            Añade materias para empezar tu ruta.
          </T>
        )}
      </View>
    </Card>
  );
}

function Step({ step: s, index, state, color, last, onMark, onRemove }: { step: LegacyCheckItem; index: number; state: StepState; color: string; last: boolean; onMark: (v: boolean) => void; onRemove: () => void }) {
  const { colors } = useTheme();
  const name = s.name || 'Sin nombre';
  const muted = state === 'locked';
  const marker =
    state === 'done'
      ? { bg: color, border: color }
      : state === 'current'
        ? { bg: tint(color, colors.surface, 0.18), border: color }
        : { bg: colors.surface, border: colors.lineStrong };
  return (
    <View style={st.step}>
      <View style={st.rail} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={[st.marker, { backgroundColor: marker.bg, borderColor: marker.border }]}>
          {state === 'done' ? (
            <Check size={15} strokeWidth={2.6} color="#FFFFFF" />
          ) : state === 'locked' ? (
            <Lock size={13} color={colors.inkSubtle} />
          ) : (
            <T v="small" style={{ fontFamily: fonts.semibold, fontSize: 13, lineHeight: 16, color: state === 'current' ? colors.ink : colors.inkMuted }}>
              {index + 1}
            </T>
          )}
        </View>
        {!last && <View style={[st.line, { backgroundColor: state === 'done' ? color : colors.line }]} />}
      </View>
      <View style={{ flex: 1, gap: space[2], paddingBottom: last ? 0 : space[4] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <View style={{ flex: 1, gap: 4 }} accessible accessibilityLabel={`Paso ${index + 1}: ${name}, ${STEP_STATE_LABEL[state].toLowerCase()}`}>
            <T v="label" tint={muted ? 'subtle' : 'ink'} style={state === 'done' && { textDecorationLine: 'line-through', color: colors.inkMuted }}>
              {name}
            </T>
            <Pill color={state === 'current' ? color : undefined}>{STEP_STATE_LABEL[state]}</Pill>
          </View>
          {state === 'done' && <Button small variant="link" label="Reabrir" accessibilityLabel={`Reabrir «${name}»`} onPress={() => onMark(false)} />}
          <IconButton label={`Borrar paso «${s.name}»`} onPress={onRemove}>
            <Trash2 size={16} color={colors.inkMuted} />
          </IconButton>
        </View>
        {state === 'current' && (
          <Button
            small
            label="Marcar como completada"
            accessibilityLabel={`Marcar «${name}» como completada`}
            icon={<Check size={16} color={colors.onPrimary} />}
            onPress={() => onMark(true)}
            style={{ alignSelf: 'flex-start' }}
          />
        )}
      </View>
    </View>
  );
}

function RoadmapForm({ roadmap, onDone }: { roadmap: Roadmap | null; onDone: () => void }) {
  const actions = useModule('roadmaps');
  const [name, setName] = useState(roadmap?.name ?? '');
  const [color, setColor] = useState(safeColor(roadmap?.color, ROADMAP_COLORS[0]));
  const submit = () => {
    if (roadmap) actions.update(roadmap.id, { name: name.trim(), color });
    else actions.add({ id: newId(), name: name.trim(), color, steps: [] });
    onDone();
  };
  const n = roadmap?.steps.length ?? 0;
  return (
    <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <Field label="Nombre" value={name} onChangeText={setName} maxLength={120} placeholder="Ingeniería de Sistemas" autoFocus={!roadmap} />
      <ColorSwatches legend="Color" colors={paletteWith(ROADMAP_COLORS, color)} value={color} onChange={setColor} />
      <FormActions
        submitLabel={roadmap ? 'Guardar' : 'Añadir roadmap'}
        onSubmit={submit}
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
    </ScrollView>
  );
}

const st = StyleSheet.create({
  card: { borderLeftWidth: 4 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  step: { flexDirection: 'row', gap: space[3] },
  rail: { width: 28, alignItems: 'center' },
  marker: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  line: { width: 2, flex: 1, marginTop: 4, borderRadius: radius.pill },
  next: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space[3] },
});
