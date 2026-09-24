import { ApiError, type Profile } from '@dyc/api-client';
import { ACTIVITY_LEVELS, deviceTimeZone, firstName, PILLAR_IDS, starterChallenge, suggestedPillar, type PillarId, type ProfileInput } from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Logo } from '../components/Logo';
import { PillarIcon, pillarDescription, pillarName } from '../components/pillar';
import { Button, Card, errorMessage, Field, Scale, Screen, Segmented, T } from '../components/ui';
import { api, useAuth } from '../lib/api';
import { keys, useProfile } from '../lib/queries';
import { useTheme } from '../lib/theme';
import { useToast } from '../lib/toast';

const STEPS = 4;
const MAX_FOCUS = 3;
const ACTIVITY_LABELS: Record<(typeof ACTIVITY_LEVELS)[number], string> = { sedentaria: 'Poca', ligera: 'Ligera', moderada: 'Moderada', alta: 'Alta' };
const isTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

export default function Onboarding() {
  const session = useAuth();
  const profile = useProfile();
  const qc = useQueryClient();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [focus, setFocus] = useState<PillarId[]>([]);
  const [baseline, setBaseline] = useState<Partial<Record<PillarId, number>>>({});
  const [energy, setEnergy] = useState<number | null>(null);
  const [activity, setActivity] = useState<(typeof ACTIVITY_LEVELS)[number]>('ligera');
  const [wake, setWake] = useState('07:00');
  const [bed, setBed] = useState('23:00');
  const [intention, setIntention] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);

  // Retoma lo que la persona ya había respondido.
  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setFocus(p.focusPillars);
    setBaseline(p.baseline);
    if (p.energyLevel) setEnergy(p.energyLevel);
    if (p.activityLevel) setActivity(p.activityLevel);
    if (p.wakeTime) setWake(p.wakeTime);
    if (p.bedTime) setBed(p.bedTime);
    if (p.intention) setIntention(p.intention);
  }, [profile.data]);

  const save = useMutation({ mutationFn: (input: ProfileInput) => api.profile.update(input), onSuccess: (p: Profile) => qc.setQueryData(keys.profile, p) });

  // Al completar, el perfil pasa a "onboarded" y la navegación lleva a Hoy sola.
  const finish = useMutation({
    mutationFn: async (challengeKey: string | null) => {
      // Un 409 es un reintento: el reto ya quedó creado la primera vez.
      if (challengeKey)
        await api.challenges.start(challengeKey).catch((e) => {
          if (!(e instanceof ApiError && e.status === 409)) throw e;
        });
      return api.profile.update({ completeOnboarding: true });
    },
    onSuccess: (p, challengeKey) => {
      toast(challengeKey ? 'Listo. Tu primer reto empieza hoy.' : 'Listo. Empecemos por hoy.');
      qc.setQueryData(keys.profile, p);
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });

  const next = async (input?: ProfileInput) => {
    if (input) {
      try {
        await save.mutateAsync(input);
      } catch (e) {
        toast(errorMessage(e), { tone: 'error' });
        return;
      }
    }
    setStep((s) => s + 1);
  };

  const pillar = suggestedPillar(focus, baseline);
  const options = [...new Set([pillar, ...focus])].map(starterChallenge);
  useEffect(() => {
    if (step === 4 && chosen === null) setChosen(starterChallenge(pillar).key);
  }, [step, pillar, chosen]);

  const toggleFocus = (p: PillarId) => setFocus((f) => (f.includes(p) ? f.filter((x) => x !== p) : f.length >= MAX_FOCUS ? f : [...f, p]));
  const busy = save.isPending || finish.isPending;
  const name = session.status === 'signedIn' ? firstName(session.user.name) : '';
  const back = () => setStep((s) => s - 1);

  return (
    <Screen edges={['top', 'bottom']} contentStyle={{ maxWidth: 560 }}>
      <View style={styles.top}>
        <Logo withName={step === 0} />
        {step > 0 && <Progress step={step} />}
      </View>

      {step === 0 && (
        <View style={{ gap: space[6] }}>
          <T v="eyebrow" tint="muted">
            Bienvenida
          </T>
          <T v="display" accessibilityRole="header">
            {name ? `Hola, ${name}.` : 'Hola.'} Diseñemos tu forma de estar bien.
          </T>
          <T v="lead" tint="muted">
            Design Your Core organiza tu bienestar en seis pilares. Cada día registras cómo estás en menos de un minuto, sumas hábitos pequeños y aceptas retos a tu medida.
          </T>
          <View style={styles.grid}>
            {PILLAR_IDS.map((p) => (
              <PillarMini key={p} pillar={p} />
            ))}
          </View>
          <Button label="Empezar" onPress={() => next({ timezone: deviceTimeZone() })} busy={busy} />
        </View>
      )}

      {step === 1 && (
        <StepBody title="¿En qué quieres enfocarte ahora?" lead="Elige hasta tres pilares. Los demás siguen ahí; esto solo decide por dónde empezamos.">
          <View style={{ gap: space[2] }}>
            {PILLAR_IDS.map((p) => {
              const on = focus.includes(p);
              return (
                <Choice key={p} pillar={p} role="checkbox" selected={on} disabled={!on && focus.length >= MAX_FOCUS} onPress={() => toggleFocus(p)} title={pillarName(p)} body={pillarDescription(p)} />
              );
            })}
          </View>
          <T v="small" tint="muted" accessibilityLiveRegion="polite">
            {focus.length === MAX_FOCUS ? 'Tienes tres pilares elegidos.' : `Elegidos: ${focus.length} de ${MAX_FOCUS}.`}
          </T>
          <StepNav onBack={back} onNext={() => next({ focusPillars: focus })} disabled={!focus.length} busy={busy} />
        </StepBody>
      )}

      {step === 2 && (
        <StepBody title="¿Cómo te sientes hoy en cada pilar?" lead="Sin pensarlo mucho: 1 es «me cuesta mucho», 5 es «lo tengo resuelto». Puedes saltarte los que no sepas.">
          {PILLAR_IDS.map((p) => (
            <Card key={p}>
              <View style={styles.row}>
                <PillarIcon pillar={p} />
                <T v="heading">{pillarName(p)}</T>
              </View>
              <Scale legend={`Tu punto de partida en ${pillarName(p)}`} value={baseline[p]} onChange={(v) => setBaseline((b) => ({ ...b, [p]: v ?? undefined }))} low="Me cuesta" high="Resuelto" />
            </Card>
          ))}
          <StepNav onBack={back} onNext={() => next({ baseline: Object.fromEntries(Object.entries(baseline).filter(([, v]) => v)) as ProfileInput['baseline'] })} busy={busy} />
        </StepBody>
      )}

      {step === 3 && (
        <StepBody title="Tu ritmo" lead="Nos ayuda a proponerte retos que quepan en tu día.">
          <Card>
            <Scale legend="¿Cómo suele estar tu energía?" value={energy} onChange={setEnergy} low="Baja" high="Alta" />
            <T v="label">¿Cuánta actividad física haces?</T>
            <Segmented label="Actividad física" value={activity} onChange={setActivity} options={ACTIVITY_LEVELS.map((a) => ({ value: a, label: ACTIVITY_LABELS[a] }))} />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Field label="Sueles despertar a las" value={wake} onChangeText={setWake} keyboardType="numbers-and-punctuation" maxLength={5} error={isTime(wake) ? null : 'Usa el formato 07:30.'} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Y dormir a las" value={bed} onChangeText={setBed} keyboardType="numbers-and-punctuation" maxLength={5} error={isTime(bed) ? null : 'Usa el formato 23:00.'} />
              </View>
            </View>
            <Field
              label="Tu intención (opcional)"
              hint="Una frase para recordar por qué empiezas."
              placeholder="Por ejemplo: terminar el día con energía para mi familia."
              value={intention}
              onChangeText={setIntention}
              maxLength={280}
              multiline
            />
          </Card>
          <StepNav
            onBack={back}
            onNext={() =>
              next({
                activityLevel: activity,
                intention: intention.trim(),
                ...(energy ? { energyLevel: energy } : {}),
                ...(isTime(wake) ? { wakeTime: wake } : {}),
                ...(isTime(bed) ? { bedTime: bed } : {}),
              })
            }
            busy={busy}
          />
        </StepBody>
      )}

      {step === 4 && (
        <StepBody title="Tu primer reto" lead="Pequeño a propósito: lo importante es cumplirlo. Si te queda corto o largo, luego lo ajustas.">
          <View style={{ gap: space[2] }} accessibilityRole="radiogroup" accessibilityLabel="Elige tu primer reto">
            {options.map((c) => (
              <Choice
                key={c.key}
                pillar={c.pillar}
                role="radio"
                selected={chosen === c.key}
                onPress={() => setChosen(c.key)}
                title={c.title}
                body={c.description}
                meta={`${pillarName(c.pillar)} · ${c.durationDays} días`}
              />
            ))}
          </View>
          <Button label="Empezar este reto" onPress={() => finish.mutate(chosen)} busy={finish.isPending && finish.variables !== null} disabled={busy || !chosen} />
          <View style={styles.between}>
            <Button variant="ghost" label="Atrás" onPress={back} disabled={busy} />
            <Button variant="ghost" label="Ahora no" onPress={() => finish.mutate(null)} disabled={busy} />
          </View>
        </StepBody>
      )}
    </Screen>
  );
}

function Progress({ step }: { step: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'flex-end', gap: space[1] }} accessible accessibilityLabel={`Paso ${step} de ${STEPS}`}>
      <T v="small" tint="muted">
        Paso {step} de {STEPS}
      </T>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {Array.from({ length: STEPS }, (_, i) => (
          <View key={i} style={{ width: 20, height: 4, borderRadius: 2, backgroundColor: i < step ? colors.primary : colors.line }} />
        ))}
      </View>
    </View>
  );
}

function StepBody({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <View style={{ gap: space[5] }}>
      <View style={{ gap: space[2] }}>
        <T v="title" accessibilityRole="header">
          {title}
        </T>
        <T v="lead" tint="muted">
          {lead}
        </T>
      </View>
      {children}
    </View>
  );
}

function StepNav({ onBack, onNext, disabled, busy }: { onBack: () => void; onNext: () => void; disabled?: boolean; busy: boolean }) {
  return (
    <View style={styles.between}>
      <Button variant="ghost" label="Atrás" onPress={onBack} disabled={busy} />
      <Button label="Continuar" onPress={onNext} disabled={disabled || busy} busy={busy} />
    </View>
  );
}

function PillarMini({ pillar }: { pillar: PillarId }) {
  const { pillar: tone } = useTheme();
  return (
    <View style={[styles.mini, { backgroundColor: tone(pillar).soft }]}>
      <PillarIcon pillar={pillar} />
      <T v="small" style={{ flex: 1, color: tone(pillar).color }}>
        {pillarName(pillar)}
      </T>
    </View>
  );
}

function Choice({
  pillar,
  role,
  selected,
  disabled,
  onPress,
  title,
  body,
  meta,
}: {
  pillar: PillarId;
  role: 'checkbox' | 'radio';
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  title: string;
  body: string;
  meta?: string;
}) {
  const { colors, pillar: tone } = useTheme();
  const t = tone(pillar);
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      accessibilityLabel={title}
      accessibilityHint={body}
      disabled={disabled}
      onPress={onPress}
      style={[styles.choice, { backgroundColor: selected ? t.soft : colors.surface, borderColor: selected ? t.color : colors.line, opacity: disabled ? 0.5 : 1 }]}
    >
      <View style={[styles.choiceIcon, { backgroundColor: selected ? colors.surface : t.soft }]}>
        <PillarIcon pillar={pillar} size={22} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="label">{title}</T>
        <T v="small" tint="muted">
          {body}
        </T>
        {meta && (
          <T v="eyebrow" tint="subtle" style={{ marginTop: space[1] }}>
            {meta}
          </T>
        )}
      </View>
      {selected && <Check size={20} color={t.color} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  mini: { flexBasis: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: space[2], padding: space[3], borderRadius: radius.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[3] },
  choice: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.lg, borderWidth: 1, minHeight: touchTarget },
  choiceIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
