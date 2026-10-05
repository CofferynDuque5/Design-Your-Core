import { FOCUS_MODE_INFO, FOCUS_MODES, focusClock, focusSpoken, focusStats, hoursShort, nextFocusMode, shortDay, utcDayKey, type FocusMode } from '@dyc/core';
import { radius, space } from '@dyc/tokens';
import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react-native';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Stats, ToolScreen } from '../../components/tools';
import { Button, Card, ErrorState, Loading, Segmented, SectionHeader, T, fonts } from '../../components/ui';
import { newId, useLegacyData, useLegacyList, useModule } from '../../lib/legacy';
import { useTheme } from '../../lib/theme';

type Status = 'idle' | 'running' | 'paused';
// Etiquetas cortas para que quepan las tres; los lectores oyen el nombre completo.
const SHORT: Record<FocusMode, string> = { focus: 'Enfoque', short: 'Corto', long: 'Largo' };
const MODE_OPTIONS = FOCUS_MODES.map((m) => ({ value: m, label: `${SHORT[m]} · ${FOCUS_MODE_INFO[m].minutes}`, a11yLabel: `${FOCUS_MODE_INFO[m].label}, ${FOCUS_MODE_INFO[m].minutes} minutos` }));
const totalMs = (m: FocusMode) => FOCUS_MODE_INFO[m].minutes * 60_000;
const RING = 232;
const R = 15.5;
const C = 2 * Math.PI * R;

export default function Focus() {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const records = useLegacyList(legacy.data?.data, 'focus');
  const actions = useModule('focus');
  const [mode, setMode] = useState<FocusMode>('focus');
  const [status, setStatus] = useState<Status>('idle');
  const [remaining, setRemaining] = useState(totalMs('focus'));
  const [completed, setCompleted] = useState(0);
  const endsAt = useRef(0);
  const [, setTick] = useState(0);

  const left = status === 'running' ? Math.max(0, endsAt.current - Date.now()) : remaining;
  const total = totalMs(mode);
  const label = FOCUS_MODE_INFO[mode].label;
  const announce = (m: string) => AccessibilityInfo.announceForAccessibility(m);

  const switchTo = (next: FocusMode) => {
    setMode(next);
    setRemaining(totalMs(next));
    setStatus('idle');
  };

  /** Termina la sesión (por tiempo o al saltar): guarda lo transcurrido si pasó al menos 1 s. */
  const finish = useCallback(
    (skipped: boolean) => {
      const rest = status === 'running' ? Math.max(0, endsAt.current - Date.now()) : remaining;
      const seconds = Math.round((total - rest) / 1000);
      endsAt.current = Number.POSITIVE_INFINITY; // evita terminar dos veces
      if (seconds >= 1) actions.add({ id: newId(), mode, seconds, dateKey: utcDayKey() });
      const done = mode === 'focus' && !skipped ? completed + 1 : completed;
      setCompleted(done);
      // Saltar un enfoque lleva a un descanso corto; completarlo cuenta para el largo.
      const next = mode === 'focus' && skipped ? 'short' : nextFocusMode(mode, done);
      setMode(next);
      setRemaining(totalMs(next));
      setStatus('idle');
      announce(`${skipped ? 'Sesión saltada' : '¡Sesión terminada!'} Ahora toca: ${FOCUS_MODE_INFO[next].label.toLowerCase()}, ${FOCUS_MODE_INFO[next].minutes} minutos.`);
    },
    [actions, completed, mode, remaining, status, total],
  );

  // Mientras corre: refresca la pantalla y termina al llegar a cero (también al volver a la app).
  useEffect(() => {
    if (status !== 'running') return;
    const t = setInterval(() => {
      if (endsAt.current - Date.now() <= 0) finish(false);
      else setTick((n) => n + 1);
    }, 250);
    return () => clearInterval(t);
  }, [status, finish]);

  const start = () => {
    endsAt.current = Date.now() + remaining;
    setStatus('running');
    announce(`${label} en marcha. Quedan ${focusSpoken(remaining)}.`);
  };
  const pause = () => {
    const rest = Math.max(0, endsAt.current - Date.now());
    setRemaining(rest);
    setStatus('paused');
    announce(`En pausa. Quedan ${focusSpoken(rest)}.`);
  };
  const reset = () => {
    setRemaining(total);
    setStatus('idle');
    announce('Temporizador reiniciado.');
  };

  const today = utcDayKey();
  const stats = focusStats(records, today);
  const cycle = mode === 'long' && completed > 0 ? 4 : completed % 4;
  const recent = records.slice(0, 5);
  const progress = (total - left) / total;
  const tint = mode === 'focus' ? colors.primary : colors.sage;

  return (
    <ToolScreen title="Enfoque" refreshing={legacy.isRefetching} onRefresh={() => legacy.refetch()}>
      <Card style={{ alignItems: 'stretch', gap: space[4] }}>
        <Segmented<FocusMode> label="Tipo de sesión" options={MODE_OPTIONS} value={mode} onChange={switchTo} disabled={status === 'running'} />
        <View style={{ alignItems: 'center', justifyContent: 'center', height: RING }}>
          <Svg width={RING} height={RING} viewBox="0 0 36 36" style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
            <Circle cx={18} cy={18} r={R} fill="none" stroke={colors.line} strokeWidth={1.6} />
            {progress > 0 && <Circle cx={18} cy={18} r={R} fill="none" stroke={tint} strokeWidth={1.6} strokeLinecap="round" strokeDasharray={`${progress * C} ${C}`} />}
          </Svg>
          <Text
            accessibilityRole="timer"
            accessibilityLabel={`Tiempo restante: ${focusSpoken(left)}`}
            style={{ fontFamily: fonts.display, fontSize: 60, lineHeight: 68, letterSpacing: -1, color: colors.ink, fontVariant: ['tabular-nums'] }}
            maxFontSizeMultiplier={1.2}
          >
            {focusClock(left)}
          </Text>
          <T v="small" tint="muted">
            {status === 'paused' ? `${label} · en pausa` : status === 'running' ? `${label} · en marcha` : label}
          </T>
        </View>
        {status === 'running' ? (
          <Button label="Pausar" icon={<Pause size={18} color={colors.onPrimary} />} onPress={pause} />
        ) : (
          <Button label={status === 'paused' ? 'Continuar' : 'Empezar'} icon={<Play size={18} color={colors.onPrimary} />} onPress={start} />
        )}
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button variant="secondary" label="Reiniciar" icon={<RotateCcw size={18} color={colors.primary} />} onPress={reset} disabled={status === 'idle'} style={{ flex: 1 }} />
          <Button variant="secondary" label="Saltar" icon={<SkipForward size={18} color={colors.primary} />} onPress={() => finish(true)} style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space[2] }} accessible accessibilityRole="image" accessibilityLabel={`Ciclo: ${cycle} de 4 sesiones de enfoque hasta el descanso largo`}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[s.dot, { backgroundColor: i < cycle ? tint : 'transparent', borderColor: i < cycle ? tint : colors.lineStrong }]} />
          ))}
        </View>
        <T v="small" tint="muted" style={{ textAlign: 'center' }}>
          Cada cuatro sesiones de enfoque toca un descanso largo. Se guarda cada sesión que termines o saltes. Si sales de esta pantalla, el temporizador se detiene.
        </T>
      </Card>

      <View style={{ gap: space[3] }}>
        <SectionHeader title="Tu enfoque" />
        {legacy.isPending ? (
          <Loading label="Cargando tus sesiones" />
        ) : legacy.isError ? (
          <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
        ) : (
          <>
            <Stats
              items={[
                { value: String(stats.sessionsToday), label: 'Sesiones hoy' },
                { value: hoursShort(stats.hoursWeek), label: 'Últimos 7 días' },
                { value: hoursShort(stats.hoursTotal), label: 'En total' },
                { value: String(stats.streak), label: stats.streak === 1 ? 'Día seguido' : 'Días seguidos' },
              ]}
            />
            <Card style={{ gap: 0, paddingVertical: space[2] }}>
              <T v="label" accessibilityRole="header" style={{ paddingBottom: space[2] }}>
                Últimas sesiones
              </T>
              {recent.length === 0 ? (
                <T v="small" tint="muted">
                  Aún no hay sesiones. Empieza una de 25 minutos.
                </T>
              ) : (
                recent.map((r, i) => (
                  <Fragment key={r.id}>
                    {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />}
                    <View style={s.recent}>
                      <T v="body" style={{ flex: 1 }}>
                        {FOCUS_MODE_INFO[r.mode]?.label ?? r.mode}
                      </T>
                      <T v="small" tint="muted" style={{ fontVariant: ['tabular-nums'] }}>
                        {Math.max(1, Math.round(r.seconds / 60))} min · {r.dateKey === today ? 'hoy' : shortDay(r.dateKey)}
                      </T>
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

const s = StyleSheet.create({
  dot: { width: 12, height: 12, borderRadius: radius.pill, borderWidth: 2 },
  recent: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 44 },
});
