import { PILLAR_NAMES, type PillarId } from '@dyc/core';
import { pillarById, radius, space } from '@dyc/tokens';
import { Activity, Compass, Heart, Leaf, Moon, Target } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { useTheme } from '../lib/theme';
import { fonts, type } from './ui';

// Los mismos iconos que la web (ver `icon` en @dyc/tokens).
const ICONS = { movimiento: Activity, descanso: Moon, alimentacion: Leaf, enfoque: Target, relaciones: Heart, proposito: Compass } as const;

export const pillarShort = (id: PillarId) => pillarById(id).short;
export const pillarName = (id: PillarId) => PILLAR_NAMES[id];
export const pillarDescription = (id: PillarId) => pillarById(id).description;

export function PillarIcon({ pillar, size = 20, color }: { pillar: PillarId; size?: number; color?: string }) {
  const { pillar: tone } = useTheme();
  const Icon = ICONS[pillar];
  return <Icon size={size} strokeWidth={1.75} color={color ?? tone(pillar).color} accessibilityElementsHidden importantForAccessibility="no" />;
}

export function PillarTag({ pillar, full = false }: { pillar: PillarId; full?: boolean }) {
  const { pillar: tone } = useTheme();
  const t = tone(pillar);
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: t.soft, borderRadius: radius.pill, paddingHorizontal: space[2], paddingVertical: 2 }}>
      <Text style={[type.small, { fontFamily: fonts.medium, color: t.color, fontSize: 13 }]}>{full ? pillarName(pillar) : pillarShort(pillar)}</Text>
    </View>
  );
}
