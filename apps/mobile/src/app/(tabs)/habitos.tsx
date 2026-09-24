import type { Habit } from '@dyc/api-client';
import { addDays, daysLabel, isScheduled, PILLAR_IDS, shortDay, WEEKDAYS, weekdayShort, type Day, type PillarId } from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Check, Pencil, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { pillarShort, PillarTag } from '../../components/pillar';
import { Sheet } from '../../components/Sheet';
import { Button, Card, Chip, EmptyState, ErrorState, errorMessage, Field, Loading, PageHeader, Screen, T, fonts } from '../../components/ui';
import { api } from '../../lib/api';
import { keys, useHabits, useRefresh } from '../../lib/queries';
import { useTheme } from '../../lib/theme';
import { useToast } from '../../lib/toast';

const IDEAS: Array<{ title: string; pillar: PillarId }> = [
  { title: 'Caminar 10 minutos', pillar: 'movimiento' },
  { title: 'Pantallas fuera 30 minutos antes de dormir', pillar: 'descanso' },
  { title: 'Un vaso de agua al despertar', pillar: 'alimentacion' },
  { title: 'Un bloque de trabajo sin notificaciones', pillar: 'enfoque' },
  { title: 'Escribir a alguien que aprecio', pillar: 'relaciones' },
  { title: 'Una línea en el diario', pillar: 'proposito' },
];

export default function Habits() {
  const { colors } = useTheme();
  const [showArchived, setShowArchived] = useState(false);
  const habits = useHabits(showArchived);
  const [editing, setEditing] = useState<Habit | 'new' | null>(null);

  const list = habits.data?.habits ?? [];
  const active = list.filter((h) => !h.archived);
  const archived = list.filter((h) => h.archived);

  return (
    <Screen refreshing={habits.isRefetching} onRefresh={() => habits.refetch()}>
      <PageHeader eyebrow="Hábitos" title="Lo que repites te construye" />
      <Button label="Nuevo hábito" icon={<Plus size={18} color={colors.onPrimary} />} onPress={() => setEditing('new')} />

      {habits.isPending ? (
        <Loading />
      ) : habits.isError ? (
        <ErrorState error={habits.error} retry={() => habits.refetch()} />
      ) : (
        <>
          {active.length ? (
            active.map((h) => <HabitCard key={h.id} h={h} today={habits.data.today} onEdit={() => setEditing(h)} />)
          ) : (
            <EmptyState title="Aún no tienes hábitos">
              Empieza con uno tan pequeño que no puedas fallar. Algunas ideas: {IDEAS.map((i) => i.title.toLowerCase()).slice(0, 3).join(', ')}.
            </EmptyState>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: touchTarget }}>
            <T v="label" nativeID="archived-label">
              Mostrar archivados
            </T>
            <Switch
              accessibilityLabel="Mostrar archivados"
              value={showArchived}
              onValueChange={setShowArchived}
              trackColor={{ true: colors.primary, false: colors.lineStrong }}
              thumbColor={colors.surface}
            />
          </View>
          {showArchived &&
            (archived.length ? (
              archived.map((h) => <HabitCard key={h.id} h={h} today={habits.data.today} onEdit={() => setEditing(h)} />)
            ) : (
              <T v="small" tint="muted">
                No tienes hábitos archivados.
              </T>
            ))}
        </>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo hábito' : 'Editar hábito'}>
        {editing !== null && <HabitForm habit={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </Screen>
  );
}

function HabitCard({ h, today, onEdit }: { h: Habit; today: Day; onEdit: () => void }) {
  const { colors, pillar: tone } = useTheme();
  const qc = useQueryClient();
  const refresh = useRefresh();
  const toast = useToast();
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).filter((d) => d >= h.startsOn);

  const log = useMutation({
    mutationFn: ({ date, done }: { date: Day; done: boolean }) => api.habits.log(h.id, date, done),
    onMutate: ({ date, done }) => {
      // Se marca al instante; si falla, se recarga la lista real.
      qc.setQueriesData<{ today: Day; habits: Habit[] }>({ queryKey: ['habits'] }, (d) =>
        d && { ...d, habits: d.habits.map((x) => (x.id === h.id ? { ...x, recent: [...(x.recent ?? []).filter((r) => r.date !== date), { date, done }] } : x)) },
      );
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
    onSettled: () => refresh('habits'),
  });
  const archive = useMutation({
    mutationFn: () => api.habits.update(h.id, { archived: !h.archived }),
    onSuccess: () => {
      toast(h.archived ? 'Hábito recuperado.' : 'Hábito archivado. Su historial se conserva.');
      return refresh('habits');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });

  const doneOn = (d: Day) => h.recent?.some((r) => r.date === d && r.done) ?? false;
  const t = tone(h.pillar);

  return (
    <Card style={h.archived && { opacity: 0.7 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[2] }}>
        <View style={{ flex: 1, gap: space[1] }}>
          <T v="heading">{h.title}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
            <PillarTag pillar={h.pillar} />
            <T v="small" tint="muted">
              {daysLabel(h.days)}
            </T>
          </View>
        </View>
        <IconButton label={`Editar «${h.title}»`} onPress={onEdit}>
          <Pencil size={18} color={colors.inkMuted} />
        </IconButton>
        <IconButton label={h.archived ? `Recuperar «${h.title}»` : `Archivar «${h.title}»`} onPress={() => archive.mutate()} disabled={archive.isPending}>
          {h.archived ? <ArchiveRestore size={18} color={colors.inkMuted} /> : <Archive size={18} color={colors.inkMuted} />}
        </IconButton>
      </View>
      {!h.archived && week.length > 0 && (
        <View style={{ flexDirection: 'row' }} accessibilityLabel={`Últimos días de «${h.title}»`}>
          {week.map((d) => {
            const done = doneOn(d);
            const scheduled = isScheduled(h.days, d);
            return (
              <Pressable
                key={d}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: done }}
                accessibilityLabel={`${d === today ? 'Hoy' : shortDay(d)}${scheduled ? '' : ' (no tocaba)'}`}
                onPress={() => log.mutate({ date: d, done: !done })}
                style={{ width: `${100 / 7}%`, alignItems: 'center', gap: 4, minHeight: touchTarget + 8, opacity: scheduled ? 1 : 0.55 }}
              >
                <T v="small" tint={d === today ? 'ink' : 'subtle'} style={d === today && { fontFamily: fonts.semibold }}>
                  {weekdayShort(d).slice(0, 1).toUpperCase()}
                </T>
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: radius.pill,
                    borderWidth: 2,
                    borderColor: done ? t.chart : colors.lineStrong,
                    backgroundColor: done ? t.chart : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {done && <Check size={14} strokeWidth={2.5} color={colors.surface} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Card>
  );
}

function IconButton({ label, onPress, disabled, children }: { label: string; onPress: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} style={{ width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', marginTop: -space[2] }}>
      {children}
    </Pressable>
  );
}

function HabitForm({ habit, onDone }: { habit: Habit | null; onDone: () => void }) {
  const { colors } = useTheme();
  const [title, setTitle] = useState(habit?.title ?? '');
  const [pillar, setPillar] = useState<PillarId>(habit?.pillar ?? 'movimiento');
  const [days, setDays] = useState(habit?.days ?? '1234567');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const refresh = useRefresh();
  const toast = useToast();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => (habit ? api.habits.update(habit.id, { title: title.trim(), pillar, days }) : api.habits.create({ title: title.trim(), pillar, days })),
    onSuccess: async () => {
      toast(habit ? 'Hábito actualizado.' : 'Hábito creado. Aparecerá en Hoy.');
      await refresh('habits');
      onDone();
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });
  const remove = useMutation({
    mutationFn: () => api.habits.remove((habit as Habit).id),
    onSuccess: async () => {
      qc.removeQueries({ queryKey: keys.habits(true) });
      toast('Hábito eliminado.');
      await refresh('habits');
      onDone();
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });

  const toggleDay = (iso: string) => setDays((d) => (d.includes(iso) ? d.replace(iso, '') : [...d, iso].sort().join('')));

  return (
    <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <Field label="¿Qué vas a hacer?" value={title} onChangeText={setTitle} maxLength={120} placeholder="Caminar 10 minutos después de comer" />
      {!habit && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }} accessibilityLabel="Ideas">
          {IDEAS.map((i) => (
            <Chip
              key={i.title}
              label={i.title}
              selected={title === i.title}
              onPress={() => {
                setTitle(i.title);
                setPillar(i.pillar);
              }}
            />
          ))}
        </ScrollView>
      )}
      <View style={{ gap: space[2] }}>
        <T v="label">Pilar</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }} accessibilityRole="radiogroup" accessibilityLabel="Pilar">
          {PILLAR_IDS.map((p) => (
            <Chip key={p} label={pillarShort(p)} selected={pillar === p} onPress={() => setPillar(p)} />
          ))}
        </View>
      </View>
      <View style={{ gap: space[2] }}>
        <T v="label">Días</T>
        <View style={{ flexDirection: 'row', gap: space[1] }}>
          {WEEKDAYS.map((w) => {
            const on = days.includes(w.iso);
            return (
              <Pressable
                key={w.iso}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={w.label}
                onPress={() => toggleDay(w.iso)}
                style={{ flex: 1, height: touchTarget, borderRadius: radius.md, borderWidth: 1, borderColor: on ? colors.primary : colors.lineStrong, backgroundColor: on ? colors.primary : colors.surface, alignItems: 'center', justifyContent: 'center' }}
              >
                <T v="label" style={{ color: on ? colors.onPrimary : colors.ink }}>
                  {w.label}
                </T>
              </Pressable>
            );
          })}
        </View>
        <T v="small" tint={days ? 'muted' : 'danger'}>
          {days ? daysLabel(days) : 'Elige al menos un día.'}
        </T>
      </View>

      {confirmDelete ? (
        <View accessibilityRole="alert" style={{ backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: space[3], gap: space[3] }}>
          <T v="small" style={{ color: colors.danger }}>
            Se borrará el hábito y todo su historial. Si quieres conservarlo, archívalo.
          </T>
          <Button small variant="danger" label="Borrar definitivamente" onPress={() => remove.mutate()} busy={remove.isPending} />
          <Button small variant="ghost" label="Cancelar" onPress={() => setConfirmDelete(false)} />
        </View>
      ) : (
        <View style={{ gap: space[2] }}>
          <Button label={habit ? 'Guardar' : 'Crear hábito'} onPress={() => save.mutate()} busy={save.isPending} disabled={!title.trim() || !days} />
          {habit && <Button variant="ghost" label="Borrar" onPress={() => setConfirmDelete(true)} />}
        </View>
      )}
    </ScrollView>
  );
}
