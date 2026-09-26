import {
  byDateDesc,
  isDay,
  minutesLabel,
  normalizeHHMM,
  shortDay,
  sleepMinutes,
  sleepQualityLabel,
  sleepStats,
  utcDayKey,
  type Day,
  type LegacySleep,
} from '@dyc/core';
import { space, touchTarget } from '@dyc/tokens';
import { Plus, Trash2 } from 'lucide-react-native';
import { Fragment, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { CheckInNote, DayStepper, FormActions, IconButton, Pill, tint, TimeField, ToolScreen } from '../../components/tools';
import { Button, Card, EmptyState, ErrorState, Field, Loading, Scale, SectionHeader, T, fonts } from '../../components/ui';
import { newId, useLegacyData, useLegacyList, useModule } from '../../lib/legacy';
import { useTheme } from '../../lib/theme';
import { useToast } from '../../lib/toast';

const HISTORY_MAX = 60;
const CHART_NIGHTS = 14;
const CHART_HEIGHT = 150;
const VIOLET = '#8B5CF6';
const decimal = new Intl.NumberFormat('es', { maximumFractionDigits: 1 });

/** Cuanto mejor dormiste, más intenso el color (como la web). */
function qualityShade(q: unknown, surface: string): string {
  if (q === 5) return VIOLET;
  if (q === 4) return tint(VIOLET, surface, 0.72);
  if (q === 1 || q === 2) return tint(VIOLET, surface, 0.28);
  return tint(VIOLET, surface, 0.45);
}

export default function Sleep() {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const nights = useLegacyList(legacy.data?.data, 'sleep');
  const actions = useModule('sleep');
  const toast = useToast();
  // El día en que te despiertas, en UTC como la app anterior.
  const today = utcDayKey();
  const stats = useMemo(() => sleepStats(nights), [nights]);
  const history = useMemo(() => nights.filter((n) => isDay(n.date)).sort(byDateDesc), [nights]);
  const chart = history.slice(0, CHART_NIGHTS).reverse();
  const [editing, setEditing] = useState<LegacySleep | 'new' | null>(null);
  const last = history[0];
  const lastMinutes = last ? sleepMinutes(last.bedtime, last.waketime) : null;

  const remove = (n: LegacySleep) => {
    const order = nights.map((x) => x.id);
    actions.remove(n.id);
    toast('Noche eliminada.', {
      action: {
        label: 'Deshacer',
        run: () => {
          actions.add(n);
          actions.reorder(order);
        },
      },
    });
  };

  return (
    <ToolScreen
      title="Sueño"
      eyebrow="Salud"
      refreshing={legacy.isRefetching}
      onRefresh={() => legacy.refetch()}
      right={<Button small label="Registrar noche" icon={<Plus size={16} color={colors.onPrimary} />} onPress={() => setEditing('new')} disabled={!legacy.data} />}
    >
      {legacy.isPending ? (
        <Loading label="Cargando tus noches" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : history.length === 0 ? (
        <>
          <EmptyState title="Aún no has registrado noches" action={<Button small variant="secondary" label="Registrar la de anoche" icon={<Plus size={16} color={colors.primary} />} onPress={() => setEditing('new')} />}>
            Apunta a qué hora te acostaste y te levantaste y cómo dormiste. Verás tu media de las últimas dos semanas.
          </EmptyState>
          <CheckInNote>El check-in diario registra aparte tus horas de sueño para el pilar Descanso.</CheckInNote>
        </>
      ) : (
        <>
          <Card style={{ gap: space[4] }}>
            <View accessible accessibilityLabel={`Media de las últimas ${stats.nights} ${stats.nights === 1 ? 'noche' : 'noches'}: ${stats.avgMinutes === null ? 'sin datos' : minutesLabel(Math.round(stats.avgMinutes))}`} style={{ alignItems: 'center' }}>
              <T v="display" style={{ fontVariant: ['tabular-nums'] }}>
                {stats.avgMinutes === null ? '—' : minutesLabel(Math.round(stats.avgMinutes))}
              </T>
              <T v="small" tint="muted">
                Media de las últimas {stats.nights} {stats.nights === 1 ? 'noche' : 'noches'}
              </T>
            </View>
            <View style={[st.split, { borderTopColor: colors.line }]}>
              <Figure value={stats.avgQuality === null ? '—' : `${decimal.format(stats.avgQuality)}/5`} label="Calidad media" />
              <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />
              <Figure value={lastMinutes === null ? '—' : minutesLabel(lastMinutes)} label={`Última noche · ${shortDay(last.date)}`} />
            </View>
          </Card>

          <Card>
            <T v="heading" accessibilityRole="header">
              Horas por noche
            </T>
            <View accessibilityLabel={`Últimas ${chart.length} noches`}>
              <View style={st.chart}>
                <View style={[st.eight, { bottom: (CHART_HEIGHT * 8) / 10, borderColor: colors.lineStrong }]} />
                {chart.map((n) => {
                  const m = sleepMinutes(n.bedtime, n.waketime) ?? 0;
                  return (
                    <View key={n.id} style={st.barCol} accessible accessibilityLabel={`${shortDay(n.date)}: ${minutesLabel(m)}, calidad ${sleepQualityLabel(n.quality)}`}>
                      <View style={[st.bar, { height: Math.max(2, (CHART_HEIGHT * Math.min(1, m / 600))), backgroundColor: qualityShade(n.quality, colors.surface) }]} />
                    </View>
                  );
                })}
              </View>
              <View style={st.days} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                {chart.map((n) => (
                  <T key={n.id} v="small" tint="subtle" style={st.dayLabel}>
                    {Number(n.date.slice(8))}
                  </T>
                ))}
              </View>
            </View>
            <T v="small" tint="muted">
              Cada barra es una noche (hasta 10 h); cuanto más intenso el color, mejor dormiste. La línea marca 8 horas.
            </T>
          </Card>

          <View style={{ gap: space[3] }}>
            <SectionHeader title="Historial" right={<Pill a11yLabel={`${history.length} noches`}>{String(history.length)}</Pill>} />
            <Card style={{ paddingVertical: space[1], gap: 0 }}>
              {history.slice(0, HISTORY_MAX).map((n, i) => {
                const m = sleepMinutes(n.bedtime, n.waketime);
                const label = `la noche del ${shortDay(n.date)}`;
                return (
                  <Fragment key={n.id}>
                    {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 44 }} />}
                    <View style={st.row}>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Editar ${label}`} onPress={() => setEditing(n)} style={({ pressed }) => [st.rowHit, pressed && { opacity: 0.7 }]}>
                        <View style={[st.q, { backgroundColor: tint(VIOLET, colors.surface, 0.16) }]}>
                          <T v="label" style={{ fontFamily: fonts.semibold, fontVariant: ['tabular-nums'] }}>
                            {typeof n.quality === 'number' ? String(n.quality) : '–'}
                          </T>
                        </View>
                        <View style={{ flex: 1 }}>
                          <T v="label">
                            {shortDay(n.date)}
                            {n.date === today ? ' · hoy' : ''} · {m === null ? 'horas sin completar' : minutesLabel(m)}
                          </T>
                          <T v="small" tint="muted" numberOfLines={2}>
                            {n.bedtime} → {n.waketime} · {sleepQualityLabel(n.quality)}
                            {n.note ? ` · ${n.note}` : ''}
                          </T>
                        </View>
                      </Pressable>
                      <IconButton label={`Borrar ${label}`} onPress={() => remove(n)} style={{ marginRight: -space[2] }}>
                        <Trash2 size={18} color={colors.inkMuted} />
                      </IconButton>
                    </View>
                  </Fragment>
                );
              })}
            </Card>
          </View>
          <CheckInNote>El check-in diario registra aparte tus horas de sueño para el pilar Descanso; estas noches aún no cambian tu puntuación.</CheckInNote>
        </>
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Registrar noche' : 'Editar noche'}>
        {editing !== null && <SleepForm night={editing === 'new' ? null : editing} today={today} onDone={() => setEditing(null)} />}
      </Sheet>
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

function SleepForm({ night, today, onDone }: { night: LegacySleep | null; today: Day; onDone: () => void }) {
  const actions = useModule('sleep');
  const [date, setDate] = useState<Day>(night?.date ?? today);
  const [bedtime, setBedtime] = useState(night?.bedtime ?? '23:00');
  const [waketime, setWaketime] = useState(night?.waketime ?? '07:00');
  const [quality, setQuality] = useState<number | null>(typeof night?.quality === 'number' ? night.quality : 3);
  const [note, setNote] = useState(night?.note ?? '');
  const bed = normalizeHHMM(bedtime);
  const wake = normalizeHHMM(waketime);
  const minutes = sleepMinutes(bed, wake);
  const valid = !!date && minutes !== null && quality !== null;
  const submit = () => {
    if (!valid) return;
    const fields = { date, bedtime: bed, waketime: wake, quality: quality as number, note: note.trim() };
    if (night) actions.update(night.id, fields);
    else actions.add({ id: newId(), ...fields });
    onDone();
  };
  return (
    <ScrollView style={{ maxHeight: 620 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <DayStepper label="Día" value={date} onChange={(d) => d && setDate(d)} today={today} hint="El día en que te despertaste." />
      <View style={st.pair}>
        <View style={{ flex: 1 }}>
          <TimeField label="Te acostaste" value={bedtime} onChange={setBedtime} />
        </View>
        <View style={{ flex: 1 }}>
          <TimeField label="Te levantaste" value={waketime} onChange={setWaketime} />
        </View>
      </View>
      {minutes !== null && (
        <T v="small" tint="muted" accessibilityLiveRegion="polite" style={{ marginTop: -space[2] }}>
          Dormiste {minutesLabel(minutes)}.
        </T>
      )}
      <Scale legend="¿Cómo dormiste?" value={quality} onChange={setQuality} low="Muy mal" high="Muy bien" />
      <Field label="Nota (opcional)" multiline value={note} onChangeText={setNote} maxLength={1000} placeholder="Me desperté a las 3, café tarde…" />
      <FormActions
        submitLabel={night ? 'Guardar' : 'Registrar'}
        onSubmit={submit}
        disabled={!valid}
        onDelete={
          night
            ? () => {
                actions.remove(night.id);
                onDone();
              }
            : undefined
        }
        confirm="Se borrará esta noche."
      />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  split: { flexDirection: 'row', alignItems: 'stretch', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space[4] },
  chart: { height: CHART_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  eight: { position: 'absolute', left: 0, right: 0, height: 0, borderTopWidth: 1, borderStyle: 'dashed' },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  bar: { width: '100%', maxWidth: 24, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  days: { flexDirection: 'row', gap: 4, marginTop: space[1] },
  dayLabel: { flex: 1, textAlign: 'center', fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  rowHit: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: touchTarget + 12, paddingVertical: space[2] },
  q: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pair: { flexDirection: 'row', gap: space[3] },
});
