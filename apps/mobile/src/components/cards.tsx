import type { Recommendation, UserChallenge } from '@dyc/api-client';
import { plural, shortDay, type PillarId } from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Check, Lightbulb, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { api } from '../lib/api';
import { useRefresh } from '../lib/queries';
import { useTheme } from '../lib/theme';
import { useToast } from '../lib/toast';
import { PillarIcon, PillarTag, pillarShort } from './pillar';
import { ProgressBar } from './score';
import { Button, Card, errorMessage, T } from './ui';

/** Fila de hábito con casilla grande; toda la fila es el objetivo táctil. */
export function HabitRow({ title, pillar, done, onToggle, meta, trailing }: { title: string; pillar: PillarId; done: boolean; onToggle: () => void; meta?: string; trailing?: ReactNode }) {
  const { colors, pillar: tone } = useTheme();
  const t = tone(pillar);
  return (
    <View style={s.habitRow}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={title}
        accessibilityHint={meta}
        onPress={onToggle}
        style={({ pressed }) => [s.habitHit, pressed && { opacity: 0.7 }]}
      >
        <View style={[s.box, { borderColor: done ? t.chart : colors.lineStrong, backgroundColor: done ? t.chart : 'transparent' }]}>
          {done && <Check size={16} strokeWidth={2.5} color={colors.surface} />}
        </View>
        <View style={{ flex: 1 }}>
          <T v="body" tint={done ? 'muted' : 'ink'} style={done && { textDecorationLine: 'line-through' }}>
            {title}
          </T>
          <T v="small" tint="subtle">
            {meta ?? pillarShort(pillar)}
          </T>
        </View>
      </Pressable>
      {trailing}
    </View>
  );
}

export function ChallengeCard({ c, onToggleToday, busy, children }: { c: UserChallenge; onToggleToday?: () => void; busy?: boolean; children?: ReactNode }) {
  const { colors } = useTheme();
  const upcoming = c.dayNumber === 0;
  return (
    <Card>
      <View style={s.between}>
        <PillarTag pillar={c.pillar} />
        {c.level && (
          <T v="small" tint="muted">
            Nivel {c.level}
          </T>
        )}
      </View>
      <View style={{ gap: space[1] }}>
        <T v="heading">{c.title}</T>
        <T v="small" tint="muted">
          {c.description}
        </T>
      </View>
      <View style={{ gap: space[2] }}>
        <View style={s.between}>
          <T v="small" style={{ fontVariant: ['tabular-nums'] }}>
            {upcoming ? `Empieza el ${shortDay(c.startedOn)}` : `Día ${c.dayNumber} de ${c.durationDays}`}
          </T>
          <T v="small" tint="muted">
            {plural(c.doneDays, 'día cumplido', 'días cumplidos')}
          </T>
        </View>
        <ProgressBar value={(c.doneDays / c.durationDays) * 100} pillar={c.pillar} label={`Progreso de ${c.title}`} />
      </View>
      {(onToggleToday || children) && (
        <View style={s.actions}>
          {onToggleToday && c.status === 'active' && !upcoming && (
            <Button
              small
              variant={c.doneToday ? 'secondary' : 'primary'}
              label={c.doneToday ? 'Hecho hoy' : 'Marcar hoy como hecho'}
              icon={c.doneToday ? <Check size={16} color={colors.primary} /> : undefined}
              onPress={onToggleToday}
              disabled={busy}
            />
          )}
          {children}
        </View>
      )}
    </Card>
  );
}

const ACTION_LABEL = {
  'start-challenge': 'Aceptar reto',
  'switch-challenge': 'Cambiar de nivel',
  'check-in': 'Hacer check-in',
} as const;

export function RecommendationCard({ rec }: { rec: Recommendation }) {
  const { colors } = useTheme();
  const refresh = useRefresh();
  const toast = useToast();
  const router = useRouter();

  const act = useMutation({
    mutationFn: async () => {
      const a = rec.action;
      if (a?.type === 'start-challenge') return api.challenges.start(a.challengeKey);
      if (a?.type === 'switch-challenge') return api.challenges.start(a.challengeKey, a.userChallengeId);
      return null;
    },
    onSuccess: (c) => {
      if (c) toast(`Reto aceptado: ${c.title}`);
      return refresh('challenges');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });

  const dismiss = useMutation({
    mutationFn: () => api.recommendations.dismiss(rec.key),
    onSuccess: () => {
      toast('La ocultamos durante una semana.');
      return refresh();
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });

  return (
    <Card>
      <View style={s.recHead}>
        {rec.pillar ? <PillarIcon pillar={rec.pillar} /> : <Lightbulb size={20} color={colors.inkMuted} />}
        <T v="heading" style={{ flex: 1 }}>
          {rec.title}
        </T>
        <Pressable accessibilityRole="button" accessibilityLabel={`Ocultar «${rec.title}»`} onPress={() => dismiss.mutate()} disabled={dismiss.isPending} style={s.iconBtn} hitSlop={4}>
          <X size={18} color={colors.inkMuted} />
        </Pressable>
      </View>
      <T v="body">{rec.body}</T>
      <T v="small" tint="muted">
        <T v="eyebrow" tint="subtle">
          Por qué{'  '}
        </T>
        {rec.reason}
      </T>
      {rec.action && (
        <View style={s.actions}>
          <Button
            small
            variant="secondary"
            label={ACTION_LABEL[rec.action.type]}
            busy={act.isPending}
            onPress={() => (rec.action?.type === 'check-in' ? router.push('/check-in') : act.mutate())}
          />
        </View>
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  habitRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  habitHit: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: touchTarget + 8, paddingVertical: space[1] },
  box: { width: 26, height: 26, borderRadius: radius.sm, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space[4], rowGap: space[2] },
  recHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  iconBtn: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', marginRight: -space[2] },
});
