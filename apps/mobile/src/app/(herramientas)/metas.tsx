import {
  GOAL_CATEGORIES,
  GOAL_CATEGORY_INFO,
  goalCategoryOf,
  goalDeadlineLabel,
  goalPercent,
  goalStep,
  goalToggleDone,
  isDay,
  localDayKey,
  shortDay,
  type Day,
  type GoalCategory,
  type LegacyGoal,
} from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { CalendarClock, Check, Minus, Pencil, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { DayStepper, Dot, DotChoices, FormActions, IconButton, Meter, Stats, ToolScreen } from '../../components/tools';
import { Button, Card, EmptyState, ErrorState, Field, Loading, T, fonts } from '../../components/ui';
import { newId, useLegacyData, useLegacyList, useModule } from '../../lib/legacy';
import { useTheme } from '../../lib/theme';

type Filter = 'todas' | GoalCategory;
const FILTERS: Array<{ value: Filter; label: string; color?: string }> = [
  { value: 'todas', label: 'Todas' },
  ...GOAL_CATEGORIES.map((c) => ({ value: c, label: GOAL_CATEGORY_INFO[c].label, color: GOAL_CATEGORY_INFO[c].color })),
];
const num = (x: unknown, fallback = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);

export default function Goals() {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const goals = useLegacyList(legacy.data?.data, 'goals');
  const [filter, setFilter] = useState<Filter>('todas');
  const [editing, setEditing] = useState<LegacyGoal | 'new' | null>(null);
  // Las fechas límite son fechas de calendario, en hora local (como la web).
  const today = localDayKey(new Date());
  const done = goals.filter((g) => g.done).length;
  const next = goals.filter((g) => !g.done && isDay(g.deadline) && g.deadline >= today).sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
  const shown = goals.filter((g) => filter === 'todas' || goalCategoryOf(g) === filter);
  // Primero las que están en curso; las logradas, al final.
  const ordered = [...shown.filter((g) => !g.done), ...shown.filter((g) => g.done)];

  return (
    <ToolScreen
      title="Metas"
      eyebrow="Vida personal"
      refreshing={legacy.isRefetching}
      onRefresh={() => legacy.refetch()}
      right={<Button small label="Nueva meta" icon={<Plus size={16} color={colors.onPrimary} />} onPress={() => setEditing('new')} disabled={!legacy.data} />}
    >
      {legacy.isPending ? (
        <Loading label="Cargando tus metas" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : goals.length === 0 ? (
        <EmptyState title="Aún no tienes metas" action={<Button small variant="secondary" label="Crear la primera" icon={<Plus size={16} color={colors.primary} />} onPress={() => setEditing('new')} />}>
          Ponle número a lo que quieres lograr («Publicar 8 videos», «Ahorrar 500») y súmale avances.
        </EmptyState>
      ) : (
        <>
          <Stats
            items={[
              { value: `${done}/${goals.length}`, label: 'Logradas' },
              { value: String(goals.length - done), label: 'En curso' },
            ]}
          />
          {next && (
            <View style={st.next} accessible accessibilityLabel={`Próxima fecha límite: ${next.title}, ${shortDay(next.deadline)}`}>
              <CalendarClock size={16} color={colors.inkMuted} />
              <T v="small" tint="muted" style={{ flex: 1 }}>
                Próxima: <T v="small" style={{ fontFamily: fonts.semibold }}>{next.title}</T> · {shortDay(next.deadline)}
              </T>
            </View>
          )}
          <DotChoices legend="Categoría" hideLegend value={filter} onChange={setFilter} options={FILTERS} />
          {ordered.length === 0 ? (
            <EmptyState title="Nada por aquí con este filtro" />
          ) : (
            ordered.map((g) => <GoalCard key={g.id} goal={g} today={today} onEdit={() => setEditing(g)} />)
          )}
        </>
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nueva meta' : 'Editar meta'}>
        {editing !== null && <GoalForm goal={editing === 'new' ? null : editing} today={today} category={filter === 'todas' ? 'personal' : filter} onDone={() => setEditing(null)} />}
      </Sheet>
    </ToolScreen>
  );
}

function GoalCard({ goal: g, today, onEdit }: { goal: LegacyGoal; today: Day; onEdit: () => void }) {
  const { colors } = useTheme();
  const actions = useModule('goals');
  const cat = GOAL_CATEGORY_INFO[goalCategoryOf(g)];
  const title = g.title || 'Sin título';
  const pct = goalPercent(g);
  const current = num(g.current);
  const target = num(g.target, 1);
  const due = g.done ? null : goalDeadlineLabel(g.deadline, today);
  return (
    <Card style={[st.card, { borderLeftColor: cat.color }, g.done && { opacity: 0.8 }]}>
      <View style={st.head}>
        <View style={st.cat} accessible accessibilityLabel={`Categoría: ${cat.label}`}>
          <Dot color={cat.color} />
          <T v="small" tint="muted" style={{ fontFamily: fonts.medium }}>
            {cat.label}
          </T>
        </View>
        <IconButton label={`Editar «${title}»`} onPress={onEdit} style={{ marginRight: -space[2], marginTop: -space[2] }}>
          <Pencil size={18} color={colors.inkMuted} />
        </IconButton>
      </View>
      <T v="heading" accessibilityRole="header" style={[{ fontSize: 19, lineHeight: 24, marginTop: -space[3] }, g.done && { textDecorationLine: 'line-through', color: colors.inkMuted }]}>
        {title}
      </T>
      <View style={st.count} accessible accessibilityLabel={`${current} de ${target}${g.unit ? ` ${g.unit}` : ''}`}>
        <T v="title" style={{ fontVariant: ['tabular-nums'] }}>
          {current}
        </T>
        <T v="body" tint="muted">
          de {target}
          {g.unit ? ` ${g.unit}` : ''}
        </T>
      </View>
      <View style={st.meterRow}>
        <View style={{ flex: 1 }}>
          <Meter value={pct} color={cat.color} label={`Progreso de ${title}`} />
        </View>
        <T v="small" style={{ fontFamily: fonts.semibold, fontVariant: ['tabular-nums'] }}>
          {pct} %
        </T>
      </View>
      <View style={st.meta}>
        <CalendarClock size={15} color={due?.late ? colors.danger : colors.inkSubtle} />
        <T v="small" tint={due?.late ? 'danger' : 'muted'}>
          {g.done ? '¡Lograda!' : (due?.text ?? 'Sin fecha límite')}
        </T>
      </View>
      <View style={st.actions}>
        <Button small variant="secondary" label="1" accessibilityLabel={`Restar 1 a «${title}»`} icon={<Minus size={16} color={colors.primary} />} onPress={() => actions.update(g.id, goalStep(g, -1))} disabled={current <= 0} />
        <Button small variant="secondary" label="1" accessibilityLabel={`Sumar 1 a «${title}»`} icon={<Plus size={16} color={colors.primary} />} onPress={() => actions.update(g.id, goalStep(g, 1))} />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: !!g.done }}
          accessibilityLabel={`Lograda: «${title}»`}
          onPress={() => actions.update(g.id, goalToggleDone(g))}
          style={({ pressed }) => [
            st.doneBtn,
            { borderColor: g.done ? cat.color : colors.lineStrong, backgroundColor: g.done ? `${cat.color}24` : colors.surface },
            pressed && { opacity: 0.8 },
          ]}
        >
          <Check size={16} strokeWidth={2.5} color={g.done ? colors.ink : colors.primary} />
          <T v="label" style={{ color: g.done ? colors.ink : colors.primary }}>
            Lograda
          </T>
        </Pressable>
      </View>
    </Card>
  );
}

function GoalForm({ goal, today, category: initialCategory, onDone }: { goal: LegacyGoal | null; today: Day; category: GoalCategory; onDone: () => void }) {
  const actions = useModule('goals');
  const [title, setTitle] = useState(goal?.title ?? '');
  const [target, setTarget] = useState(String(goal ? num(goal.target, 10) : 10));
  const [current, setCurrent] = useState(String(goal ? num(goal.current) : 0));
  const [unit, setUnit] = useState(goal?.unit ?? '');
  const [deadline, setDeadline] = useState<Day | ''>(goal && isDay(goal.deadline) ? goal.deadline : '');
  const [category, setCategory] = useState<GoalCategory>(goal ? goalCategoryOf(goal) : initialCategory);
  const t = Number(target);
  const c = Number(current);
  const targetOk = target.trim() !== '' && Number.isInteger(t) && t >= 1 && t <= 1e9;
  const currentOk = current.trim() !== '' && Number.isInteger(c) && c >= 0 && c <= 1e9;

  const submit = () => {
    if (!title.trim() || !targetOk || !currentOk) return;
    // Como la app anterior, llegar a la meta la marca como lograda.
    const fields = { title: title.trim(), target: t, current: c, unit: unit.trim(), deadline, category, done: c >= t };
    if (goal) actions.update(goal.id, fields);
    else actions.add({ id: newId(), ...fields });
    onDone();
  };

  return (
    <ScrollView style={{ maxHeight: 620 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <Field label="Meta" value={title} onChangeText={setTitle} maxLength={200} placeholder="Publicar 8 videos" autoFocus={!goal} />
      <View style={st.pair}>
        <View style={{ flex: 1 }}>
          <Field label="Objetivo" value={target} onChangeText={setTarget} keyboardType="number-pad" maxLength={10} error={targetOk ? null : 'Un número entero, 1 o más.'} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Unidad (opcional)" value={unit} onChangeText={setUnit} maxLength={40} placeholder="videos, kg…" />
        </View>
      </View>
      <Field label="Llevas" value={current} onChangeText={setCurrent} keyboardType="number-pad" maxLength={10} error={currentOk ? null : 'Un número entero, 0 o más.'} />
      <DayStepper label="Fecha límite (opcional)" value={deadline} onChange={setDeadline} today={today} months optional={{ add: 'Poner fecha límite', remove: 'Quitar la fecha' }} />
      <DotChoices legend="Categoría" value={category} onChange={setCategory} options={GOAL_CATEGORIES.map((k) => ({ value: k, label: GOAL_CATEGORY_INFO[k].label, color: GOAL_CATEGORY_INFO[k].color }))} />
      <FormActions
        submitLabel={goal ? 'Guardar' : 'Añadir meta'}
        onSubmit={submit}
        disabled={!title.trim() || !targetOk || !currentOk}
        onDelete={
          goal
            ? () => {
                actions.remove(goal.id);
                onDone();
              }
            : undefined
        }
        confirm={`Se borrará «${goal?.title || 'esta meta'}» con su progreso.`}
      />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  card: { borderLeftWidth: 4 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space[2] },
  cat: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingTop: 2 },
  count: { flexDirection: 'row', alignItems: 'baseline', gap: space[2] },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  doneBtn: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: touchTarget, paddingHorizontal: space[4], borderRadius: radius.md, borderWidth: 1 },
  next: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: -space[3] },
  pair: { flexDirection: 'row', gap: space[3] },
});
