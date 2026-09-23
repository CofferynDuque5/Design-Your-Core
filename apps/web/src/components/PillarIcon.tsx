import type { PillarId } from '@dyc/core';
import { Activity, Compass, Heart, Leaf, Moon, Target, type LucideProps } from 'lucide-react';

const ICONS = { movimiento: Activity, descanso: Moon, alimentacion: Leaf, enfoque: Target, relaciones: Heart, proposito: Compass } as const;

export function PillarIcon({ pillar, size = 20, ...rest }: { pillar: PillarId } & LucideProps) {
  const Icon = ICONS[pillar];
  return <Icon size={size} strokeWidth={1.75} aria-hidden="true" {...rest} />;
}
