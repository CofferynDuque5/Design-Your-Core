import {
  BLOCK_KIND_INFO,
  BLOCK_KINDS,
  drawableBlocks,
  durationLabel,
  hoursLabel,
  layoutLanes,
  nowHours,
  plural,
  TASK_PRIORITIES,
  TASK_PRIORITY_INFO,
  type BlockKind,
  type LegacyBlock,
  type LegacyData,
  type LegacyTask,
  type TaskPriority,
} from '@dyc/core';
import { radius, space } from '@dyc/tokens';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { CheckRow, Dot, DotChoices, IconButton, Stepper, tint, ToolScreen } from '../../components/tools';
import { Button, Card, EmptyState, ErrorState, Field, Loading, Segmented, SectionHeader, T, fonts } from '../../components/ui';
import { newId, useLegacyData, useLegacyList, useModule } from '../../lib/legacy';
import { useTheme } from '../../lib/theme';
import { useNow } from '../../lib/tools';

type View_ = 'dia' | 'tareas';
const VIEWS: Array<{ value: View_; label: string }> = [
  { value: 'dia', label: 'Tu día' },
  { value: 'tareas', label: 'Tareas' },
];

export default function Agenda() {
  const params = useLocalSearchParams<{ vista?: string }>();
  const router = useRouter();
  const [view, setView] = useState<View_>(params.vista === 'tareas' ? 'tareas' : 'dia');
  const legacy = useLegacyData();

  return (
    <ToolScreen title="Agenda" refreshing={legacy.isRefetching} onRefresh={() => legacy.refetch()}>
      <Segmented<View_>
        label="Vista"
        value={view}
        options={VIEWS}
        onChange={(v) => {
          setView(v);
          router.setParams({ vista: v === 'dia' ? undefined : v });
        }}
      />
      {legacy.isPending ? (
        <Loading label="Cargando tu agenda" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : view === 'dia' ? (
        <DayView data={legacy.data.data} />
      ) : (
        <TasksView data={legacy.data.data} />
      )}
    </ToolScreen>
  );
}

// ---------- Tu día: línea de tiempo de bloques ----------

const HOUR = 60; // pt por hora (media hora = 30 pt; los bloques cortos amplían su zona táctil)
const GUTTER = 44; // columna de las horas

function DayView({ data }: { data: LegacyData }) {
  const { colors, name } = useTheme();
  const blocks = useLegacyList(data, 'blocks');
  const [editing, setEditing] = useState<LegacyBlock | 'new' | null>(null);
  const now = useNow();

  // Franja de 6 a 22 h, ampliada si algún bloque se sale.
  const valid = drawableBlocks(blocks);
  const from = Math.min(6, ...valid.map((b) => Math.floor(b.start)));
  const to = Math.max(22, ...valid.map((b) => Math.ceil(b.start + b.dur)));
  const placed = layoutLanes(valid.map((b) => ({ item: b, start: b.start, end: b.start + b.dur })));
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const nowH = nowHours(now);
  const total = valid.reduce((s, b) => s + b.dur, 0);

  return (
    <>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <T v="heading" accessibilityRole="header" style={{ flex: 1 }}>
            Tu día
          </T>
          <Button small label="Nuevo bloque" icon={<Plus size={16} color={colors.onPrimary} />} onPress={() => setEditing('new')} />
        </View>
        <T v="small" tint="muted" style={{ marginTop: -space[2] }}>
          {valid.length ? `${plural(valid.length, 'bloque', 'bloques')} · ${durationLabel(total)} planificadas` : 'Organiza tu jornada en bloques.'}
        </T>
        {valid.length === 0 ? (
          <EmptyState title="Tu día está en blanco">Añade bloques para estudiar, entrenar o descansar. Se repiten cada día.</EmptyState>
        ) : (
          <View style={{ height: (to - from) * HOUR + 8, marginTop: space[2] }}>
            {hours.map((h) => (
              <View key={h} style={[st.hourRow, { top: (h - from) * HOUR }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <T v="small" tint="subtle" style={st.hourLabel}>
                  {h}:00
                </T>
                <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />
              </View>
            ))}
            <View style={st.track} accessibilityLabel="Bloques del día, por hora de inicio">
              {placed.map(({ item: b, lane, lanes }) => {
                const info = BLOCK_KIND_INFO[b.kind] ?? BLOCK_KIND_INFO.study;
                const short = b.dur < 0.75;
                return (
                  <View
                    key={b.id}
                    style={{ position: 'absolute', top: (b.start - from) * HOUR + 1, height: b.dur * HOUR - 2, left: `${(lane / lanes) * 100}%`, width: `${100 / lanes}%`, paddingHorizontal: 2 }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Editar «${b.label}», ${hoursLabel(b.start)} a ${hoursLabel(b.start + b.dur)}, ${info.label}`}
                      onPress={() => setEditing(b)}
                      hitSlop={short ? { top: 7, bottom: 7 } : undefined}
                      style={({ pressed }) => [st.block, { backgroundColor: tint(info.color, colors.surface, name === 'dark' ? 0.24 : 0.16), borderLeftColor: info.color, opacity: pressed ? 0.75 : 1 }]}
                    >
                      <T v="small" numberOfLines={b.dur >= 1.5 ? 2 : 1} style={{ fontFamily: fonts.semibold, color: colors.ink }}>
                        {b.label}
                      </T>
                      {!short && (
                        <T v="small" tint="muted" numberOfLines={1} style={{ fontSize: 13, fontVariant: ['tabular-nums'] }}>
                          {hoursLabel(b.start)}–{hoursLabel(b.start + b.dur)}
                          {b.sub ? ` · ${b.sub}` : ''}
                        </T>
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </View>
            {nowH >= from && nowH <= to && (
              <View style={[st.now, { top: (nowH - from) * HOUR }]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <View style={[st.nowDot, { backgroundColor: colors.danger }]} />
                <View style={{ flex: 1, height: 2, backgroundColor: colors.danger }} />
              </View>
            )}
          </View>
        )}
      </Card>

      <Card>
        <SectionHeader title="Tipos" />
        {BLOCK_KINDS.map((k) => {
          const n = valid.filter((b) => b.kind === k).reduce((s, b) => s + b.dur, 0);
          return (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }} accessible accessibilityLabel={`${BLOCK_KIND_INFO[k].label}: ${n ? durationLabel(n) : 'nada'}`}>
              <Dot color={BLOCK_KIND_INFO[k].color} />
              <T v="body" style={{ flex: 1 }}>
                {BLOCK_KIND_INFO[k].label}
              </T>
              <T v="small" tint="muted" style={{ fontVariant: ['tabular-nums'] }}>
                {n ? durationLabel(n) : '—'}
              </T>
            </View>
          );
        })}
        <T v="small" tint="muted">
          Los bloques no llevan fecha: tu plan se repite cada día, igual que en la app anterior.
        </T>
      </Card>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo bloque' : 'Editar bloque'}>
        {editing !== null && <BlockForm block={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

/** Siguiente o anterior paso de media hora (un dato antiguo fuera de la rejilla se ajusta a ella). */
const up = (v: number) => Math.floor(v * 2) / 2 + 0.5;
const down = (v: number) => Math.ceil(v * 2) / 2 - 0.5;

function BlockForm({ block, onDone }: { block: LegacyBlock | null; onDone: () => void }) {
  const blocks = useModule('blocks');
  const [label, setLabel] = useState(block?.label ?? '');
  const [sub, setSub] = useState(block?.sub ?? '');
  const [kind, setKind] = useState<BlockKind>(block && BLOCK_KINDS.includes(block.kind) ? block.kind : 'study');
  const [start, setStart] = useState(block?.start ?? 9);
  const [dur, setDur] = useState(block?.dur ?? 1);
  const tooLong = start + dur > 24;

  const submit = () => {
    const fields = { label: label.trim(), sub: sub.trim(), kind, start, dur };
    if (block) blocks.update(block.id, fields);
    else blocks.add({ id: newId(), ...fields });
    onDone();
  };

  return (
    <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <Field label="Nombre" value={label} onChangeText={setLabel} maxLength={120} placeholder="Estudiar cálculo" autoFocus={!block} />
      <Field label="Detalle (opcional)" value={sub} onChangeText={setSub} maxLength={200} placeholder="Capítulo 3" />
      <DotChoices legend="Tipo" value={kind} onChange={setKind} options={BLOCK_KINDS.map((k) => ({ value: k, label: BLOCK_KIND_INFO[k].label, color: BLOCK_KIND_INFO[k].color }))} />
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <Stepper
          label="Empieza"
          value={hoursLabel(start)}
          onDec={() => setStart((v) => Math.max(0, down(v)))}
          onInc={() => setStart((v) => Math.min(23.5, up(v)))}
          decDisabled={start <= 0}
          incDisabled={start >= 23.5}
          decLabel="Empezar media hora antes"
          incLabel="Empezar media hora después"
        />
        <Stepper
          label="Duración"
          value={durationLabel(dur)}
          onDec={() => setDur((v) => Math.max(0.5, down(v)))}
          onInc={() => setDur((v) => up(v))}
          decDisabled={dur <= 0.5}
          incDisabled={start + up(dur) > 24}
          decLabel="Media hora menos"
          incLabel="Media hora más"
          error={tooLong ? 'No puede pasar de medianoche.' : null}
        />
      </View>
      <View style={{ gap: space[2] }}>
        <Button label={block ? 'Guardar' : 'Añadir bloque'} onPress={submit} disabled={!label.trim() || tooLong} />
        {block && (
          <Button
            variant="ghost"
            label="Borrar bloque"
            onPress={() => {
              blocks.remove(block.id);
              onDone();
            }}
          />
        )}
      </View>
    </ScrollView>
  );
}

// ---------- Tareas por prioridad ----------

const PRIORITY_OPTIONS = TASK_PRIORITIES.map((p) => ({ value: p, label: TASK_PRIORITY_INFO[p].label, color: TASK_PRIORITY_INFO[p].color }));
// Una prioridad desconocida se muestra como media, sin cambiar el dato.
const priOf = (t: LegacyTask): TaskPriority => (TASK_PRIORITIES.includes(t.pri) ? t.pri : 'media');

function TasksView({ data }: { data: LegacyData }) {
  const { colors } = useTheme();
  const tasks = useLegacyList(data, 'tasks');
  const actions = useModule('tasks');
  const [title, setTitle] = useState('');
  const [pri, setPri] = useState<TaskPriority>('media');
  const [editing, setEditing] = useState<LegacyTask | null>(null);

  const add = () => {
    if (!title.trim()) return;
    actions.add({ id: newId(), title: title.trim(), pri, time: null, rem: false, done: false, tags: '' });
    setTitle('');
  };

  return (
    <>
      <Card>
        <Field label="Nueva tarea" value={title} onChangeText={setTitle} maxLength={200} placeholder="Entregar el ensayo" returnKeyType="done" onSubmitEditing={add} />
        <DotChoices legend="Prioridad" value={pri} onChange={setPri} options={PRIORITY_OPTIONS} />
        <Button label="Añadir tarea" icon={<Plus size={18} color={colors.onPrimary} />} onPress={add} disabled={!title.trim()} />
      </Card>

      {tasks.length === 0 ? (
        <EmptyState title="Sin tareas por ahora">Escribe la primera arriba y elige su prioridad.</EmptyState>
      ) : (
        TASK_PRIORITIES.map((p) => {
          const group = tasks.filter((t) => priOf(t) === p);
          const done = group.filter((t) => t.done).length;
          const info = TASK_PRIORITY_INFO[p];
          return (
            <View key={p} style={{ gap: space[2] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                <Dot color={info.color} />
                <T v="heading" accessibilityRole="header" style={{ flex: 1 }}>
                  Prioridad {info.label.toLowerCase()}
                </T>
                <T v="small" tint="muted" accessibilityLabel={`${done} de ${group.length} hechas`} style={{ fontVariant: ['tabular-nums'] }}>
                  {done}/{group.length}
                </T>
              </View>
              {group.length === 0 ? (
                <T v="small" tint="muted">
                  Nada con prioridad {info.label.toLowerCase()}.
                </T>
              ) : (
                <Card style={{ paddingVertical: space[1], gap: 0 }}>
                  {group.map((t) => (
                    <CheckRow
                      key={t.id}
                      title={t.title}
                      done={!!t.done}
                      color={info.color}
                      onToggle={() => actions.update(t.id, { done: !t.done })}
                      trailing={
                        <>
                          {t.time && (
                            <View style={[st.chip, { backgroundColor: colors.surfaceSunken }]}>
                              <T v="small" tint="muted" style={{ fontVariant: ['tabular-nums'] }}>
                                {t.time}
                              </T>
                            </View>
                          )}
                          <IconButton label={`Editar «${t.title}»`} onPress={() => setEditing(t)}>
                            <Pencil size={18} color={colors.inkMuted} />
                          </IconButton>
                          <IconButton label={`Borrar «${t.title}»`} onPress={() => actions.remove(t.id)}>
                            <Trash2 size={18} color={colors.inkMuted} />
                          </IconButton>
                        </>
                      }
                    />
                  ))}
                </Card>
              )}
            </View>
          );
        })
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Editar tarea">
        {editing && <TaskForm task={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

function TaskForm({ task, onDone }: { task: LegacyTask; onDone: () => void }) {
  const actions = useModule('tasks');
  const [title, setTitle] = useState(task.title);
  const [pri, setPri] = useState<TaskPriority>(priOf(task));
  return (
    <View style={{ gap: space[4] }}>
      <Field label="Tarea" value={title} onChangeText={setTitle} maxLength={200} />
      <DotChoices legend="Prioridad" value={pri} onChange={setPri} options={PRIORITY_OPTIONS} />
      <Button
        label="Guardar"
        disabled={!title.trim()}
        onPress={() => {
          actions.update(task.id, { title: title.trim(), pri });
          onDone();
        }}
      />
    </View>
  );
}

const st = StyleSheet.create({
  hourRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: space[2], height: 20, marginTop: -10 },
  hourLabel: { width: GUTTER - space[2], textAlign: 'right', fontSize: 12, fontVariant: ['tabular-nums'] },
  track: { position: 'absolute', top: 0, bottom: 0, left: GUTTER, right: 0 },
  block: { flex: 1, borderRadius: radius.sm, borderLeftWidth: 3, paddingHorizontal: space[2], paddingVertical: 4, overflow: 'hidden', justifyContent: 'flex-start' },
  now: { position: 'absolute', left: GUTTER - 5, right: 0, flexDirection: 'row', alignItems: 'center', marginTop: -5 },
  nowDot: { width: 10, height: 10, borderRadius: 5 },
  chip: { borderRadius: radius.pill, paddingHorizontal: space[2], paddingVertical: 2 },
});
