import {
  CALENDAR_MARKS,
  calendarCycleDays,
  calendarMarks,
  describeCalendarDay,
  legacyList,
  localDayKey,
  longDay,
  looseList,
  monthLabel,
  monthWeeks,
  PERIOD_COLOR,
  PERIOD_FLOW_INFO,
  PREDICTED_PERIOD_COLOR,
  REMINDER_COLORS,
  WEEK_HEAD,
  type CalendarGoal,
  type CalendarJournal,
  type CalendarMark,
  type CalendarWorkout,
  type Day,
  type LegacyData,
  type LegacyReminder,
} from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { useRouter } from 'expo-router';
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { ColorSwatches, Dot, IconButton, MonthNav, Stepper, Toggle, ToolScreen } from '../../components/tools';
import { Button, Card, ErrorState, Field, Loading, T, fonts } from '../../components/ui';
import { useAuth } from '../../lib/api';
import { newId, useLegacyData, useLegacyList, useModule } from '../../lib/legacy';
import { useTheme } from '../../lib/theme';

/** Colores de las marcas, los mismos que en la web. */
function useMarkColors(): Record<CalendarMark, string> {
  const { colors } = useTheme();
  return { event: colors.terracotta, workout: '#0FA968', goal: '#4F7CFF', journal: '#8B5CF6', period: PERIOD_COLOR, predicted: PREDICTED_PERIOD_COLOR };
}

export default function Calendar() {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const session = useAuth();
  const showCycle = session.status === 'signedIn' && !!session.user.showCycle;
  // Como la app anterior, el calendario usa el día local del teléfono.
  const today = localDayKey(new Date());
  const [month, setMonth] = useState<Day>(`${today.slice(0, 7)}-01`);
  const [selected, setSelected] = useState<Day>(today);
  const [editing, setEditing] = useState<LegacyReminder | 'new' | null>(null);
  const data = legacy.data?.data;
  const reminders = useLegacyList(data, 'reminders');
  const markColor = useMarkColors();

  const cycleDays = useMemo(() => calendarCycleDays(data, month, today, showCycle), [data, month, today, showCycle]);
  const marks = useMemo(() => calendarMarks(data, month, cycleDays), [data, month, cycleDays]);
  const weeks = monthWeeks(month);

  const go = (m: Day) => {
    setMonth(m);
    setSelected(m.slice(0, 7) === today.slice(0, 7) ? today : m);
  };

  return (
    <ToolScreen
      title="Calendario"
      refreshing={legacy.isRefetching}
      onRefresh={() => legacy.refetch()}
      right={<Button small label="Nuevo evento" icon={<Plus size={16} color={colors.onPrimary} />} onPress={() => setEditing('new')} disabled={!legacy.data} />}
    >
      {legacy.isPending ? (
        <Loading label="Cargando tu calendario" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : (
        <>
          <Card style={{ paddingHorizontal: space[3] }}>
            <MonthNav month={month} current={today} onChange={go} />
            <View style={s.week} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              {WEEK_HEAD.map(([short, long]) => (
                <T key={long} v="small" tint="subtle" style={[s.cell, { textAlign: 'center', fontFamily: fonts.medium }]}>
                  {short}
                </T>
              ))}
            </View>
            <View accessibilityLabel={`${monthLabel(month)}. Elige un día para ver lo que tiene.`}>
              {weeks.map((w, i) => (
                <View key={i} style={s.week}>
                  {w.map((d, j) => {
                    if (!d) return <View key={j} style={s.cell} />;
                    const isSel = d === selected;
                    const isToday = d === today;
                    const dayMarks = [...(marks.get(d) ?? [])];
                    return (
                      <View key={j} style={s.cell}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSel }}
                          accessibilityLabel={`${isToday ? 'Hoy, ' : ''}${longDay(d)}${describeCalendarDay(d, marks, reminders)}`}
                          onPress={() => setSelected(d)}
                          style={({ pressed }) => [
                            s.day,
                            isSel && { backgroundColor: colors.primary },
                            !isSel && isToday && { borderColor: colors.primary, borderWidth: 1.5 },
                            pressed && { opacity: 0.7 },
                          ]}
                        >
                          <T v="label" style={{ fontVariant: ['tabular-nums'], color: isSel ? colors.onPrimary : isToday ? colors.primary : colors.ink, fontFamily: isToday || isSel ? fonts.semibold : fonts.medium }}>
                            {Number(d.slice(8))}
                          </T>
                          <View style={s.marks}>
                            {dayMarks.slice(0, 4).map((k) => (
                              <View key={k} style={[s.mark, { backgroundColor: markColor[k], borderColor: isSel ? colors.onPrimary : 'transparent' }]} />
                            ))}
                          </View>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
            <View style={s.legend} accessibilityLabel="Leyenda">
              {(Object.keys(CALENDAR_MARKS) as CalendarMark[])
                .filter((k) => showCycle || (k !== 'period' && k !== 'predicted'))
                .map((k) => (
                  <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Dot color={markColor[k]} size={8} />
                    <T v="small" tint="muted">
                      {CALENDAR_MARKS[k]}
                    </T>
                  </View>
                ))}
            </View>
          </Card>
          <DayPanel day={selected} data={legacy.data.data} reminders={reminders} onEdit={setEditing} cycle={showCycle ? { period: cycleDays.period.has(selected), predicted: cycleDays.predicted.has(selected) } : null} />
        </>
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo evento' : 'Editar evento'}>
        {editing !== null && <EventForm event={editing === 'new' ? null : editing} day={Number(selected.slice(8))} onDone={() => setEditing(null)} />}
      </Sheet>
    </ToolScreen>
  );
}

function DayPanel({
  day,
  data,
  reminders,
  onEdit,
  cycle,
}: {
  day: Day;
  data: LegacyData;
  reminders: LegacyReminder[];
  onEdit: (r: LegacyReminder) => void;
  cycle: { period: boolean; predicted: boolean } | null;
}) {
  const { colors } = useTheme();
  const markColor = useMarkColors();
  const actions = useModule('reminders');
  const dayNum = Number(day.slice(8));
  const events = reminders.filter((r) => r.day === dayNum);
  const workouts = looseList<CalendarWorkout>(data, 'workouts').filter((w) => w.date === day);
  const goals = looseList<CalendarGoal>(data, 'goals').filter((g) => g.deadline === day);
  const journal = looseList<CalendarJournal>(data, 'journal').filter((j) => j.date === day);
  const periodDay = cycle?.period ? legacyList(data, 'period').find((p) => p.date === day) : undefined;
  const empty = !events.length && !workouts.length && !goals.length && !journal.length && !cycle?.period && !cycle?.predicted;

  return (
    <Card>
      <View style={{ gap: 2 }}>
        <T v="heading" accessibilityRole="header">
          {longDay(day)}
        </T>
        <T v="small" tint="muted">
          Los eventos se repiten cada mes en el mismo día, como en la app anterior.
        </T>
      </View>
      {empty ? (
        <T v="body" tint="muted">
          Nada este día.
        </T>
      ) : (
        <View style={{ gap: space[1] }}>
          {events.map((r) => (
            <View key={r.id} style={[s.item, r.on === false && { opacity: 0.6 }]}>
              <Dot color={r.color} size={12} />
              <View style={{ flex: 1 }}>
                <T v="label">{r.title}</T>
                <T v="small" tint="muted">
                  {r.when ? `${r.when} · ` : ''}día {r.day} de cada mes{r.on === false ? ' · desactivado' : ''}
                </T>
              </View>
              <Toggle label={`Activo: «${r.title}»`} value={r.on !== false} onChange={() => actions.update(r.id, { on: r.on === false })} />
              <IconButton label={`Editar «${r.title}»`} onPress={() => onEdit(r)}>
                <Pencil size={18} color={colors.inkMuted} />
              </IconButton>
              <IconButton label={`Borrar «${r.title}»`} onPress={() => actions.remove(r.id)}>
                <Trash2 size={18} color={colors.inkMuted} />
              </IconButton>
            </View>
          ))}
          {workouts.map((w, i) => (
            <ReadOnlyItem key={`w${i}`} color={markColor.workout} title={`Entreno${typeof w.plan === 'string' && w.plan ? `: ${w.plan}` : ''}`} meta={typeof w.minutes === 'number' ? `${w.minutes} min` : undefined} />
          ))}
          {goals.map((g, i) => (
            <ReadOnlyItem key={`g${i}`} color={markColor.goal} title={`Meta: ${String(g.title ?? '')}`} meta="Fecha límite" />
          ))}
          {cycle?.period && (
            <ReadOnlyItem color={markColor.period} title="Regla" meta={`Flujo ${(PERIOD_FLOW_INFO[periodDay?.flow as keyof typeof PERIOD_FLOW_INFO] ?? PERIOD_FLOW_INFO.medium).label.toLowerCase()}`} cycleLink />
          )}
          {cycle?.predicted && <ReadOnlyItem color={markColor.predicted} title="Regla prevista" meta="Estimación, no consejo médico" cycleLink />}
          {journal.map((j, i) => (
            <ReadOnlyItem key={`j${i}`} color={markColor.journal} title={`Diario ${typeof j.mood === 'string' ? j.mood : ''}`.trim()} meta={typeof j.note === 'string' && j.note ? j.note : undefined} />
          ))}
        </View>
      )}
    </Card>
  );
}

function ReadOnlyItem({ color, title, meta, cycleLink }: { color: string; title: string; meta?: string; cycleLink?: boolean }) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <View style={s.item}>
      <Dot color={color} size={12} />
      <View style={{ flex: 1 }}>
        <T v="label">{title}</T>
        {meta && (
          <T v="small" tint="muted" numberOfLines={2}>
            {meta}
          </T>
        )}
      </View>
      {cycleLink && (
        <Pressable accessibilityRole="button" accessibilityLabel="Ver en Ciclo" onPress={() => router.push('/ciclo')} style={({ pressed }) => [s.link, pressed && { opacity: 0.7 }]}>
          <T v="small" tint="primary" style={{ fontFamily: fonts.medium }}>
            Ver en Ciclo
          </T>
          <ChevronRight size={14} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

function EventForm({ event, day: initialDay, onDone }: { event: LegacyReminder | null; day: number; onDone: () => void }) {
  const actions = useModule('reminders');
  const [title, setTitle] = useState(event?.title ?? '');
  const [when, setWhen] = useState(event?.when ?? '');
  const [day, setDay] = useState(event?.day ?? initialDay);
  const [color, setColor] = useState<string>(event?.color && (REMINDER_COLORS as readonly string[]).includes(event.color) ? event.color : REMINDER_COLORS[0]);

  const submit = () => {
    const fields = { title: title.trim(), when: when.trim(), day, color };
    if (event) actions.update(event.id, fields);
    else actions.add({ id: newId(), ...fields, icon: 'doc', on: true });
    onDone();
  };

  return (
    <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <Field label="Título" value={title} onChangeText={setTitle} maxLength={200} placeholder="Dentista" autoFocus={!event} />
      <Field label="Hora o nota (opcional)" value={when} onChangeText={setWhen} maxLength={60} placeholder="14:00" />
      <View style={{ flexDirection: 'row' }}>
        <Stepper
          label="Día del mes"
          value={String(day)}
          onDec={() => setDay((d) => Math.max(1, d - 1))}
          onInc={() => setDay((d) => Math.min(31, d + 1))}
          decDisabled={day <= 1}
          incDisabled={day >= 31}
          decLabel="Un día antes"
          incLabel="Un día después"
          hint={`Se repite el día ${day} de cada mes.`}
        />
      </View>
      <ColorSwatches legend="Color" colors={REMINDER_COLORS} value={color} onChange={setColor} />
      <Button label={event ? 'Guardar' : 'Añadir evento'} onPress={submit} disabled={!title.trim()} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  week: { flexDirection: 'row' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2 },
  day: { width: touchTarget, height: touchTarget + 4, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 2 },
  marks: { flexDirection: 'row', gap: 3, height: 6 },
  mark: { width: 6, height: 6, borderRadius: 3, borderWidth: 0 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[4], rowGap: space[1], justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: touchTarget + 4 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: touchTarget, paddingHorizontal: space[1] },
});
