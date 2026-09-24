import { addDays, fromCheckIn, longDay, parseNumber, todayIn, toCheckInPayload, type CheckInValues, type Day, type PillarId } from '@dyc/core';
import { space, touchTarget } from '@dyc/tokens';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { PillarIcon, pillarName } from '../components/pillar';
import { Button, Card, ErrorState, errorMessage, Field, Loading, Scale, Screen, T } from '../components/ui';
import { api } from '../lib/api';
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
        {existing.isPending ? (
          <Loading />
        ) : existing.isError ? (
          <ErrorState error={existing.error} retry={() => existing.refetch()} />
        ) : (
          <CheckInForm key={date} date={date} initial={fromCheckIn(existing.data.checkIns[0])} onSaved={close} />
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

function CheckInForm({ date, initial, onSaved }: { date: Day; initial: CheckInValues; onSaved: () => void }) {
  const [v, setV] = useState<CheckInValues>(initial);
  // Los campos numéricos se editan como texto para permitir "7," a medio escribir.
  const [text, setText] = useState({ activeMinutes: asText(initial.activeMinutes), sleepHours: asText(initial.sleepHours), water: asText(initial.water) });
  const refresh = useRefresh();
  const toast = useToast();
  const set = <K extends keyof CheckInValues>(k: K) => (value: CheckInValues[K]) => setV((s) => ({ ...s, [k]: value }));
  const setNum = (k: keyof typeof text) => (s: string) => {
    setText((t) => ({ ...t, [k]: s }));
    set(k)(parseNumber(s));
  };

  const save = useMutation({
    mutationFn: () => api.checkIns.save(date, toCheckInPayload(v)),
    onSuccess: async () => {
      await refresh('checkins');
      toast('Check-in guardado.');
      onSaved();
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });

  return (
    <View style={{ gap: space[4] }}>
      <T v="small" tint="muted">
        Todo es opcional. Registra lo que te sirva hoy; lo que dejes en blanco no cuenta en tu puntuación.
      </T>

      <Section pillar="enfoque" title="Ánimo y mente">
        <Scale legend="Ánimo" value={v.mood} onChange={set('mood')} low="Bajo" high="Muy bien" />
        <Scale legend="Estrés" value={v.stress} onChange={set('stress')} low="Tranquila/o" high="Mucho" />
      </Section>

      <Section pillar="movimiento">
        <Scale legend="Energía" value={v.energy} onChange={set('energy')} low="Muy baja" high="Muy alta" />
        <Field label="Minutos de actividad" keyboardType="number-pad" value={text.activeMinutes} onChangeText={setNum('activeMinutes')} hint="Caminar cuenta. La referencia son 30 minutos." maxLength={4} />
      </Section>

      <Section pillar="descanso">
        <Field label="Horas de sueño" keyboardType="decimal-pad" value={text.sleepHours} onChangeText={setNum('sleepHours')} maxLength={4} />
        <Scale legend="Calidad del sueño" value={v.sleepQuality} onChange={set('sleepQuality')} low="Mala" high="Reparador" />
      </Section>

      <Section pillar="alimentacion">
        <Scale legend="¿Cómo comiste?" value={v.nutrition} onChange={set('nutrition')} low="Desordenado" high="Muy bien" />
        <Field label="Vasos de agua" keyboardType="number-pad" value={text.water} onChangeText={setNum('water')} hint="Referencia: 8 vasos." maxLength={2} />
      </Section>

      <Section pillar="relaciones">
        <Scale legend="Conexión con otras personas" value={v.connection} onChange={set('connection')} low="Aislada/o" high="Muy conectada/o" />
      </Section>

      <Section pillar="proposito" title="Propósito y reflexión">
        <Scale legend="Sentido de lo que hiciste hoy" value={v.purpose} onChange={set('purpose')} low="Poco" high="Mucho" />
        <Field label="Algo que agradeces" value={v.gratitude ?? ''} onChangeText={set('gratitude')} maxLength={1000} multiline />
        <Field label="Reflexión del día" value={v.note ?? ''} onChangeText={set('note')} maxLength={4000} multiline hint="Solo tú la ves." />
      </Section>

      <Button label="Guardar check-in" onPress={() => save.mutate()} busy={save.isPending} />
    </View>
  );
}
