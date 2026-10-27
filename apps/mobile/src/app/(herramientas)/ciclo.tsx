import {
  cycleInfo,
  cyclePredictions,
  daySpan,
  diffDays,
  isDay,
  localDayKey,
  longDay,
  monthEnd,
  monthWeeks,
  PERIOD_COLOR,
  PERIOD_FLOW_INFO,
  PERIOD_FLOWS,
  PERIOD_MOODS,
  PERIOD_SYMPTOMS,
  periodFlowOf,
  periodReminder,
  periodRuns,
  shortDay,
  splitTags,
  WEEK_HEAD,
  type Day,
  type LegacyPeriodDay,
} from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { useRouter } from 'expo-router';
import { CalendarPlus, Lock } from 'lucide-react-native';
import { Fragment, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Dot, MonthNav, MoodPicker, Stepper, tint, Toggle, ToolScreen } from '../../components/tools';
import { Button, Card, Chip, EmptyState, ErrorState, Field, Loading, Segmented, T, fonts } from '../../components/ui';
import { newId, useLegacyData, useLegacyList, useLegacyObject, useModule, useModuleObject } from '../../lib/legacy';
import { useShowCycle } from '../../lib/prefs';
import { useTheme } from '../../lib/theme';
import { useToast } from '../../lib/toast';
import { useAutosave } from '../../lib/tools';

const FLOW_OPTIONS = PERIOD_FLOWS.map((f) => ({ value: f, label: PERIOD_FLOW_INFO[f].label }));
type Status = 'predicted' | 'fertile' | null;

export default function Cycle() {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const period = useLegacyList(legacy.data?.data, 'period');
  const cycle = useLegacyObject(legacy.data?.data, 'cycle');
  const actions = useModule('period');
  // Ciclo y Calendario usan la fecha LOCAL, como la app anterior.
  const today = localDayKey(new Date());
  const [month, setMonth] = useState<Day>(`${today.slice(0, 7)}-01`);
  const [selected, setSelected] = useState<Day>(today);
  const byDate = useMemo(() => new Map(period.filter((p) => isDay(p.date)).map((p) => [p.date, p])), [period]);
  const info = useMemo(() => cycleInfo(period, cycle, today), [period, cycle, today]);
  const predicted = useMemo(() => cyclePredictions(info, cycle, `${month.slice(0, 7)}-01`, monthEnd(month), byDate.keys()), [info, cycle, month, byDate]);
  const runs = useMemo(() => periodRuns(period), [period]);

  const toggleDay = (d: Day) => {
    const p = byDate.get(d);
    if (p) actions.remove(p.id);
    else actions.add({ id: newId(), date: d, flow: 'medium', symptoms: '', mood: '', note: '' });
  };

  const describe = (d: Day) => {
    const p = byDate.get(d);
    if (p) return `: regla, flujo ${PERIOD_FLOW_INFO[periodFlowOf(p)].label.toLowerCase()}`;
    if (predicted.period.has(d)) return ': regla prevista';
    if (predicted.fertile.has(d)) return ': ventana fértil estimada';
    return '';
  };

  const changeMonth = (m: Day) => {
    setMonth(m);
    setSelected(m.slice(0, 7) === today.slice(0, 7) ? today : m);
  };

  const status: Status = predicted.period.has(selected) ? 'predicted' : predicted.fertile.has(selected) ? 'fertile' : null;

  return (
    <ToolScreen title="Ciclo" eyebrow="Salud" refreshing={legacy.isRefetching} onRefresh={() => legacy.refetch()}>
      {legacy.isPending ? (
        <Loading label="Cargando tu ciclo" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : (
        <>
          <PrivacyCard />
          {info ? (
            <Card style={{ gap: space[4] }}>
              <View accessible accessibilityLabel={`Día ${info.cycleDay} de tu ciclo actual`} style={{ alignItems: 'center' }}>
                <T v="display" style={{ fontVariant: ['tabular-nums'] }}>
                  Día {info.cycleDay}
                </T>
                <T v="small" tint="muted">
                  De tu ciclo actual
                </T>
              </View>
              <View style={[st.split, { borderTopColor: colors.line }]}>
                <Figure
                  value={info.daysUntilNext === 0 ? 'Hoy' : `En ${info.daysUntilNext} ${info.daysUntilNext === 1 ? 'día' : 'días'}`}
                  label={`Próximo periodo estimado · ${shortDay(info.nextStart)}`}
                />
                <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />
                <Figure value={daySpan(info.fertileStart, info.fertileEnd)} label="Ventana fértil estimada" />
              </View>
            </Card>
          ) : (
            <EmptyState title="Registra tu primer día de regla">Elige un día en el calendario y márcalo. Con tus registros y la duración de tu ciclo estimamos el próximo periodo.</EmptyState>
          )}
          <View style={[st.estimate, { backgroundColor: colors.surfaceSunken, borderLeftColor: '#F3A7BB' }]}>
            <T v="small" tint="muted">
              <T v="small" style={{ fontFamily: fonts.semibold }}>
                Es una estimación, no un consejo médico.
              </T>{' '}
              Se calcula con tus registros y la duración de tu ciclo, y no sirve como método anticonceptivo. Si algo te preocupa, consulta a un profesional de la salud.
            </T>
          </View>

          <Card style={{ paddingHorizontal: space[3] }}>
            <MonthNav month={month} current={today} onChange={changeMonth} />
            <View style={st.week} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              {WEEK_HEAD.map(([short, long]) => (
                <T key={long} v="small" tint="subtle" style={[st.cell, { textAlign: 'center', fontFamily: fonts.medium }]}>
                  {short}
                </T>
              ))}
            </View>
            <View accessibilityLabel="Elige un día para registrarlo o ver lo que tiene. Mantén pulsado un día para marcarlo o quitarlo como día de regla.">
              {monthWeeks(month).map((w, i) => (
                <View key={i} style={st.week}>
                  {w.map((d, j) => (
                    <View key={j} style={st.cell}>
                      {d && (
                        <CycleDay
                          day={d}
                          entry={byDate.get(d)}
                          predicted={predicted.period.has(d)}
                          fertile={predicted.fertile.has(d)}
                          isToday={d === today}
                          isSelected={d === selected}
                          label={`${d === today ? 'Hoy, ' : ''}${longDay(d)}${describe(d)}`}
                          onPress={() => setSelected(d)}
                          onLongPress={() => {
                            setSelected(d);
                            toggleDay(d);
                          }}
                        />
                      )}
                    </View>
                  ))}
                </View>
              ))}
            </View>
            <Legend />
          </Card>
          <DayPanel key={`${selected}-${byDate.get(selected)?.id ?? ''}`} day={selected} entry={byDate.get(selected)} status={status} onToggle={() => toggleDay(selected)} />
          <CycleSettings cycleLength={cycle.cycleLength} periodLength={cycle.periodLength} nextStart={info?.nextStart ?? null} />
          <Card>
            <T v="heading" accessibilityRole="header">
              Tus últimos periodos
            </T>
            {runs.length === 0 ? (
              <T v="small" tint="muted">
                Aún no hay periodos registrados.
              </T>
            ) : (
              <View>
                {runs.slice(0, 6).map((r, i) => {
                  const prev = runs[i + 1];
                  return (
                    <Fragment key={r.start}>
                      {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 22 }} />}
                      <View style={st.run} accessible>
                        <Dot color={PERIOD_FLOW_INFO.medium.color} size={10} />
                        <View style={{ flex: 1 }}>
                          <T v="label">{daySpan(r.start, r.end)}</T>
                          <T v="small" tint="muted">
                            {r.days} {r.days === 1 ? 'día' : 'días'}
                            {prev ? ` · ciclo de ${diffDays(prev.start, r.start)} días` : ''}
                          </T>
                        </View>
                      </View>
                    </Fragment>
                  );
                })}
              </View>
            )}
          </Card>
        </>
      )}
    </ToolScreen>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={{ flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: space[2] }}>
      <T v="title" style={{ fontSize: 24, lineHeight: 30, fontVariant: ['tabular-nums'], textAlign: 'center' }}>
        {value}
      </T>
      <T v="small" tint="muted" style={{ textAlign: 'center' }}>
        {label}
      </T>
    </View>
  );
}

function PrivacyCard() {
  const { colors } = useTheme();
  const { showCycle, setShowCycle } = useShowCycle();
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
        <Lock size={18} color={colors.ink} style={{ marginTop: 2 }} />
        <T v="small" tint="muted" style={{ flex: 1 }}>
          Tus registros de ciclo se guardan en tu cuenta de Design Your Core y se sincronizan con tus dispositivos y con la app anterior. No se comparten con tu pareja vinculada.
        </T>
      </View>
      <View style={[st.setting, { borderTopColor: colors.line }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="label">Mostrar Ciclo en el menú y en el Calendario</T>
          {!showCycle && (
            <T v="small" tint="muted">
              Ahora está oculto: llegas aquí desde Más.
            </T>
          )}
        </View>
        <Toggle label="Mostrar Ciclo en el menú y en el Calendario" value={showCycle} onChange={() => setShowCycle(!showCycle)} />
      </View>
    </Card>
  );
}

/** Un día del mes: regla registrada (con el color de su flujo), prevista (discontinua) o ventana fértil. */
function CycleDay({
  day,
  entry,
  predicted,
  fertile,
  isToday,
  isSelected,
  label,
  onPress,
  onLongPress,
}: {
  day: Day;
  entry: LegacyPeriodDay | undefined;
  predicted: boolean;
  fertile: boolean;
  isToday: boolean;
  isSelected: boolean;
  label: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { colors } = useTheme();
  const flow = entry ? PERIOD_FLOW_INFO[periodFlowOf(entry)].color : null;
  const look = flow
    ? { borderColor: flow, backgroundColor: tint(flow, colors.surface, 0.28) }
    : predicted
      ? { borderColor: tint(PERIOD_COLOR, colors.surface, 0.7), borderStyle: 'dashed' as const }
      : fertile
        ? { backgroundColor: tint(colors.success, colors.surface, 0.16) }
        : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={label}
      accessibilityHint={entry ? 'Mantén pulsado para quitarlo como día de regla.' : 'Mantén pulsado para marcarlo como día de regla.'}
      accessibilityActions={[{ name: 'longpress', label: entry ? 'Quitar día de regla' : 'Marcar como día de regla' }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'longpress' && onLongPress()}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [st.day, look, isSelected && { borderColor: colors.primary, borderStyle: 'solid' }, pressed && { opacity: 0.7 }]}
    >
      <T v="label" style={{ fontVariant: ['tabular-nums'], color: isToday ? colors.primary : colors.ink, fontFamily: isToday || entry ? fonts.semibold : fonts.medium }}>
        {Number(day.slice(8))}
      </T>
      {isToday && <View style={[st.todayBar, { backgroundColor: colors.primary }]} />}
    </Pressable>
  );
}

function Legend() {
  const { colors } = useTheme();
  const key = (style: object, label: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={[st.key, style]} />
      <T v="small" tint="muted">
        {label}
      </T>
    </View>
  );
  return (
    <View style={st.legend} accessibilityLabel="Leyenda">
      {key({ borderColor: PERIOD_FLOW_INFO.medium.color, backgroundColor: tint(PERIOD_FLOW_INFO.medium.color, colors.surface, 0.28) }, 'Regla')}
      {key({ borderColor: tint(PERIOD_COLOR, colors.surface, 0.7), borderStyle: 'dashed' }, 'Regla prevista')}
      {key({ borderColor: 'transparent', backgroundColor: tint(colors.success, colors.surface, 0.26) }, 'Ventana fértil estimada')}
    </View>
  );
}

function DayPanel({ day, entry, status, onToggle }: { day: Day; entry: LegacyPeriodDay | undefined; status: Status; onToggle: () => void }) {
  const actions = useModule('period');
  const symptoms = splitTags(entry?.symptoms);
  const note = useAutosave(entry?.note ?? '', (v) => entry && v !== entry.note && actions.update(entry.id, { note: v }), 400);
  const toggleSymptom = (sym: string) => {
    if (!entry) return;
    const next = symptoms.includes(sym) ? symptoms.filter((x) => x !== sym) : [...symptoms, sym];
    // Mismo formato que la app anterior: etiquetas en español separadas por comas.
    actions.update(entry.id, { symptoms: next.join(', ') });
  };
  return (
    <Card style={{ gap: space[4] }}>
      <View style={{ gap: 2 }}>
        <T v="heading" accessibilityRole="header">
          {longDay(day)}
        </T>
        <T v="small" tint="muted">
          {entry ? 'Día de regla registrado.' : status === 'predicted' ? 'Regla prevista (estimación).' : status === 'fertile' ? 'Ventana fértil estimada.' : 'Sin registro.'}
        </T>
      </View>
      {entry ? (
        <>
          <View style={{ gap: space[2] }}>
            <T v="label">Flujo</T>
            <Segmented label="Flujo" options={FLOW_OPTIONS} value={periodFlowOf(entry)} onChange={(flow) => actions.update(entry.id, { flow })} />
          </View>
          <View style={{ gap: space[2] }}>
            <T v="label">Síntomas</T>
            <View accessibilityLabel="Síntomas" style={st.chips}>
              {[...PERIOD_SYMPTOMS, ...symptoms.filter((x) => !(PERIOD_SYMPTOMS as readonly string[]).includes(x))].map((sym) => (
                <Chip key={sym} label={sym} selected={symptoms.includes(sym)} onPress={() => toggleSymptom(sym)} />
              ))}
            </View>
          </View>
          <MoodPicker legend="Ánimo" moods={PERIOD_MOODS} value={entry.mood ?? ''} onChange={(mood) => actions.update(entry.id, { mood })} />
          <Field label="Nota" multiline maxLength={2000} value={note.draft} onChangeText={note.change} onBlur={note.flush} placeholder="Cómo te sientes, medicación…" />
          <Pressable accessibilityRole="button" onPress={onToggle} style={({ pressed }) => [st.remove, pressed && { opacity: 0.7 }]}>
            <T v="label" tint="danger">
              Quitar día de regla
            </T>
          </Pressable>
        </>
      ) : (
        <Button label="Marcar como día de regla" onPress={onToggle} />
      )}
    </Card>
  );
}

function CycleSettings({ cycleLength, periodLength, nextStart }: { cycleLength: number; periodLength: number; nextStart: Day | null }) {
  const { colors } = useTheme();
  const actions = useModuleObject('cycle');
  const reminders = useModule('reminders');
  const toast = useToast();
  const router = useRouter();
  const [cycle, setCycle] = useState(cycleLength);
  const [length, setLength] = useState(periodLength);
  const changed = cycle !== cycleLength || length !== periodLength;

  const save = () => {
    actions.patch({ cycleLength: cycle, periodLength: length });
    toast('Duraciones guardadas.');
  };

  // Como la app anterior: un evento del Calendario el día del mes previsto.
  const remind = () => {
    if (!nextStart) return;
    const item = periodReminder(newId(), nextStart);
    reminders.add(item);
    toast(`Aviso añadido al Calendario el día ${item.day}. Los eventos se repiten cada mes: bórralo cuando pase.`, { action: { label: 'Ver calendario', run: () => router.push('/calendario') } });
  };

  return (
    <Card style={{ gap: space[4] }}>
      <T v="heading" accessibilityRole="header">
        Tu ciclo
      </T>
      <View style={{ flexDirection: 'row' }}>
        <Stepper
          label="Duración del ciclo"
          value={`${cycle} días`}
          onDec={() => setCycle((n) => Math.max(15, n - 1))}
          onInc={() => setCycle((n) => Math.min(60, n + 1))}
          decDisabled={cycle <= 15}
          incDisabled={cycle >= 60}
          decLabel="Ciclo un día más corto"
          incLabel="Ciclo un día más largo"
          hint="Entre 15 y 60 días."
        />
      </View>
      <View style={{ flexDirection: 'row' }}>
        <Stepper
          label="Duración de la regla"
          value={`${length} ${length === 1 ? 'día' : 'días'}`}
          onDec={() => setLength((n) => Math.max(1, n - 1))}
          onInc={() => setLength((n) => Math.min(14, n + 1))}
          decDisabled={length <= 1}
          incDisabled={length >= 14}
          decLabel="Regla un día más corta"
          incLabel="Regla un día más larga"
          hint="Entre 1 y 14 días."
        />
      </View>
      <View style={{ gap: space[2] }}>
        <Button variant="secondary" label="Guardar" onPress={save} disabled={!changed} />
        <Button variant="ghost" label="Recordarme el próximo periodo" icon={<CalendarPlus size={18} color={colors.primary} />} onPress={remind} disabled={!nextStart} />
      </View>
    </Card>
  );
}

const st = StyleSheet.create({
  split: { flexDirection: 'row', alignItems: 'stretch', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space[4] },
  estimate: { borderLeftWidth: 3, borderRadius: radius.sm, paddingVertical: space[3], paddingHorizontal: space[4], marginTop: -space[2] },
  setting: { flexDirection: 'row', alignItems: 'center', gap: space[3], borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space[3] },
  week: { flexDirection: 'row' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2 },
  day: { width: touchTarget, height: touchTarget, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  todayBar: { position: 'absolute', bottom: 5, width: 14, height: 2, borderRadius: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[4], rowGap: space[1], justifyContent: 'center', marginTop: space[1] },
  key: { width: 14, height: 14, borderRadius: 4, borderWidth: 2 },
  remove: { minHeight: touchTarget, justifyContent: 'center', alignSelf: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  run: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: touchTarget, paddingVertical: space[2] },
});
