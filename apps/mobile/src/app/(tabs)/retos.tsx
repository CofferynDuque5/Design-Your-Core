import type { UserChallenge } from '@dyc/api-client';
import { adjacentLevel, PILLAR_IDS, shortDay, type Challenge, type PillarId } from '@dyc/core';
import { space } from '@dyc/tokens';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { ChallengeCard } from '../../components/cards';
import { pillarShort, PillarTag } from '../../components/pillar';
import { Sheet } from '../../components/Sheet';
import { Button, Card, Chip, EmptyState, ErrorState, errorMessage, Loading, PageHeader, Screen, SectionHeader, T } from '../../components/ui';
import { api } from '../../lib/api';
import { useToggleChallenge } from '../../lib/mutations';
import { useCatalog, useChallenges, useRefresh } from '../../lib/queries';
import { useTheme } from '../../lib/theme';
import { useToast } from '../../lib/toast';

const MAX_ACTIVE = 3;
const STATUS = { active: 'En curso', completed: 'Completado', abandoned: 'Lo dejaste' } as const;

export default function Challenges() {
  const list = useChallenges();
  const catalog = useCatalog();
  const [filter, setFilter] = useState<PillarId | 'all'>('all');

  return (
    <Screen refreshing={list.isRefetching} onRefresh={() => list.refetch()}>
      <PageHeader eyebrow="Retos" title="Pasos pequeños que se notan" />
      {list.isPending || catalog.isPending ? (
        <Loading />
      ) : list.isError || catalog.isError ? (
        <ErrorState error={list.error ?? catalog.error} retry={() => (list.refetch(), catalog.refetch())} />
      ) : (
        <>
          <ActiveSection active={list.data.active} today={list.data.today} />

          <View style={{ gap: space[3] }}>
            <SectionHeader title="Catálogo" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }} accessibilityLabel="Filtrar por pilar">
              <Chip label="Todos" selected={filter === 'all'} onPress={() => setFilter('all')} />
              {PILLAR_IDS.map((p) => (
                <Chip key={p} label={pillarShort(p)} selected={filter === p} onPress={() => setFilter(p)} />
              ))}
            </ScrollView>
            {catalog.data
              .filter((c) => filter === 'all' || c.pillar === filter)
              .map((c) => (
                <CatalogCard key={c.key} c={c} active={list.data.active} />
              ))}
          </View>

          {list.data.past.length > 0 && (
            <View style={{ gap: space[3] }}>
              <SectionHeader title="Últimos 60 días" />
              <Card>
                {list.data.past.map((c) => (
                  <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                    <View style={{ flex: 1 }}>
                      <T v="body">{c.title}</T>
                      <T v="small" tint="muted">
                        {shortDay(c.startedOn)} · {c.doneDays}/{c.durationDays} días
                      </T>
                    </View>
                    <T v="small" tint={c.status === 'completed' ? 'primary' : 'muted'}>
                      {STATUS[c.status]}
                    </T>
                  </View>
                ))}
              </Card>
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

function ActiveSection({ active, today }: { active: UserChallenge[]; today: string }) {
  const toggle = useToggleChallenge();
  const refresh = useRefresh();
  const toast = useToast();
  const [ending, setEnding] = useState<UserChallenge | null>(null);

  const switchLevel = useMutation({
    mutationFn: ({ c, to }: { c: UserChallenge; to: Challenge }) => api.challenges.start(to.key, c.id),
    onSuccess: (c) => {
      toast(`Ahora vas con «${c.title}».`);
      return refresh('challenges');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });
  const finish = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'completed' | 'abandoned' }) => api.challenges.finish(id, status),
    onSuccess: (c) => {
      setEnding(null);
      toast(c.status === 'completed' ? '¡Reto completado!' : 'Reto cerrado. Puedes volver a él cuando quieras.');
      return refresh('challenges');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });

  return (
    <View style={{ gap: space[3] }}>
      <SectionHeader
        title="En curso"
        right={
          <T v="small" tint="muted" style={{ fontVariant: ['tabular-nums'] }}>
            {active.length} de {MAX_ACTIVE}
          </T>
        }
      />
      {active.length ? (
        active.map((c) => {
          const up = adjacentLevel(c.key, 1);
          const down = adjacentLevel(c.key, -1);
          return (
            <ChallengeCard key={c.id} c={c} busy={toggle.isPending} onToggleToday={() => toggle.mutate({ id: c.id, date: today, done: !c.doneToday })}>
              {up && <Button small variant="link" label="Subir nivel" accessibilityHint={up.title} onPress={() => switchLevel.mutate({ c, to: up })} disabled={switchLevel.isPending} />}
              {down && <Button small variant="link" label="Bajar nivel" accessibilityHint={down.title} onPress={() => switchLevel.mutate({ c, to: down })} disabled={switchLevel.isPending} />}
              <Button small variant="link" label="Terminar" onPress={() => setEnding(c)} />
            </ChallengeCard>
          );
        })
      ) : (
        <EmptyState title="No tienes retos en curso">Elige uno del catálogo. Te recomendamos empezar por el nivel 1 del pilar que más te cuesta.</EmptyState>
      )}

      <Sheet open={!!ending} onClose={() => setEnding(null)} title="Terminar el reto">
        {ending && (
          <>
            <T v="body">
              Llevas {ending.doneDays} de {ending.durationDays} días en «{ending.title}». ¿Cómo quieres cerrarlo?
            </T>
            <Button label="Darlo por completado" onPress={() => finish.mutate({ id: ending.id, status: 'completed' })} disabled={finish.isPending} />
            <Button variant="secondary" label="Dejarlo por ahora" onPress={() => finish.mutate({ id: ending.id, status: 'abandoned' })} disabled={finish.isPending} />
          </>
        )}
      </Sheet>
    </View>
  );
}

function CatalogCard({ c, active }: { c: Challenge; active: UserChallenge[] }) {
  const { colors, pillar: tone } = useTheme();
  const refresh = useRefresh();
  const toast = useToast();
  const start = useMutation({
    mutationFn: () => api.challenges.start(c.key),
    onSuccess: () => {
      toast(`Reto aceptado: ${c.title}`);
      return refresh('challenges');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });
  const running = active.some((a) => a.key === c.key);
  const full = active.length >= MAX_ACTIVE;

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <PillarTag pillar={c.pillar} />
        <View style={{ flexDirection: 'row', gap: 4 }} accessible accessibilityLabel={`Nivel ${c.level} de 3`}>
          {[1, 2, 3].map((n) => (
            <View key={n} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: n <= c.level ? tone(c.pillar).chart : colors.line }} />
          ))}
        </View>
      </View>
      <View style={{ gap: space[1] }}>
        <T v="heading">{c.title}</T>
        <T v="small" tint="muted">
          {c.description}
        </T>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T v="small" tint="muted">
          {c.durationDays} días
        </T>
        {running ? (
          <T v="small" tint="primary">
            En curso
          </T>
        ) : (
          <Button
            small
            variant="secondary"
            label="Empezar"
            onPress={() => start.mutate()}
            busy={start.isPending}
            disabled={full}
            accessibilityHint={full ? 'Puedes tener hasta 3 retos a la vez' : undefined}
          />
        )}
      </View>
    </Card>
  );
}
