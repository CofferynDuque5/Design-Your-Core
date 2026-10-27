import { View } from 'react-native';
import Svg, { Ellipse, G, Path, Rect } from 'react-native-svg';
import { useTheme } from '../lib/theme';
import { T } from './ui';

export function Logo({ size = 28, withName = true }: { size?: number; withName?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessible accessibilityRole="image" accessibilityLabel="Design Your Core">
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Rect width={64} height={64} rx={14} fill={colors.primary} />
        {/* Brote en tierra: tallo, dos hojas y su sombra. */}
        <G transform="translate(32 32) scale(0.8) translate(-33 -33.5)">
          <Ellipse cx={32} cy={53} rx={10} ry={3} fill={colors.onPrimary} opacity={0.45} />
          <Path d="M32 50 V30" fill="none" stroke={colors.onPrimary} strokeWidth={4.5} strokeLinecap="round" />
          <Path d="M31 41 C23 41 16 35.5 15 26 C24 26 30.5 31.5 31 41 Z" fill={colors.onPrimary} />
          <Path d="M33 32 C33 21.5 40.5 13 51 11.5 C51 23 43.5 31 33 32 Z" fill={colors.onPrimary} />
        </G>
      </Svg>
      {withName && (
        <T v="heading" importantForAccessibility="no">
          Design Your Core
        </T>
      )}
    </View>
  );
}
