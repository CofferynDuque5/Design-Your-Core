import type { CheckIn, Dashboard } from '@dyc/api-client';
import {
  consistencyGrid,
  consistencyLevel,
  consistencyStats,
  DAY_PLAN_KIND_LABEL,
  dayFocus,
  dayPlan,
  firstName,
  firstProject,
  greeting,
  longDay,
  phraseOfDay,
  plural,
  PROJECT_PRIORITY_INFO,
  projectPriorityOf,
  projectProgress,
  STREAK_MILESTONES,
  streakNudge,
  upcoming,
  WEEKLY_TARGET,
  type ConsistencyStats,
  type LegacyData,
} from '@dyc/core';
import { Award, Crosshair, Flame, Lock, Quote, Timer } from 'lucide-react-native';
import { space } from '@dyc/tokens';
import { useMutation } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChallengeCard, HabitRow, RecommendationCard } from '../../components/cards';
import { pillarShort } from '../../components/pillar';
import { ScoreRing } from '../../components/score';
import { Button, Card, EmptyState, ErrorState, errorMessage, fonts, Loading, PageHeader, Scale, Screen, SectionHeader, T } from '../../components/ui';
import { api, useAuth } from '../../lib/api';
import { useLegacyData, useLegacyList } from '../../lib/legacy';
import { useToggleChallenge, useToggleHabit } from '../../lib/mutations';
import { useDashboard, useRefresh } from '../../lib/queries';
import { useTheme } from '../../lib/theme';
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
  const legacy = useLegacyData();
  const data = legacy.data?.data;
  const habits = d.todayStatus.habits;
  const doneHabits = habits.filter((h) => h.done).length;
  // La tarjeta de check-in ya está abajo: no se repite como sugerencia.
  const recs = d.recommendations.filter((r) => r.action?.type !== 'check-in');
  const stats = consistencyStats(d.consistency ?? [], d.today);

  return (
    <>
      <FocusHero d={d} data={data} streak={stats.streak} />
      <ConsistencyCard d={d} stats={stats} />
      <WeekCard d={d} />

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

      <CheckInCard today={d.today} checkIn={d.todayStatus.checkIn} />
      <DayPlanCard data={data} />
      <MilestonesCard stats={stats} />
      <FirstProjectCard />

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

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const { colors } = useTheme();
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: value, text: `${value} de ${max}` }}
      style={{ height: 8, borderRadius: 999, backgroundColor: colors.surfaceSunken, overflow: 'hidden', flex: 1 }}
    >
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: colors.primary, borderRadius: 999 }} />
    </View>
  );
}

/** Portada: lo único importante de hoy, con un botón para empezar el foco. */
function FocusHero({ d, data, streak }: { d: Dashboard; data: LegacyData | undefined; streak: number }) {
  const router = useRouter();
  const { colors } = useTheme();
  const habits = d.todayStatus.habits;
  const focus = dayFocus(data, habits);
  const item = d.consistency?.find((c) => c.date === d.today);
  const done = item?.done ?? habits.filter((h) => h.done).length + (d.todayStatus.checkIn ? 1 : 0);
  const total = item?.total ?? habits.length + 1;
  const meta: Array<[string, string, boolean]> = [
    [String(d.overall.score ?? '—'), 'Puntuación de la semana', false],
    [String(streak), 'Días de racha', true],
    [`${habits.filter((h) => h.done).length}/${habits.length}`, 'Hábitos hechos hoy', false],
  ];
  return (
    <Card style={{ borderColor: colors.primary }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
        <Crosshair size={14} color={colors.primary} />
        <T v="eyebrow" tint="primary">
          Tu enfoque de hoy
        </T>
      </View>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 26, lineHeight: 32, color: colors.ink }}>
        {focus ? 'Hoy, una cosa a la vez: ' : 'Tu día está en orden. '}
        <Text style={{ fontFamily: fonts.displayItalic, color: colors.primary }}>{focus ? focus.title : 'Elige algo que te acerque a tus metas.'}</Text>
      </Text>
      {focus && (
        <T v="small" tint="muted">
          {focus.detail}
        </T>
      )}
      <View style={{ flexDirection: 'row', gap: space[4] }}>
        {meta.map(([value, label, lit]) => (
          <View key={label} style={{ flex: 1 }} accessible accessibilityLabel={`${label}: ${value}`}>
            <Text style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: lit ? colors.primary : colors.ink }}>{value}</Text>
            <T v="small" tint="muted">
              {label}
            </T>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <Bar value={done} max={total} label="Lo de hoy" />
        <T v="small" tint="muted">
          Hoy llevas {done} de {total}
        </T>
      </View>
      <Button label="Empezar 25 min de foco" icon={<Timer size={18} color={colors.onPrimary} />} onPress={() => router.push('/enfoque' as Href)} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {focus && <Button variant="ghost" small label={focus.linkLabel} onPress={() => router.push(focus.url as Href)} />}
        {!d.todayStatus.checkIn && <Button variant="ghost" small label="Check-in" onPress={() => router.push('/check-in')} />}
      </View>
    </Card>
  );
}

const WEEKDAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** El mapa de 12 semanas, la racha y lo que falta para la próxima meta. */
function ConsistencyCard({ d, stats }: { d: Dashboard; stats: ConsistencyStats }) {
  const { colors } = useTheme();
  const grid = consistencyGrid(d.consistency ?? [], d.today);
  const levelColor = (l: number) => [colors.surfaceSunken, `${colors.primary}44`, `${colors.primary}80`, `${colors.primary}BB`, colors.primary][l];
  const next = stats.next;
  const facts: Array<[string, string]> = [
    [plural(stats.best, 'día', 'días'), 'Mejor racha'],
    [`${stats.weekActive} de ${WEEKLY_TARGET}`, 'Días esta semana'],
    [String(stats.perfectDays), 'Días completos'],
  ];
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[3] }}>
        <View style={{ flex: 1, gap: space[1] }}>
          <T v="heading" accessibilityRole="header">
            Constancia
          </T>
          <T v="small">{streakNudge(stats)}</T>
        </View>
        <View
          accessible
          accessibilityLabel={`${plural(stats.streak, 'día seguido', 'días seguidos')}`}
          style={{ alignItems: 'center', paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: 14, borderWidth: 1, borderColor: stats.todayDone ? colors.primary : colors.line }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Flame size={18} color={stats.todayDone ? colors.primary : colors.inkMuted} />
            <Text style={{ fontFamily: fonts.display, fontSize: 30, lineHeight: 34, color: stats.todayDone ? colors.primary : colors.ink }}>{stats.streak}</Text>
          </View>
          <T v="small" tint="muted" style={{ fontSize: 12 }}>
            seguidos
          </T>
        </View>
      </View>
      <View
        accessible
        accessibilityLabel={`Mapa de constancia: ${stats.activeDays} días con algo hecho en las últimas 12 semanas`}
        style={{ flexDirection: 'row', gap: 3 }}
      >
        <View style={{ gap: 3, marginRight: 2 }}>
          {WEEKDAY_LETTERS.map((l, i) => (
            <View key={l + i} style={{ flex: 1, justifyContent: 'center' }}>
              <Text style={{ fontSize: 10, color: colors.inkSubtle }}>{i % 2 === 0 ? l : ' '}</Text>
            </View>
          ))}
        </View>
        {grid.map((week, w) => (
          <View key={w} style={{ flex: 1, gap: 3 }}>
            {week.map((c, i) => (
              <View
                key={i}
                testID={c ? `constancia-${c.date}` : undefined}
                style={{
                  aspectRatio: 1,
                  borderRadius: 3,
                  backgroundColor: c ? levelColor(consistencyLevel(c)) : 'transparent',
                  borderWidth: c?.date === d.today ? 2 : c ? 0 : 1,
                  borderColor: c?.date === d.today ? colors.ink : colors.line,
                  opacity: c ? 1 : 0.4,
                }}
              />
            ))}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        {facts.map(([value, label]) => (
          <View key={label} style={{ flex: 1, padding: space[2], borderRadius: 10, backgroundColor: colors.surfaceSunken }} accessible accessibilityLabel={`${label}: ${value}`}>
            <T v="label">{value}</T>
            <T v="small" tint="muted" style={{ fontSize: 12 }}>
              {label}
            </T>
          </View>
        ))}
      </View>
      {next && (
        <View style={{ gap: space[1] }}>
          <Bar value={next.target - next.left} max={next.target} label={`Hacia ${next.target} días seguidos`} />
          <T v="small" tint="muted">
            Próxima meta: {next.target} días seguidos. Te {next.left === 1 ? 'falta 1 día' : `faltan ${next.left} días`}.
          </T>
        </View>
      )}
    </Card>
  );
}

/** Rachas conseguidas: se desbloquean al llegar a 3, 7, 14… días seguidos. */
function MilestonesCard({ stats }: { stats: ConsistencyStats }) {
  const { colors } = useTheme();
  return (
    <Card>
      <SectionHeader
        title="Logros de constancia"
        right={
          <T v="small" tint="muted">
            {stats.reached.length} de {STREAK_MILESTONES.length}
          </T>
        }
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {STREAK_MILESTONES.slice(0, 6).map((m) => {
          const got = stats.reached.includes(m);
          return (
            <View
              key={m}
              accessible
              accessibilityLabel={got ? `${m} días seguidos, conseguido` : `${m} días seguidos, por conseguir`}
              style={{
                width: '31%',
                alignItems: 'center',
                paddingVertical: space[2],
                borderRadius: 12,
                borderWidth: 1,
                borderStyle: got ? 'solid' : 'dashed',
                borderColor: got ? colors.primary : colors.lineStrong,
              }}
            >
              {got ? <Award size={18} color={colors.primary} /> : <Lock size={14} color={colors.inkSubtle} />}
              <Text style={{ fontFamily: fonts.display, fontSize: 22, lineHeight: 26, color: got ? colors.ink : colors.inkSubtle }}>{m}</Text>
              <Text style={{ fontSize: 11, color: got ? colors.primary : colors.inkSubtle }}>días</Text>
            </View>
          );
        })}
      </View>
      <T v="small" tint="muted">
        {stats.next ? `Tu mejor racha: ${plural(stats.best, 'día', 'días')}. La siguiente medalla llega a los ${stats.next.target}.` : 'Conseguiste todas las medallas. Ahora, a mantenerlo.'}
      </T>
    </Card>
  );
}

/** Lo que tiene hora hoy: horario, cursos, rutinas y agenda. */
function DayPlanCard({ data }: { data: LegacyData | undefined }) {
  const router = useRouter();
  const { colors } = useTheme();
  const items = upcoming(dayPlan(data));
  return (
    <Card>
      <SectionHeader title="Tu día" right={<Button small variant="link" label="Horario" onPress={() => router.push('/horario' as Href)} />} />
      {items.length ? (
        items.map((i) => (
          <Pressable key={i.id} accessibilityRole="link" onPress={() => router.push(i.url as Href)} style={{ flexDirection: 'row', gap: space[3], paddingLeft: space[3], borderLeftWidth: 2, borderLeftColor: i.now ? colors.primary : colors.line }}>
            <T v="label" tint={i.now ? 'primary' : 'muted'} style={{ width: 48, fontVariant: ['tabular-nums'] }}>
              {i.time}
            </T>
            <View style={{ flex: 1 }}>
              <T v="body">{i.title}</T>
              <T v="small" tint="muted">
                {i.now ? 'Ahora · ' : ''}
                {DAY_PLAN_KIND_LABEL[i.kind]}
                {i.end ? ` · hasta ${i.end}` : ''}
              </T>
            </View>
          </Pressable>
        ))
      ) : (
        <T v="small" tint="muted">
          No queda nada con hora para hoy. Buen momento para una sesión de foco.
        </T>
      )}
    </Card>
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
      checkIn.stress && `estrés ${checkIn.stress}/5`,
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
        <Button variant="ghost" label="Abrir el check-in completo" onPress={() => router.push('/check-in')} />
      </View>
    </Card>
  );
}

/** El proyecto que toca terminar primero (el número 1 de Proyectos). */
function FirstProjectCard() {
  const router = useRouter();
  const legacy = useLegacyData();
  const projects = useLegacyList(legacy.data?.data, 'projects');
  const p = firstProject(projects);
  if (!p) return null;
  const priority = projectPriorityOf(p);
  return (
    <Card>
      <SectionHeader title="Termina primero" right={<Button small variant="link" label="Proyectos" onPress={() => router.push('/proyectos' as Href)} />} />
      <T v="heading" style={{ fontSize: 18, lineHeight: 24 }}>
        {p.title || 'Sin título'}
      </T>
      <T v="small" tint="muted">
        Prioridad {PROJECT_PRIORITY_INFO[priority].label.toLowerCase()}
        {p.deadline?.trim() ? ` · Entrega ${p.deadline}` : ''} · {projectProgress(p)} % hecho
      </T>
    </Card>
  );
}

function WeekCard({ d }: { d: Dashboard }) {
  const router = useRouter();
  const { colors } = useTheme();
  const withData = d.pillars.some((p) => p.score !== null);
  return (
    <Card>
      <SectionHeader title="Tu semana" right={<Button small variant="link" label="Progreso" onPress={() => router.navigate('/progreso')} />} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
        <ScoreRing value={d.overall.score} size={72} label="Puntuación de la semana" />
        <View style={{ flex: 1, gap: space[1] }}>
          {d.overall.score !== null && d.overall.previous !== null && (
            <Text style={{ fontFamily: fonts.display, fontSize: 22, color: d.overall.score >= d.overall.previous ? colors.primary : colors.warning }}>
              {d.overall.score - d.overall.previous > 0 ? '+' : ''}
              {d.overall.score - d.overall.previous} puntos
            </Text>
          )}
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
      <View style={{ flexDirection: 'row', gap: space[2], padding: space[3], borderLeftWidth: 3, borderLeftColor: colors.primary, backgroundColor: colors.surfaceSunken, borderRadius: 6 }}>
        <Quote size={14} color={colors.primary} />
        <Text style={{ flex: 1, fontFamily: fonts.displayItalic, fontSize: 16, lineHeight: 22, color: colors.ink }}>{phraseOfDay(d.today)}</Text>
      </View>
    </Card>
  );
}
