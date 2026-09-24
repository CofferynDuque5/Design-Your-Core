import type { PillarId } from '@dyc/core';
import { radius } from '@dyc/tokens';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../lib/theme';
import { type } from './ui';

const R = 15.5;
const C = 2 * Math.PI * R;

/** Anillo de puntuación 0–100. Sin datos se muestra la pista vacía y un guion. */
export function ScoreRing({ value, pillar, size = 56, label }: { value: number | null; pillar?: PillarId; size?: number; label: string }) {
  const { colors, pillar: tone } = useTheme();
  const stroke = pillar ? tone(pillar).chart : colors.primary;
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={value === null ? `${label}: sin datos` : `${label}: ${value} de 100`}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} viewBox="0 0 36 36" style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={18} cy={18} r={R} fill="none" stroke={colors.surfaceSunken} strokeWidth={3} />
        {value !== null && <Circle cx={18} cy={18} r={R} fill="none" stroke={stroke} strokeWidth={3} strokeLinecap="round" strokeDasharray={`${(v / 100) * C} ${C}`} />}
      </Svg>
      <Text style={[type.number, { color: colors.ink, fontSize: Math.max(12, Math.round(size * 0.3)) }]} maxFontSizeMultiplier={1.2}>
        {value ?? '–'}
      </Text>
    </View>
  );
}

export function Delta({ value }: { value: number | null }) {
  const { colors } = useTheme();
  if (value === null) return null;
  if (value === 0) return <Text style={[type.small, { color: colors.inkMuted }]}>Igual</Text>;
  const up = value > 0;
  return (
    <Text style={[type.small, type.number, { color: up ? colors.success : colors.danger }]} accessibilityLabel={`${up ? 'Sube' : 'Baja'} ${Math.abs(value)}`}>
      {up ? '↑' : '↓'} {Math.abs(value)}
    </Text>
  );
}

export function ProgressBar({ value, pillar, label }: { value: number; pillar?: PillarId; label: string }) {
  const { colors, pillar: tone } = useTheme();
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: v }}
      style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceSunken, overflow: 'hidden' }}
    >
      <View style={{ width: `${v}%`, height: '100%', borderRadius: radius.pill, backgroundColor: pillar ? tone(pillar).chart : colors.primary }} />
    </View>
  );
}
