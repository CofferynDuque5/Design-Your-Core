import {
  BREATH_DURATIONS,
  BREATH_PATTERN_ORDER,
  BREATH_PATTERNS,
  BREATH_PHASE_LABEL,
  breathClock,
  breathCycleMs,
  breathExpanded,
  breathPhase,
  focusSpoken,
  meditationKindLabel,
  meditationStats,
  MEDITATION_KIND,
  shortDay,
  utcDayKey,
  type BreathMinutes,
  type BreathPatternId,
  type LegacyMeditation,
} from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { Pause, Play, Square, Trash2 } from 'lucide-react-native';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { IconButton, Stats, ToolScreen } from '../../components/tools';
import { Button, Card, ErrorState, Loading, Segmented, SectionHeader, T, fonts } from '../../components/ui';
import { newId, useLegacyData, useLegacyList, useModule } from '../../lib/legacy';
import { useTheme } from '../../lib/theme';
import { useToast } from '../../lib/toast';

type Status = 'idle' | 'running' | 'paused';
const HISTORY_MAX = 30;
const STAGE = 220;
const SMALL = 0.62;
const minutesText = (n: number) => `${n} ${n === 1 ? 'minuto' : 'minutos'}`;

/** «Reducir movimiento» del sistema: el círculo deja de crecer y encogerse. */
function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduce(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

export default function Breathe() {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const sessions = useLegacyList(legacy.data?.data, 'meditations');
  const actions = useModule('meditations');
  const toast = useToast();
  const reduceMotion = useReduceMotion();
  const [pattern, setPattern] = useState<BreathPatternId>('caja');
  const [minutes, setMinutes] = useState<BreathMinutes>(3);
  const [status, setStatus] = useState<Status>('idle');
  const [elapsedBefore, setElapsedBefore] = useState(0);
  const [message, setMessage] = useState('');
  const startedAt = useRef(0);
  const saved = useRef(false);
  const [, setTick] = useState(0);

  const total = minutes * 60_000;
  const elapsed = status === 'running' ? Math.min(total, elapsedBefore + Date.now() - startedAt.current) : elapsedBefore;
  const now = breathPhase(pattern, elapsed);
  const active = status !== 'idle';
  const announce = (m: string) => {
    setMessage(m);
    AccessibilityInfo.announceForAccessibility(m);
  };

  const save = useCallback(
    (mins: number) => {
      if (saved.current || mins < 1) return false;
      saved.current = true;
      // Como la app anterior y la web: día en UTC, minutos enteros y «respiracion».
      actions.add({ id: newId(), date: utcDayKey(), minutes: mins, kind: MEDITATION_KIND });
      return true;
    },
    [actions],
  );

  const finish = useCallback(() => {
    save(minutes);
    setStatus('idle');
    setElapsedBefore(0);
    const text = `Sesión terminada: ${minutesText(minutes)} de respiración guardados.`;
    setMessage(text);
    AccessibilityInfo.announceForAccessibility(text);
    toast(`¡Bien hecho! ${minutesText(minutes)} de respiración.`);
  }, [minutes, save, toast]);

  // Mientras corre: refresca la pantalla y termina al llegar al final (también al volver a la app).
  useEffect(() => {
    if (status !== 'running') return;
    const t = setInterval(() => {
      if (elapsedBefore + Date.now() - startedAt.current >= total) finish();
      else setTick((n) => n + 1);
    }, 200);
    return () => clearInterval(t);
  }, [status, elapsedBefore, total, finish]);

  // Anuncia solo el cambio de fase («Inhala», «Mantén», «Exhala»), no cada segundo.
  const phaseKey = status === 'running' ? `${Math.floor(elapsed / breathCycleMs(pattern))}-${now.index}` : '';
  const cue = BREATH_PHASE_LABEL[now.phase];
  useEffect(() => {
    if (!phaseKey) return;
    setMessage('');
    AccessibilityInfo.announceForAccessibility(cue);
  }, [phaseKey, cue]);

  // El círculo crece al inhalar, se queda al mantener y se encoge al exhalar, en lo que dura la fase.
  const expanded = active && breathExpanded(pattern, now.index);
  const scale = useRef(new Animated.Value(SMALL)).current;
  useEffect(() => {
    if (reduceMotion) return scale.setValue(SMALL);
    const target = expanded ? 1 : SMALL;
    const anim = Animated.timing(scale, {
      toValue: target,
      duration: status === 'running' ? now.secondsLeft * 1000 : 400,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: Platform.OS !== 'web',
    });
    anim.start();
    return () => anim.stop();
    // Solo al cambiar de fase o de estado; `secondsLeft` es el de ese momento.
  }, [expanded, status, reduceMotion, phaseKey, scale]);

  const start = () => {
    if (status === 'idle') {
      saved.current = false;
      setElapsedBefore(0);
    }
    startedAt.current = Date.now();
    setStatus('running');
  };
  const pause = () => {
    setElapsedBefore(elapsed);
    setStatus('paused');
    announce('En pausa.');
  };
  const stop = () => {
    const mins = Math.floor(elapsed / 60_000);
    const ok = save(mins);
    setStatus('idle');
    setElapsedBefore(0);
    announce(ok ? `Sesión guardada: ${minutesText(mins)}.` : 'Sesión terminada. Con menos de un minuto no se guarda.');
    if (ok) toast(`Sesión guardada: ${minutesText(mins)}.`);
  };

  const today = utcDayKey();
  const { valid, todayMinutes, weekMinutes } = useMemo(() => meditationStats(sessions, today), [sessions, today]);

  const remove = (m: LegacyMeditation) => {
    const order = sessions.map((x) => x.id);
    actions.remove(m.id);
    toast('Sesión eliminada.', {
      action: {
        label: 'Deshacer',
        run: () => {
          actions.add(m);
          actions.reorder(order);
        },
      },
    });
  };

  const tone = now.phase === 'out' ? colors.sage : colors.primary;
  return (
    <ToolScreen title="Respiración" eyebrow="Salud" refreshing={legacy.isRefetching} onRefresh={() => legacy.refetch()}>
      <Card style={{ gap: space[4] }}>
        <Segmented<BreathPatternId>
          label="Técnica"
          value={pattern}
          onChange={setPattern}
          disabled={active}
          options={BREATH_PATTERN_ORDER.map((p) => ({ value: p, label: BREATH_PATTERNS[p].label }))}
        />
        <T v="small" tint="muted" style={{ textAlign: 'center' }}>
          {BREATH_PATTERNS[pattern].hint}
        </T>
        <View style={st.stage}>
          <Animated.View
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={[
              st.circle,
              {
                backgroundColor: active ? (now.phase === 'out' ? colors.sageSoft : colors.primarySoft) : colors.surfaceSunken,
                borderColor: active ? tone : colors.line,
                transform: [{ scale: reduceMotion ? 1 : scale }],
              },
            ]}
          />
          <View style={st.cue}>
            <Text style={{ fontFamily: fonts.display, fontSize: 34, lineHeight: 40, color: colors.ink }} maxFontSizeMultiplier={1.3}>
              {active ? BREATH_PHASE_LABEL[now.phase] : 'Lista'}
            </Text>
            {active && (
              <Text importantForAccessibility="no" accessibilityElementsHidden style={{ fontFamily: fonts.semibold, fontSize: 22, lineHeight: 28, color: colors.inkMuted, fontVariant: ['tabular-nums'] }} maxFontSizeMultiplier={1.3}>
                {now.secondsLeft}
              </Text>
            )}
          </View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline', gap: space[2] }}>
          <Text
            accessibilityRole="timer"
            accessibilityLabel={`Tiempo restante: ${focusSpoken(total - elapsed)}`}
            style={{ fontFamily: fonts.semibold, fontSize: 22, color: colors.ink, fontVariant: ['tabular-nums'] }}
            maxFontSizeMultiplier={1.4}
          >
            {breathClock(total - elapsed)}
          </Text>
          <T v="small" tint="muted">
            de {minutes} min
          </T>
        </View>
        <Segmented
          label="Duración"
          value={String(minutes)}
          onChange={(v) => setMinutes(Number(v) as BreathMinutes)}
          disabled={active}
          options={BREATH_DURATIONS.map((d) => ({ value: String(d), label: `${d} min`, a11yLabel: minutesText(d) }))}
        />
        {status === 'running' ? (
          <Button label="Pausar" icon={<Pause size={18} color={colors.onPrimary} />} onPress={pause} />
        ) : (
          <Button label={status === 'paused' ? 'Continuar' : 'Empezar'} icon={<Play size={18} color={colors.onPrimary} />} onPress={start} />
        )}
        <Button variant="secondary" label="Terminar" icon={<Square size={16} color={colors.primary} />} onPress={stop} disabled={!active} />
        <T v="small" tint="muted" style={{ textAlign: 'center' }}>
          Sigue el texto: «Inhala», «Mantén» y «Exhala». Si terminas antes, se guardan los minutos completos.{reduceMotion ? ' Con «Reducir movimiento» activado, el círculo no se mueve.' : ''}
        </T>
        {message ? (
          <T v="small" tint="subtle" accessibilityLiveRegion="polite" style={{ textAlign: 'center' }}>
            {message}
          </T>
        ) : null}
      </Card>

      <View style={{ gap: space[3] }}>
        <SectionHeader title="Tus minutos de calma" />
        {legacy.isPending ? (
          <Loading label="Cargando tus sesiones" />
        ) : legacy.isError ? (
          <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
        ) : (
          <>
            <Stats
              items={[
                { value: `${weekMinutes} min`, label: 'Esta semana' },
                { value: `${todayMinutes} min`, label: 'Hoy' },
                { value: String(valid.length), label: valid.length === 1 ? 'Sesión en total' : 'Sesiones en total' },
              ]}
            />
            <Card style={{ gap: 0, paddingVertical: space[2] }}>
              <T v="label" accessibilityRole="header" style={{ paddingBottom: space[2] }}>
                Últimas sesiones
              </T>
              {valid.length === 0 ? (
                <T v="small" tint="muted">
                  Aún no hay sesiones. Empieza con 1 minuto: se guarda al terminar.
                </T>
              ) : (
                valid.slice(0, HISTORY_MAX).map((m, i) => (
                  <Fragment key={m.id}>
                    {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />}
                    <View style={st.row}>
                      <View style={[st.mark, { backgroundColor: colors.sage }]} />
                      <View style={{ flex: 1 }}>
                        <T v="label">{m.minutes} min</T>
                        <T v="small" tint="muted">
                          {m.date === today ? 'Hoy' : shortDay(m.date)} · {meditationKindLabel(m.kind)}
                        </T>
                      </View>
                      <IconButton label={`Borrar la sesión de ${m.minutes} min del ${shortDay(m.date)}`} onPress={() => remove(m)} style={{ marginRight: -space[2] }}>
                        <Trash2 size={18} color={colors.inkMuted} />
                      </IconButton>
                    </View>
                  </Fragment>
                ))
              )}
            </Card>
          </>
        )}
      </View>
    </ToolScreen>
  );
}

const st = StyleSheet.create({
  stage: { height: STAGE, alignItems: 'center', justifyContent: 'center' },
  circle: { position: 'absolute', width: STAGE - 8, height: STAGE - 8, borderRadius: radius.pill, borderWidth: 2 },
  cue: { alignItems: 'center', gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: touchTarget + 8 },
  mark: { width: 10, height: 10, borderRadius: 5 },
});
