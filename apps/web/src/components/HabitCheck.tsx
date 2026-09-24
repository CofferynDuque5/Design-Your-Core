import type { PillarId } from '@dyc/core';
import { Check } from 'lucide-react';
import { pillarShort } from './Pillar';

/** Fila de hábito con casilla grande (objetivo táctil de 44px). */
export function HabitCheck({ title, pillar, done, onToggle, disabled }: { title: string; pillar: PillarId; done: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <label className={`habit-check${done ? ' habit-check--done' : ''}`} data-pillar={pillar}>
      <input type="checkbox" checked={done} onChange={onToggle} disabled={disabled} />
      <span className="habit-check__box" aria-hidden="true">
        {done && <Check size={16} strokeWidth={2.5} />}
      </span>
      <span className="habit-check__title">{title}</span>
      <span className="habit-check__pillar">{pillarShort(pillar)}</span>
    </label>
  );
}
