import { PILLAR_NAMES, type PillarId } from '@dyc/core';
import { pillarById } from '@dyc/tokens';

export const pillarShort = (id: PillarId) => pillarById(id).short;
export const pillarName = (id: PillarId) => PILLAR_NAMES[id];
export const pillarDescription = (id: PillarId) => pillarById(id).description;

export function PillarTag({ pillar, full = false }: { pillar: PillarId; full?: boolean }) {
  return (
    <span className="pillar-tag" data-pillar={pillar}>
      {full ? pillarName(pillar) : pillarShort(pillar)}
    </span>
  );
}
