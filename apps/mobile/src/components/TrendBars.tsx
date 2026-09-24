import { weekdayShort, type Day, type PillarId } from '@dyc/core';
import { space } from '@dyc/tokens';
import { View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { useTheme } from '../lib/theme';
import { T } from './ui';

/**
 * Barras por día (0–100). Los días sin datos quedan como una marca baja y
 * los futuros no se dibujan. El lector de pantalla recibe un resumen en texto.
 */
export function TrendBars({ points, pillar, today, label }: { points: Array<{ date: Day; value: number | null }>; pillar?: PillarId; today: Day; label: string }) {
  const { colors, pillar: tone } = useTheme();
  const fill = pillar ? tone(pillar).chart : colors.primary;
  const H = 120;
  const n = points.length;
  const gap = n > 10 ? 2 : 8;
  const withData = points.filter((p) => p.value !== null);
  const summary = withData.length
    ? `${label}: ${withData.length} días con datos, entre ${Math.min(...withData.map((p) => p.value!))} y ${Math.max(...withData.map((p) => p.value!))}.`
    : `${label}: sin datos.`;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary} style={{ gap: space[2] }}>
      <Svg width="100%" height={H} viewBox={`0 0 ${n * 20} ${H}`} preserveAspectRatio="none">
        <Line x1={0} x2={n * 20} y1={H - 0.5} y2={H - 0.5} stroke={colors.line} strokeWidth={1} />
        {[50].map((y) => (
          <Line key={y} x1={0} x2={n * 20} y1={H - (y / 100) * H} y2={H - (y / 100) * H} stroke={colors.line} strokeWidth={1} strokeDasharray="3 3" />
        ))}
        {points.map((p, i) => {
          if (p.date > today) return null;
          const h = p.value === null ? 2 : Math.max(3, (p.value / 100) * (H - 4));
          return <Rect key={p.date} x={i * 20 + gap / 2} y={H - h} width={20 - gap} height={h} rx={n > 10 ? 1 : 3} fill={p.value === null ? colors.lineStrong : fill} />;
        })}
      </Svg>
      {n <= 7 && (
        <View style={{ flexDirection: 'row' }} importantForAccessibility="no-hide-descendants">
          {points.map((p) => (
            <T key={p.date} v="small" tint={p.date === today ? 'ink' : 'subtle'} style={{ flex: 1, textAlign: 'center' }}>
              {weekdayShort(p.date)}
            </T>
          ))}
        </View>
      )}
    </View>
  );
}
