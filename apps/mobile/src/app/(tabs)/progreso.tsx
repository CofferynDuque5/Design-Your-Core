import type { Dashboard } from '@dyc/api-client';
import { plural, rangeLabel, shiftPeriod, type Period, type PillarId } from '@dyc/core';
import { space, touchTarget } from '@dyc/tokens';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { PillarIcon, pillarName, pillarShort } from '../../components/pillar';
import { Delta, ProgressBar, ScoreRing } from '../../components/score';
import { TrendBars } from '../../components/TrendBars';
import { Button, Card, Chip, EmptyState, ErrorState, Loading, PageHeader, Screen, Segmented, SectionHeader, T } from '../../components/ui';
import { useDashboard } from '../../lib/queries';
import { useTheme } from '../../lib/theme';

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
];
const PREVIOUS: Record<Period, string> = { day: 'que ayer', week: 'que la semana anterior', month: 'que el mes anterior' };

export default function Progress() {
  const { colors } = useTheme();
  const [period, setPeriod] = useState<Period>('week');
  const [date, setDate] = useState<string | undefined>(undefined);
  const dash = useDashboard(period, date);
  const d = dash.data;
  const isCurrent = !d || d.range.to >= d.today;
  const move = (step: 1 | -1) => {
    if (!d) return;
    const next = shiftPeriod(period, d.date, step);
    setDate(next >= d.today ? undefined : next);
  };

  return (
    <Screen refreshing={dash.isRefetching && !dash.isPlaceholderData} onRefresh={() => dash.refetch()}>
      <PageHeader eyebrow="Progreso" title={d ? rangeLabel(d.range.from, d.range.to) : 'Tu progreso'} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <View style={{ flex: 1 }}>
          <Segmented
            label="Periodo"
            options={PERIODS}
            value={period}
            onChange={(p) => {
              setPeriod(p);
              setDate(undefined);
            }}
          />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Periodo anterior" disabled={!d} onPress={() => move(-1)} style={{ width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={22} color={colors.ink} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Periodo siguiente"
          accessibilityState={{ disabled: isCurrent }}
          disabled={isCurrent}
          onPress={() => move(1)}
          style={{ width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', opacity: isCurrent ? 0.35 : 1 }}
        >
          <ChevronRight size={22} color={colors.ink} />
        </Pressable>
      </View>
      {dash.isPending ? (
        <Loading label="Cargando tu progreso" />
      ) : dash.isError ? (
        <ErrorState error={dash.error} retry={() => dash.refetch()} />
      ) : (
        <View style={{ gap: space[6], opacity: dash.isPlaceholderData ? 0.6 : 1 }}>
          <ProgressContent d={dash.data} period={period} />
        </View>
      )}
    </Screen>
  );
}

function ProgressContent({ d, period }: { d: Dashboard; period: Period }) {
  const router = useRouter();
  const [focus, setFocus] = useState<PillarId | 'overall'>('overall');
  if (d.overall.score === null) {
    return (
      <EmptyState
        title="Todavía no hay datos en este periodo"
        action={d.range.to >= d.today ? <Button small variant="secondary" label="Hacer el check-in de hoy" onPress={() => router.push('/check-in')} /> : undefined}
      >
        Tu progreso se calcula con tus check-ins y hábitos. Con un registro ya verás tus seis pilares aquí.
      </EmptyState>
    );
  }

  const points = d.series.map((s) => ({ date: s.date, value: focus === 'overall' ? s.overall : (s.pillars?.[focus] ?? null) }));
  const deltaOverall = d.overall.previous !== null ? d.overall.score - d.overall.previous : null;
  const habitsPct = d.habits.scheduled ? `${Math.round((d.habits.done / d.habits.scheduled) * 100)}%` : '–';

  return (
    <>
      <Card>
        <T v="eyebrow" tint="muted">
          Puntuación general
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
          <ScoreRing value={d.overall.score} size={96} label="Puntuación general" />
          <View style={{ flex: 1, gap: space[1] }}>
            {deltaOverall !== null && (
              <View style={{ flexDirection: 'row', gap: space[1], flexWrap: 'wrap' }}>
                <Delta value={deltaOverall} />
                {deltaOverall !== 0 && (
                  <T v="small" tint="muted">
                    {PREVIOUS[period]}
                  </T>
                )}
              </View>
            )}
            <T v="small" tint="muted">
              Promedio de los pilares con datos, de 0 a 100.
            </T>
          </View>
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <Stat value={String(d.checkIns.count)} label={d.checkIns.count === 1 ? 'check-in' : 'check-ins'} />
        <Stat value={String(d.checkIns.streak)} label={d.checkIns.streak === 1 ? 'día de racha' : 'días de racha'} />
        <Stat value={habitsPct} label={d.habits.scheduled ? `hábitos (${d.habits.done} de ${d.habits.scheduled})` : 'sin hábitos'} />
      </View>

      <Card>
        <SectionHeader title="Tus pilares" />
        {d.pillars.map((p) => (
          <View key={p.id} style={{ gap: space[1] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <PillarIcon pillar={p.id} size={18} />
              <T v="label" style={{ flex: 1 }}>
                {pillarName(p.id)}
              </T>
              {p.score === null ? (
                <T v="small" tint="subtle">
                  sin datos
                </T>
              ) : (
                <>
                  <Delta value={p.delta} />
                  <T v="label" style={{ fontVariant: ['tabular-nums'], minWidth: 28, textAlign: 'right' }}>
                    {p.score}
                  </T>
                </>
              )}
            </View>
            <ProgressBar value={p.score ?? 0} pillar={p.id} label={pillarName(p.id)} />
          </View>
        ))}
        {period !== 'day' && (
          <T v="small" tint="muted">
            Cada pilar se calcula con los días que tienen datos: {d.pillars.map((p) => `${pillarShort(p.id)} ${plural(p.daysWithData, 'día', 'días')}`).join(', ')}.
          </T>
        )}
      </Card>

      {period !== 'day' && (
        <Card>
          <SectionHeader title="Evolución" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
            <Chip label="General" selected={focus === 'overall'} onPress={() => setFocus('overall')} />
            {d.pillars.map((p) => (
              <Chip key={p.id} label={pillarShort(p.id)} selected={focus === p.id} onPress={() => setFocus(p.id)} />
            ))}
          </ScrollView>
          <TrendBars points={points} pillar={focus === 'overall' ? undefined : focus} today={d.today} label={focus === 'overall' ? 'Puntuación general por día' : `${pillarName(focus)} por día`} />
        </Card>
      )}
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Card style={{ flex: 1, gap: 2, padding: space[3] }}>
      <T v="title" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </T>
      <T v="small" tint="muted">
        {label}
      </T>
    </Card>
  );
}
