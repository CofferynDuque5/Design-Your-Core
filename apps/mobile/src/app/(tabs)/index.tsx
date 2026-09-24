import type { CheckIn, Dashboard } from '@dyc/api-client';
import { firstName, greeting, longDay, plural } from '@dyc/core';
import { space } from '@dyc/tokens';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ChallengeCard, HabitRow, RecommendationCard } from '../../components/cards';
import { pillarShort } from '../../components/pillar';
import { ScoreRing } from '../../components/score';
import { Button, Card, EmptyState, ErrorState, errorMessage, Loading, PageHeader, Scale, Screen, SectionHeader, T } from '../../components/ui';
import { api, useAuth } from '../../lib/api';
import { useToggleChallenge, useToggleHabit } from '../../lib/mutations';
import { useDashboard, useRefresh } from '../../lib/queries';
import { useToast } from '../../lib/toast';

export default function Today() {
  const session = useAuth();
  const dash = useDashboard('week');
  const name = session.status === 'signedIn' ? firstName(session.user.name) : '';

  return (
    <Screen refreshing={dash.isRefetching} onRefresh={() => dash.refetch()}>
      <PageHeader eyebrow={dash.data ? longDay(dash.data.today) : 'Hoy'} title={name ? `${greeting()}, ${name}` : greeting()} />
      {dash.isPending ? (
        <>
          <Loading label="Cargando tu día" />
          <Loading />
        </>
      ) : dash.isError ? (
        <ErrorState error={dash.error} retry={() => dash.refetch()} />
      ) : (
        <TodayContent d={dash.data} />
      )}
    </Screen>
  );
}

function TodayContent({ d }: { d: Dashboard }) {
  const router = useRouter();
  const toggleHabit = useToggleHabit();
  const toggleChallenge = useToggleChallenge();
  const habits = d.todayStatus.habits;
  const doneHabits = habits.filter((h) => h.done).length;
  // La tarjeta de check-in ya está arriba: no se repite como sugerencia.
  const recs = d.recommendations.filter((r) => r.action?.type !== 'check-in');

  return (
    <>
      <CheckInCard today={d.today} checkIn={d.todayStatus.checkIn} />

      <View style={{ gap: space[3] }}>
        <SectionHeader
          title="Hábitos de hoy"
          right={
            habits.length > 0 && (
              <T v="small" tint="muted" style={{ fontVariant: ['tabular-nums'] }}>
                {doneHabits} de {habits.length}
              </T>
            )
          }
        />
        {habits.length ? (
          <Card style={{ paddingVertical: space[1] }}>
            {habits.map((h) => (
              <HabitRow key={h.id} title={h.title} pillar={h.pillar} done={h.done} onToggle={() => toggleHabit.mutate({ id: h.id, date: d.today, done: !h.done })} />
            ))}
          </Card>
        ) : (
          <EmptyState title="Sin hábitos para hoy" action={<Button small variant="secondary" label="Crear un hábito" onPress={() => router.navigate('/habitos')} />}>
            Un hábito es algo pequeño que repites: beber agua al despertar, caminar diez minutos, escribir una línea antes de dormir.
          </EmptyState>
        )}
      </View>

      <View style={{ gap: space[3] }}>
        <SectionHeader title="Retos activos" right={<Button small variant="link" label="Ver retos" onPress={() => router.navigate('/retos')} />} />
        {d.challenges.length ? (
          d.challenges.map((c) => (
            <ChallengeCard key={c.id} c={c} busy={toggleChallenge.isPending} onToggleToday={() => toggleChallenge.mutate({ id: c.id, date: d.today, done: !c.doneToday })} />
          ))
        ) : (
          <EmptyState title="Ningún reto en marcha" action={<Button small variant="secondary" label="Elegir un reto" onPress={() => router.navigate('/retos')} />}>
            Los retos duran entre 5 y 14 días y están pensados para cumplirse.
          </EmptyState>
        )}
      </View>

      <WeekCard d={d} />

      {recs.length > 0 && (
        <View style={{ gap: space[3] }}>
          <SectionHeader title="Para ti" />
          {recs.map((r) => (
            <RecommendationCard key={r.key} rec={r} />
          ))}
        </View>
      )}
    </>
  );
}

function CheckInCard({ today, checkIn }: { today: string; checkIn: CheckIn | null }) {
  const router = useRouter();
  const refresh = useRefresh();
  const toast = useToast();
  const [mood, setMood] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const save = useMutation({
    mutationFn: () => api.checkIns.save(today, { ...(mood ? { mood } : {}), ...(energy ? { energy } : {}) }),
    onSuccess: () => {
      toast('Check-in guardado.');
      return refresh('checkins');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });

  if (checkIn) {
    const parts = [
      checkIn.mood && `ánimo ${checkIn.mood}/5`,
      checkIn.energy && `energía ${checkIn.energy}/5`,
      checkIn.sleepHours !== null && `${String(checkIn.sleepHours).replace('.', ',')} h de sueño`,
      checkIn.activeMinutes !== null && `${checkIn.activeMinutes} min activos`,
    ].filter(Boolean);
    return (
      <Card>
        <SectionHeader title="Check-in de hoy" right={<Button small variant="link" label="Completar" onPress={() => router.push('/check-in')} />} />
        <T v="body" tint="muted">
          {parts.length ? `Registraste ${parts.join(', ')}.` : 'Ya empezaste tu check-in de hoy.'}
        </T>
      </Card>
    );
  }

  return (
    <Card tone="accent">
      <View style={{ gap: space[1] }}>
        <T v="heading" accessibilityRole="header">
          ¿Cómo estás hoy?
        </T>
        <T v="small" tint="muted">
          Dos toques bastan. Si quieres, completa el resto después.
        </T>
      </View>
      <Scale legend="Ánimo" value={mood} onChange={setMood} low="Bajo" high="Muy bien" />
      <Scale legend="Energía" value={energy} onChange={setEnergy} low="Muy baja" high="Muy alta" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        <Button label="Guardar" onPress={() => save.mutate()} busy={save.isPending} disabled={!mood && !energy} />
        <Button variant="ghost" label="Check-in completo" onPress={() => router.push('/check-in')} />
      </View>
    </Card>
  );
}

function WeekCard({ d }: { d: Dashboard }) {
  const router = useRouter();
  const withData = d.pillars.some((p) => p.score !== null);
  return (
    <Card>
      <SectionHeader title="Tu semana" right={<Button small variant="link" label="Progreso" onPress={() => router.navigate('/progreso')} />} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
        <ScoreRing value={d.overall.score} size={72} label="Puntuación de la semana" />
        <View style={{ flex: 1, gap: space[1] }}>
          <T v="body">{plural(d.checkIns.streak, 'día seguido', 'días seguidos')} con check-in</T>
          <T v="small" tint="muted">
            {d.habits.scheduled ? `${d.habits.done} de ${d.habits.scheduled} hábitos cumplidos` : 'Sin hábitos programados'}
          </T>
        </View>
      </View>
      {withData ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space[4] }}>
          {d.pillars.map((p) => (
            <View key={p.id} style={{ width: '33.33%', alignItems: 'center', gap: space[1] }}>
              <ScoreRing value={p.score} pillar={p.id} size={44} label={pillarShort(p.id)} />
              <T v="small" tint="muted" importantForAccessibility="no" accessibilityElementsHidden>
                {pillarShort(p.id)}
              </T>
            </View>
          ))}
        </View>
      ) : (
        <T v="small" tint="muted">
          Tus pilares aparecerán aquí después de tu primer check-in.
        </T>
      )}
    </Card>
  );
}
