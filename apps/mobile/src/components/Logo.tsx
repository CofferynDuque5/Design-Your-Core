import { View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { useTheme } from '../lib/theme';
import { T } from './ui';

export function Logo({ size = 28, withName = true }: { size?: number; withName?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessible accessibilityRole="image" accessibilityLabel="Design Your Core">
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Rect width={64} height={64} rx={14} fill={colors.primary} />
        <Circle cx={32} cy={32} r={17} fill="none" stroke={colors.sandSoft} strokeWidth={4} />
        <Circle cx={32} cy={32} r={6} fill={colors.sand} />
      </Svg>
      {withName && (
        <T v="heading" importantForAccessibility="no">
          Design Your Core
        </T>
      )}
    </View>
  );
}
