import {
  byTime,
  daysLabel,
  HHMM_RE,
  isoDay,
  localTime,
  MEAL_LABELS,
  normalizeHHMM,
  onWeekday,
  optionsWith,
  ROUTINE_DAY_FILTERS,
  utcDayKey,
  waterToday,
  WATER_GOAL_DEFAULT,
  weekdaysOf,
  type LegacyMeal,
  type LegacyRoutine,
} from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { GlassWater, Minus, Pencil, Plus } from 'lucide-react-native';
import { Fragment, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { CheckInNote, DotChoices, FormActions, IconButton, Meter, Stepper, TimeField, Toggle, ToolScreen, WeekdayPicker } from '../../components/tools';
import { Button, Card, EmptyState, ErrorState, Field, Loading, T, fonts } from '../../components/ui';
import { newId, useLegacyData, useLegacyList, useLegacyObject, useModule, useModuleObject } from '../../lib/legacy';
import { useTheme } from '../../lib/theme';

const WATER_COLOR = '#4F7CFF';

export default function Routine() {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const routines = useLegacyList(legacy.data?.data, 'routines');
  const meals = useLegacyList(legacy.data?.data, 'meals');
  const [day, setDay] = useState<number>(isoDay());
  const [editing, setEditing] = useState<LegacyRoutine | 'new' | null>(null);
  const [meal, setMeal] = useState<LegacyMeal | 'new' | null>(null);
  // Comidas y agua van por día en UTC, como la app anterior.
  const today = utcDayKey();
  const shown = useMemo(() => routines.filter((r) => day === 0 || onWeekday(r.days, day)).sort(byTime), [routines, day]);
  const todayMeals = useMemo(() => meals.filter((m) => m.dateKey === today).sort(byTime), [meals, today]);
  const filter = ROUTINE_DAY_FILTERS.find((f) => f.iso === day) ?? ROUTINE_DAY_FILTERS[0];

  return (
    <ToolScreen
      title="Rutina"
      eyebrow="Salud"
      refreshing={legacy.isRefetching}
      onRefresh={() => legacy.refetch()}
      right={<Button small label="Nueva rutina" icon={<Plus size={16} color={colors.onPrimary} />} onPress={() => setEditing('new')} disabled={!legacy.data} />}
    >
      {legacy.isPending ? (
        <Loading label="Cargando tu rutina" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : (
        <>
          <View style={{ gap: space[3] }}>
            <View accessibilityRole="radiogroup" accessibilityLabel="Día de la semana" style={st.days}>
              {ROUTINE_DAY_FILTERS.map((f) => {
                const on = f.iso === day;
                return (
                  <Pressable
                    key={f.iso}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={f.long}
                    onPress={() => setDay(f.iso)}
                    style={[st.dayChip, f.iso === 0 && { flex: 1.5 }, { borderColor: on ? colors.primary : colors.lineStrong, backgroundColor: on ? colors.primary : colors.surface }]}
                  >
                    <T v="small" style={{ fontFamily: fonts.semibold, color: on ? colors.onPrimary : colors.inkMuted }}>
                      {f.short}
                    </T>
                  </Pressable>
                );
              })}
            </View>
            <Card style={{ paddingVertical: space[3] }}>
              <T v="heading" accessibilityRole="header">
                {day === 0 ? 'Todas tus rutinas' : `Rutinas del ${filter.long.toLowerCase()}${day === isoDay() ? ' (hoy)' : ''}`}
              </T>
              {routines.length === 0 ? (
                <EmptyState title="Aún no tienes rutinas" action={<Button small variant="secondary" label="Crear la primera" icon={<Plus size={16} color={colors.primary} />} onPress={() => setEditing('new')} />}>
                  Tus hábitos con hora fija: despertar, tomar vitaminas, entrenar, leer antes de dormir.
                </EmptyState>
              ) : shown.length === 0 ? (
                <T v="body" tint="muted">
                  Nada este día.
                </T>
              ) : (
                <View>
                  {shown.map((r, i) => (
                    <Fragment key={r.id}>
                      {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />}
                      <RoutineRow routine={r} onEdit={() => setEditing(r)} />
                    </Fragment>
                  ))}
                </View>
              )}
            </Card>
          </View>
          <WaterCard today={today} />
          <Card>
            <View style={st.head}>
              <T v="heading" accessibilityRole="header" style={{ flex: 1 }}>
                Comidas de hoy
              </T>
              <Button small variant="link" label="Añadir" accessibilityLabel="Añadir comida" icon={<Plus size={16} color={colors.primary} />} onPress={() => setMeal('new')} />
            </View>
            {todayMeals.length === 0 ? (
              <T v="small" tint="muted">
                Aún no has anotado comidas hoy.
              </T>
            ) : (
              <View>
                {todayMeals.map((m, i) => (
                  <Fragment key={m.id}>
                    {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />}
                    <MealRow meal={m} onEdit={() => setMeal(m)} />
                  </Fragment>
                ))}
              </View>
            )}
          </Card>
          <CheckInNote>El check-in diario registra aparte tus vasos de agua y tu alimentación para el pilar Alimentación.</CheckInNote>
          <T v="small" tint="muted">
            Los avisos con sonido de la app anterior todavía no están en la app nueva: aquí organizas tus rutinas y ves qué toca cada día.
          </T>
        </>
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nueva rutina' : 'Editar rutina'}>
        {editing !== null && <RoutineForm routine={editing === 'new' ? null : editing} day={day} onDone={() => setEditing(null)} />}
      </Sheet>
      <Sheet open={meal !== null} onClose={() => setMeal(null)} title={meal === 'new' ? 'Nueva comida' : 'Editar comida'}>
        {meal !== null && <MealForm meal={meal === 'new' ? null : meal} today={today} onDone={() => setMeal(null)} />}
      </Sheet>
    </ToolScreen>
  );
}

function RoutineRow({ routine: r, onEdit }: { routine: LegacyRoutine; onEdit: () => void }) {
  const { colors } = useTheme();
  const actions = useModule('routines');
  const title = r.title || 'Sin título';
  const off = r.enabled === false;
  return (
    <View style={[st.row, off && { opacity: 0.6 }]}>
      <T v="label" style={st.time}>
        {r.time || '--:--'}
      </T>
      <View style={{ flex: 1 }}>
        <T v="label">{title}</T>
        <T v="small" tint="muted">
          {daysLabel(weekdaysOf(r.days))}
          {off ? ' · desactivada' : ''}
        </T>
      </View>
      <Toggle label={`Activa: «${title}»`} value={!off} onChange={() => actions.update(r.id, { enabled: off })} />
      <IconButton label={`Editar «${title}»`} onPress={onEdit} style={{ marginRight: -space[2] }}>
        <Pencil size={18} color={colors.inkMuted} />
      </IconButton>
    </View>
  );
}

function WaterCard({ today }: { today: string }) {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const log = useLegacyObject(legacy.data?.data, 'dayLog', today);
  const actions = useModuleObject('dayLog');
  const water = waterToday(log, today);
  const goal = typeof log.waterGoal === 'number' && log.waterGoal >= 1 && log.waterGoal <= 40 ? log.waterGoal : WATER_GOAL_DEFAULT;
  // Si el registro es de otro día, empieza en 0 (como la app anterior en el primer cambio).
  const set = (n: number) => actions.patch({ dateKey: today, water: Math.max(0, Math.min(40, n)) });
  const pct = Math.min(100, Math.round((water / goal) * 100));
  return (
    <Card>
      <View style={st.head}>
        <GlassWater size={18} color={WATER_COLOR} />
        <T v="heading" accessibilityRole="header">
          Agua de hoy
        </T>
      </View>
      <View style={st.count} accessible accessibilityLabel={`${water} de ${goal} vasos`} accessibilityLiveRegion="polite">
        <T v="display" style={{ fontVariant: ['tabular-nums'] }}>
          {water}
        </T>
        <T v="body" tint="muted">
          de {goal} {goal === 1 ? 'vaso' : 'vasos'}
        </T>
      </View>
      <Meter value={pct} label="Agua de hoy" color={WATER_COLOR} />
      <View style={st.waterActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quitar un vaso"
          accessibilityState={{ disabled: water <= 0 }}
          disabled={water <= 0}
          onPress={() => set(water - 1)}
          style={({ pressed }) => [st.minus, { borderColor: colors.lineStrong, backgroundColor: colors.surface, opacity: water <= 0 ? 0.45 : pressed ? 0.85 : 1 }]}
        >
          <Minus size={18} color={colors.primary} />
        </Pressable>
        <Button label="Un vaso" icon={<Plus size={18} color={colors.onPrimary} />} onPress={() => set(water + 1)} disabled={water >= 40} style={{ flex: 1 }} />
      </View>
      <View style={{ flexDirection: 'row' }}>
        <Stepper
          label="Meta diaria"
          value={`${goal} ${goal === 1 ? 'vaso' : 'vasos'}`}
          onDec={() => actions.patch({ waterGoal: Math.max(1, goal - 1) })}
          onInc={() => actions.patch({ waterGoal: Math.min(40, goal + 1) })}
          decDisabled={goal <= 1}
          incDisabled={goal >= 40}
          decLabel="Un vaso menos de meta"
          incLabel="Un vaso más de meta"
        />
      </View>
    </Card>
  );
}

// Tocar la comida la edita; borrar está en la hoja, con confirmación (como la web).
function MealRow({ meal: m, onEdit }: { meal: LegacyMeal; onEdit: () => void }) {
  const label = `${m.label || 'Comida'}${m.time ? ` de las ${m.time}` : ''}`;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Editar ${label}`} accessibilityHint={m.note || undefined} onPress={onEdit} style={({ pressed }) => [st.row, { minHeight: touchTarget + 8 }, pressed && { opacity: 0.7 }]}>
      <T v="small" tint="muted" style={st.time}>
        {m.time || '—'}
      </T>
      <View style={{ flex: 1 }}>
        <T v="label">{m.label || 'Comida'}</T>
        {m.note ? (
          <T v="small" tint="muted">
            {m.note}
          </T>
        ) : null}
      </View>
    </Pressable>
  );
}

function RoutineForm({ routine, day, onDone }: { routine: LegacyRoutine | null; day: number; onDone: () => void }) {
  const actions = useModule('routines');
  const [title, setTitle] = useState(routine?.title ?? '');
  const [time, setTime] = useState(routine?.time ?? '08:00');
  // Una rutina nueva desde un día concreto empieza en todos los días (como la app anterior).
  const [days, setDays] = useState(weekdaysOf(routine?.days));
  const hhmm = normalizeHHMM(time);
  const valid = !!title.trim() && HHMM_RE.test(hhmm);
  const submit = () => {
    if (!valid) return;
    const fields = { title: title.trim(), time: hhmm, days };
    if (routine) actions.update(routine.id, fields);
    else actions.add({ id: newId(), ...fields, icon: 'bell', sound: true, enabled: true });
    onDone();
  };
  return (
    <ScrollView style={{ maxHeight: 620 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <Field label="Qué haces" value={title} onChangeText={setTitle} maxLength={120} placeholder="Tomar vitaminas" autoFocus={!routine} />
      <TimeField label="Hora" value={time} onChange={setTime} />
      <WeekdayPicker legend="Días" value={days} onChange={setDays} hint={day && !days.includes(String(day)) ? `${daysLabel(days)} · no incluye el día que estás viendo` : undefined} />
      <FormActions
        submitLabel={routine ? 'Guardar' : 'Añadir rutina'}
        onSubmit={submit}
        disabled={!valid}
        onDelete={
          routine
            ? () => {
                actions.remove(routine.id);
                onDone();
              }
            : undefined
        }
        confirm={`Se borrará «${routine?.title || 'esta rutina'}».`}
      />
    </ScrollView>
  );
}

function MealForm({ meal, today, onDone }: { meal: LegacyMeal | null; today: string; onDone: () => void }) {
  const actions = useModule('meals');
  const [label, setLabel] = useState(meal?.label || 'Comida');
  const [time, setTime] = useState(meal?.time ?? localTime());
  const [note, setNote] = useState(meal?.note ?? '');
  const hhmm = normalizeHHMM(time);
  const timeOk = !hhmm || HHMM_RE.test(hhmm);
  const submit = () => {
    if (!timeOk) return;
    const fields = { label, time: hhmm, note: note.trim() };
    if (meal) actions.update(meal.id, fields);
    else actions.add({ id: newId(), ...fields, dateKey: today });
    onDone();
  };
  return (
    <ScrollView style={{ maxHeight: 620 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <DotChoices legend="Comida" value={label} onChange={setLabel} options={optionsWith(MEAL_LABELS, label).map((l) => ({ value: l, label: l }))} />
      <TimeField label="Hora (opcional)" value={time} onChange={setTime} optional />
      <Field label="Qué comiste (opcional)" value={note} onChangeText={setNote} maxLength={300} placeholder="Avena con fruta" />
      <FormActions
        submitLabel={meal ? 'Guardar' : 'Añadir comida'}
        onSubmit={submit}
        disabled={!timeOk}
        onDelete={
          meal
            ? () => {
                actions.remove(meal.id);
                onDone();
              }
            : undefined
        }
        confirm="Se borrará esta comida."
      />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  days: { flexDirection: 'row', gap: 4 },
  dayChip: { flex: 1, height: touchTarget, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: touchTarget + 12, paddingVertical: space[2] },
  time: { width: 52, fontVariant: ['tabular-nums'], fontFamily: fonts.semibold },
  count: { flexDirection: 'row', alignItems: 'baseline', gap: space[2] },
  waterActions: { flexDirection: 'row', gap: space[2] },
  minus: { width: touchTarget + 12, minHeight: touchTarget + 4, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
