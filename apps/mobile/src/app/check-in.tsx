import { addDays, fromCheckIn, legacyList, longDay, mergeToolSignals, parseNumber, PILLAR_IDS, todayIn, toCheckInPayload, toolSignals, type CheckInValues, type Day, type PillarId, type ToolSignals } from '@dyc/core';
import { space, touchTarget } from '@dyc/tokens';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { PillarIcon, pillarName } from '../components/pillar';
import { Disclosure } from '../components/tools';
import { Button, Card, ErrorState, errorMessage, Field, Loading, Scale, Screen, T } from '../components/ui';
import { api } from '../lib/api';
import { newId, useLegacyData, useModule, useModuleObject } from '../lib/legacy';
import { keys, useProfile, useRefresh } from '../lib/queries';
import { useTheme } from '../lib/theme';
import { useToast } from '../lib/toast';

export default function CheckInScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const profile = useProfile();
  const today = todayIn(profile.data?.timezone ?? 'UTC');
  const [date, setDate] = useState<Day>(today);
  const existing = useQuery({ queryKey: keys.checkIns(date, date), queryFn: () => api.checkIns.list(date, date) });
  const legacy = useLegacyData();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={Platform.OS === 'ios' ? [] : ['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
          <View style={{ flex: 1, gap: space[1] }}>
            <T v="eyebrow" tint="muted">
              {date === today ? 'Check-in de hoy' : 'Check-in'}
            </T>
            <T v="title" accessibilityRole="header">
              {longDay(date)}
            </T>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={close} style={{ width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' }}>
            <X size={22} color={colors.ink} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Button small variant="ghost" label="Día anterior" icon={<ChevronLeft size={18} color={colors.primary} />} onPress={() => setDate(addDays(date, -1))} />
          <Button
            small
            variant="ghost"
            label="Día siguiente"
            icon={<ChevronRight size={18} color={colors.primary} />}
            onPress={() => setDate(addDays(date, 1))}
            disabled={date >= today}
          />
        </View>
        {existing.isPending || legacy.isPending ? (
          <Loading />
        ) : existing.isError ? (
          <ErrorState error={existing.error} retry={() => existing.refetch()} />
        ) : (
          <CheckInForm
            key={date}
            date={date}
            initial={fromCheckIn(existing.data.checkIns[0])}
            signals={legacy.data ? toolSignals(legacy.data.data, date) : {}}
            journalId={legacyList(legacy.data?.data, 'journal').find((j) => j.date === date)?.id}
            chosen={profile.data?.focusPillars ?? []}
            isToday={date === today}
            onSaved={close}
          />
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Section({ pillar, title, children }: { pillar: PillarId; title?: string; children: ReactNode }) {
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <PillarIcon pillar={pillar} />
        <T v="heading" accessibilityRole="header">
          {title ?? pillarName(pillar)}
        </T>
      </View>
      {children}
    </Card>
  );
}

const asText = (n: number | null) => (n === null ? '' : String(n));

type Rest = Exclude<PillarId, 'enfoque'>;
const FIELDS: Record<Rest, Array<keyof CheckInValues>> = {
  movimiento: ['energy', 'activeMinutes'],
  descanso: ['sleepHours', 'sleepQuality'],
  alimentacion: ['nutrition', 'water'],
  relaciones: ['connection'],
  proposito: ['purpose', 'gratitude', 'note'],
};

function CheckInForm({
  date,
  initial,
  signals,
  journalId,
  chosen,
  isToday,
  onSaved,
}: {
  date: Day;
  initial: CheckInValues;
  signals: ToolSignals;
  journalId?: string;
  chosen: PillarId[];
  isToday: boolean;
  onSaved: () => void;
}) {
  const [merged] = useState(() => mergeToolSignals(initial, signals));
  const [v, setV] = useState<CheckInValues>(merged.values);
  // Los campos numéricos se editan como texto para permitir "7," a medio escribir.
  const [text, setText] = useState({ activeMinutes: asText(merged.values.activeMinutes), sleepHours: asText(merged.values.sleepHours), water: asText(merged.values.water) });
  const refresh = useRefresh();
  const toast = useToast();
  const dayLog = useModuleObject('dayLog');
  const journal = useModule('journal');
  const set = <K extends keyof CheckInValues>(k: K) => (value: CheckInValues[K]) => setV((s) => ({ ...s, [k]: value }));
  const setNum = (k: keyof typeof text) => (s: string) => {
    setText((t) => ({ ...t, [k]: s }));
    set(k)(parseNumber(s));
  };
  const from = (k: keyof ToolSignals, extra?: string) => [merged.from[k] && v[k] === signals[k] ? `Ya registrado en ${merged.from[k]}.` : null, extra].filter(Boolean).join(' ') || undefined;

  const save = useMutation({
    mutationFn: () => api.checkIns.save(date, toCheckInPayload(v)),
    onSuccess: async () => {
      // Una sola fuente: el agua de hoy y la gratitud vuelven también a Rutina y Diario.
      if (isToday && typeof v.water === 'number' && v.water !== signals.water) dayLog.patch({ dateKey: date, water: v.water }, { undo: false });
      const thanks = (v.gratitude ?? '').trim();
      if (thanks && thanks !== signals.gratitude) {
        if (journalId) journal.update(journalId, { gratitude: thanks }, { undo: false });
        else journal.add({ id: newId(), date, mood: '', gratitude: thanks, note: '' }, { undo: false });
      }
      await refresh('checkins');
      toast('Check-in guardado.');
      onSaved();
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });

  const sections: Record<Rest, ReactNode> = {
    movimiento: (
      <Section key="movimiento" pillar="movimiento">
        <Scale legend="Energía" value={v.energy} onChange={set('energy')} low="Muy baja" high="Muy alta" />
        <Field label="Minutos de actividad" keyboardType="number-pad" value={text.activeMinutes} onChangeText={setNum('activeMinutes')} hint={from('activeMinutes', 'Caminar cuenta. La referencia son 30 minutos.')} maxLength={4} />
      </Section>
    ),
    descanso: (
      <Section key="descanso" pillar="descanso">
        <Field label="Horas de sueño" keyboardType="decimal-pad" value={text.sleepHours} onChangeText={setNum('sleepHours')} hint={from('sleepHours')} maxLength={4} />
        <Scale legend="Calidad del sueño" value={v.sleepQuality} onChange={set('sleepQuality')} low="Mala" high="Reparador" />
      </Section>
    ),
    alimentacion: (
      <Section key="alimentacion" pillar="alimentacion">
        <Scale legend="¿Cómo comiste?" value={v.nutrition} onChange={set('nutrition')} low="Desordenado" high="Muy bien" />
        <Field label="Vasos de agua" keyboardType="number-pad" value={text.water} onChangeText={setNum('water')} hint={from('water', 'Referencia: 8 vasos.')} maxLength={2} />
      </Section>
    ),
    relaciones: (
      <Section key="relaciones" pillar="relaciones">
        <Scale legend="Conexión con tu pareja" value={v.connection} onChange={set('connection')} low="Distantes" high="Muy unidos" />
      </Section>
    ),
    proposito: (
      <Section key="proposito" pillar="proposito" title="Propósito y reflexión">
        <Scale legend="Sentido de lo que hiciste hoy" value={v.purpose} onChange={set('purpose')} low="Poco" high="Mucho" />
        <Field label="Algo que agradeces" value={v.gratitude ?? ''} onChangeText={set('gratitude')} maxLength={1000} multiline hint={from('gratitude', 'Se guarda también en tu Diario.')} />
        <Field label="Reflexión del día" value={v.note ?? ''} onChangeText={set('note')} maxLength={4000} multiline hint="Solo tú la ves." />
      </Section>
    ),
  };
  const rest = PILLAR_IDS.filter((p): p is Rest => p !== 'enfoque');
  // Tus pilares primero; los demás, plegados (abiertos si ya tienen algo).
  const mine = chosen.length ? rest.filter((p) => chosen.includes(p)) : rest;
  const others = rest.filter((p) => !mine.includes(p));
  const [showOthers, setShowOthers] = useState(() => others.some((p) => FIELDS[p].some((k) => v[k] !== null && v[k] !== undefined && v[k] !== '')));

  return (
    <View style={{ gap: space[4] }}>
      <T v="small" tint="muted">
        Todo es opcional. Registra lo que te sirva hoy; lo que dejes en blanco no cuenta en tu puntuación.
      </T>

      <Section pillar="enfoque" title="Ánimo y mente">
        <Scale legend="Ánimo" value={v.mood} onChange={set('mood')} low="Bajo" high="Muy bien" />
        <Scale legend="Estrés" value={v.stress} onChange={set('stress')} low="Tranquila/o" high="Mucho" />
      </Section>

      {mine.map((p) => sections[p])}

      {others.length > 0 && (
        <>
          <Disclosure label="Otros pilares" count={String(others.length)} open={showOthers} onToggle={() => setShowOthers((o) => !o)} a11yLabel={`Otros pilares (${others.length}), no están entre tus prioridades`} />
          {showOthers && others.map((p) => sections[p])}
        </>
      )}

      <Button label="Guardar check-in" onPress={() => save.mutate()} busy={save.isPending} />
    </View>
  );
}
