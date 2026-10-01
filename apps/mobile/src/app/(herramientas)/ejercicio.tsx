import { byDateDesc, isDay, shortDay, utcDayKey, workoutRoutine, workoutStats, WORKOUT_PLANS, type Day, type LegacyWorkout } from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { useRouter } from 'expo-router';
import { CalendarPlus, Check, Dumbbell, Plus, Trash2 } from 'lucide-react-native';
import { Fragment, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { CheckInNote, DayStepper, Dot, FormActions, IconButton, Pill, Stats, Suggestions, tint, ToolScreen } from '../../components/tools';
import { Button, Card, EmptyState, ErrorState, Field, Loading, SectionHeader, T } from '../../components/ui';
import { newId, useLegacyData, useLegacyList, useModule } from '../../lib/legacy';
import { useTheme } from '../../lib/theme';
import { useToast } from '../../lib/toast';

const HISTORY_MAX = 60;
const WORKOUT_COLOR = '#0FA968';
const PLAN_NAMES = WORKOUT_PLANS.map((p) => p.name);

export default function Exercise() {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const workouts = useLegacyList(legacy.data?.data, 'workouts');
  const actions = useModule('workouts');
  const routines = useModule('routines');
  const toast = useToast();
  const router = useRouter();
  // La app anterior guarda el día en UTC.
  const today = utcDayKey();
  const stats = useMemo(() => workoutStats(workouts, today), [workouts, today]);
  const history = useMemo(() => workouts.filter((w) => isDay(w.date)).sort(byDateDesc), [workouts]);
  const [editing, setEditing] = useState<LegacyWorkout | 'new' | null>(null);
  const doneToday = new Set(workouts.filter((w) => w.date === today).map((w) => w.plan));

  const log = (plan: string, minutes: number) => {
    actions.add({ id: newId(), date: today, plan, minutes });
    toast(`Entreno registrado: ${plan}, ${minutes} min.`);
  };
  // Como la app anterior: una rutina diaria a las 18:00.
  const schedule = (plan: string) => {
    routines.add(workoutRoutine(newId(), plan));
    toast(`«${plan}» añadido a tu Rutina, todos los días a las 18:00.`, { action: { label: 'Ver rutina', run: () => router.push('/rutina') } });
  };
  const remove = (w: LegacyWorkout) => {
    const order = workouts.map((x) => x.id);
    actions.remove(w.id);
    toast('Entreno eliminado.', {
      action: {
        label: 'Deshacer',
        run: () => {
          actions.add(w);
          actions.reorder(order);
        },
      },
    });
  };

  return (
    <ToolScreen
      title="Ejercicio"
      eyebrow="Salud"
      refreshing={legacy.isRefetching}
      onRefresh={() => legacy.refetch()}
      right={<Button small label="Registrar entreno" icon={<Plus size={16} color={colors.onPrimary} />} onPress={() => setEditing('new')} disabled={!legacy.data} />}
    >
      {legacy.isPending ? (
        <Loading label="Cargando tus entrenos" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : (
        <>
          <Stats
            items={[
              { value: String(stats.weekCount), label: stats.weekCount === 1 ? 'Entreno esta semana' : 'Entrenos esta semana' },
              { value: `${stats.weekMinutes} min`, label: 'Esta semana' },
              { value: String(stats.streak), label: stats.streak === 1 ? 'Día seguido' : 'Días seguidos' },
            ]}
          />
          <View style={{ gap: space[3] }}>
            <SectionHeader title="Planes" />
            {WORKOUT_PLANS.map((p) => (
              <Card key={p.name} style={{ gap: space[3] }}>
                <View style={st.plan}>
                  <View style={[st.planIcon, { backgroundColor: tint(WORKOUT_COLOR, colors.surface, 0.16) }]}>
                    <Dumbbell size={20} color={colors.ink} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T v="label" accessibilityRole="header">
                      {p.name}
                    </T>
                    <T v="small" tint="muted">
                      {p.minutes} min · {p.detail}
                    </T>
                  </View>
                </View>
                <View style={st.planActions}>
                  <Button small variant="secondary" label={doneToday.has(p.name) ? 'Otra vez' : 'Hecho hoy'} accessibilityLabel={`Hecho hoy: ${p.name}`} icon={<Check size={16} color={colors.primary} />} onPress={() => log(p.name, p.minutes)} />
                  <Button small variant="ghost" label="Agendar" accessibilityLabel={`Agendar ${p.name} en tu Rutina`} icon={<CalendarPlus size={16} color={colors.primary} />} onPress={() => schedule(p.name)} />
                </View>
              </Card>
            ))}
          </View>
          <View style={{ gap: space[3] }}>
            <SectionHeader title="Historial" right={<Pill a11yLabel={`${stats.total} en total`}>{String(stats.total)}</Pill>} />
            {history.length === 0 ? (
              <EmptyState title="Aún no hay entrenos">Marca un plan como hecho o registra tu propio entreno.</EmptyState>
            ) : (
              <Card style={{ paddingVertical: space[1], gap: 0 }}>
                {history.slice(0, HISTORY_MAX).map((w, i) => {
                  const label = `${w.plan || 'Entreno'} del ${shortDay(w.date)}`;
                  return (
                    <Fragment key={w.id}>
                      {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 22 }} />}
                      <View style={st.row}>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Editar ${label}`} onPress={() => setEditing(w)} style={({ pressed }) => [st.rowHit, pressed && { opacity: 0.7 }]}>
                          <Dot color={WORKOUT_COLOR} />
                          <View style={{ flex: 1 }}>
                            <T v="label">{w.plan || 'Entreno'}</T>
                            <T v="small" tint="muted">
                              {shortDay(w.date)}
                              {w.date === today ? ' · hoy' : ''} · {typeof w.minutes === 'number' ? `${w.minutes} min` : 'sin duración'}
                            </T>
                          </View>
                        </Pressable>
                        <IconButton label={`Borrar ${label}`} onPress={() => remove(w)} style={{ marginRight: -space[2] }}>
                          <Trash2 size={18} color={colors.inkMuted} />
                        </IconButton>
                      </View>
                    </Fragment>
                  );
                })}
              </Card>
            )}
            {history.length > HISTORY_MAX && (
              <T v="small" tint="muted">
                Se muestran los {HISTORY_MAX} más recientes.
              </T>
            )}
          </View>
          <CheckInNote>El check-in diario registra aparte tus minutos activos para el pilar Movimiento; estos entrenos aún no cambian tu puntuación.</CheckInNote>
        </>
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Registrar entreno' : 'Editar entreno'}>
        {editing !== null && <WorkoutForm workout={editing === 'new' ? null : editing} today={today} onDone={() => setEditing(null)} />}
      </Sheet>
    </ToolScreen>
  );
}

function WorkoutForm({ workout, today, onDone }: { workout: LegacyWorkout | null; today: Day; onDone: () => void }) {
  const actions = useModule('workouts');
  const [plan, setPlan] = useState(workout?.plan ?? '');
  const [minutes, setMinutes] = useState(String(workout?.minutes ?? 30));
  const [date, setDate] = useState<Day>(workout?.date ?? today);
  const m = Number(minutes);
  const minutesOk = minutes.trim() !== '' && Number.isInteger(m) && m >= 1 && m <= 1440;
  const submit = () => {
    if (!plan.trim() || !minutesOk || !date) return;
    const fields = { plan: plan.trim(), minutes: m, date };
    if (workout) actions.update(workout.id, fields);
    else actions.add({ id: newId(), ...fields });
    onDone();
  };
  return (
    <ScrollView style={{ maxHeight: 620 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <Field label="Entreno" value={plan} onChangeText={setPlan} maxLength={120} placeholder="Full body, correr, yoga…" autoFocus={!workout} />
      <Suggestions field="Entreno" values={PLAN_NAMES} current={plan} onPick={setPlan} />
      <Field label="Minutos" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" maxLength={4} error={minutesOk ? null : 'Entre 1 y 1440 minutos.'} />
      <DayStepper label="Fecha" value={date} onChange={(d) => d && setDate(d)} today={today} />
      <FormActions
        submitLabel={workout ? 'Guardar' : 'Registrar'}
        onSubmit={submit}
        disabled={!plan.trim() || !minutesOk || !date}
        onDelete={
          workout
            ? () => {
                actions.remove(workout.id);
                onDone();
              }
            : undefined
        }
        confirm="Se borrará este entreno."
      />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  plan: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  planIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  planActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  rowHit: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: touchTarget + 8, paddingVertical: space[2] },
});
