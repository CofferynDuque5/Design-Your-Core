import { adjacentLevel, challengeByKey, CHALLENGES, starterChallenge, type Challenge } from './challenges.js';
import { addDays, diffDays, type Day } from './dates.js';
import { PILLAR_IDS, PILLAR_NAMES, type PillarId } from './pillars.js';
import type { CheckInSignals, PillarScores } from './scoring.js';

export type RecommendationAction =
  | { type: 'start-challenge'; challengeKey: string }
  | { type: 'switch-challenge'; userChallengeId: string; challengeKey: string }
  | { type: 'check-in' };

export interface Recommendation {
  /** Identificador estable: sirve para descartarla. */
  key: string;
  kind: 'challenge' | 'insight' | 'nudge';
  pillar: PillarId | null;
  title: string;
  body: string;
  /** Por qué se recomienda, con los datos de la persona. */
  reason: string;
  action?: RecommendationAction;
  priority: number;
}

export interface ActiveChallenge {
  id: string;
  key: string;
  startedOn: Day;
  durationDays: number;
  doneDays: number;
}

export interface RecommendationInput {
  today: Day;
  focusPillars: PillarId[];
  /** Check-ins de los últimos 14 días (o más), con su fecha. */
  checkIns: Array<CheckInSignals & { date: Day }>;
  /** Puntuación media de los últimos 7 días. */
  weekScores: PillarScores;
  activeChallenges: ActiveChallenge[];
  /** Claves descartadas recientemente. */
  dismissed: ReadonlySet<string>;
}

const fmt1 = (n: number) => n.toLocaleString('es', { maximumFractionDigits: 1 });
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function startChallenge(c: Challenge, key: string, reason: string, priority: number): Recommendation {
  return {
    key,
    kind: 'challenge',
    pillar: c.pillar,
    title: c.title,
    body: c.description,
    reason,
    action: { type: 'start-challenge', challengeKey: c.key },
    priority,
  };
}

/**
 * Recomendaciones contextualizadas por reglas explicables. Cada una dice en
 * `reason` qué dato la motivó. Devuelve como máximo `limit`, por prioridad.
 */
export function recommend(input: RecommendationInput, limit = 3): Recommendation[] {
  const { today, checkIns, weekScores, activeChallenges, dismissed } = input;
  const out: Recommendation[] = [];
  const activeKeys = new Set(activeChallenges.map((a) => a.key));
  const activePillars = new Set(activeChallenges.map((a) => challengeByKey(a.key)?.pillar));
  const firstFree = (pillar: PillarId) =>
    CHALLENGES.find((c) => c.pillar === pillar && c.level === 1 && !activeKeys.has(c.key)) ?? null;

  const last7 = checkIns.filter((c) => c.date > addDays(today, -7) && c.date <= today);
  const sorted = [...checkIns].sort((a, b) => (a.date < b.date ? 1 : -1));

  // 1. Sin check-ins recientes: invitar a registrar, sin culpa.
  const lastDate = sorted[0]?.date;
  if (!lastDate || diffDays(lastDate, today) >= 3) {
    out.push({
      key: 'checkin-missing',
      kind: 'nudge',
      pillar: null,
      title: '¿Cómo estás hoy?',
      body: 'Un check-in de menos de un minuto basta para ver cómo se mueven tus pilares.',
      reason: lastDate ? `Tu último registro fue hace ${diffDays(lastDate, today)} días.` : 'Aún no tienes registros.',
      action: { type: 'check-in' },
      priority: 90,
    });
  }

  // 2. Ajustar retos activos según cómo van.
  for (const a of activeChallenges) {
    const elapsed = Math.min(diffDays(a.startedOn, today) + 1, a.durationDays);
    if (elapsed < 4) continue;
    const rate = a.doneDays / elapsed;
    const c = challengeByKey(a.key);
    if (!c) continue;
    const pct = Math.round(rate * 100);
    if (rate >= 0.8 && elapsed >= 5) {
      const next = adjacentLevel(a.key, 1);
      if (next) {
        out.push({
          key: `adapt-up:${a.id}`,
          kind: 'challenge',
          pillar: c.pillar,
          title: `Listo para más: ${next.title.toLowerCase()}`,
          body: next.description,
          reason: `Cumpliste "${c.title}" el ${pct}% de los días.`,
          action: { type: 'switch-challenge', userChallengeId: a.id, challengeKey: next.key },
          priority: 80,
        });
      }
    } else if (rate < 0.4) {
      const easier = adjacentLevel(a.key, -1);
      out.push({
        key: `adapt-down:${a.id}`,
        kind: 'challenge',
        pillar: c.pillar,
        title: easier ? `Un paso más pequeño: ${easier.title.toLowerCase()}` : 'Ajusta el reto a tu semana',
        body: easier
          ? easier.description
          : 'Si esta semana no es buen momento, puedes pausarlo y retomarlo después. Lo importante es que el reto te sume.',
        reason: `Llevas ${a.doneDays} de ${elapsed} días en "${c.title}".`,
        action: easier ? { type: 'switch-challenge', userChallengeId: a.id, challengeKey: easier.key } : undefined,
        priority: 85,
      });
    }
  }

  // 3. Sueño corto varias noches.
  const shortNights = last7.filter((c) => typeof c.sleepHours === 'number' && c.sleepHours < 7);
  if (shortNights.length >= 3) {
    const c = activeKeys.has('dormir-1') ? challengeByKey('dormir-2') : challengeByKey('dormir-1');
    if (c && !activeKeys.has(c.key)) {
      const hours = avg(shortNights.map((n) => n.sleepHours as number));
      out.push(startChallenge(c, 'sleep-short', `${shortNights.length} de tus últimas 7 noches dormiste menos de 7 horas (media ${fmt1(hours)} h).`, 75));
    }
  }

  // 4. Estrés alto sostenido.
  const stress = last7.filter((c) => typeof c.stress === 'number').slice(-5);
  if (stress.length >= 3 && avg(stress.map((c) => c.stress as number)) >= 4) {
    const c = activeKeys.has('atencion-1') ? challengeByKey('descarga-mental') : challengeByKey('atencion-1');
    if (c && !activeKeys.has(c.key)) {
      out.push(startChallenge(c, 'stress-high', `Tu estrés medio en los últimos registros es ${fmt1(avg(stress.map((s) => s.stress as number)))} de 5.`, 72));
    }
  }

  // 5. Relación sueño-energía en tus propios datos.
  const withBoth = checkIns.filter((c) => typeof c.sleepHours === 'number' && typeof c.energy === 'number');
  const good = withBoth.filter((c) => (c.sleepHours as number) >= 7).map((c) => c.energy as number);
  const bad = withBoth.filter((c) => (c.sleepHours as number) < 7).map((c) => c.energy as number);
  if (good.length >= 2 && bad.length >= 2 && avg(good) - avg(bad) >= 0.5) {
    out.push({
      key: 'sleep-energy',
      kind: 'insight',
      pillar: 'descanso',
      title: 'Dormir 7 horas se nota en tu energía',
      body: `Los días después de dormir 7 horas o más tu energía media es ${fmt1(avg(good))}; cuando duermes menos, ${fmt1(avg(bad))}.`,
      reason: `Basado en ${withBoth.length} check-ins con sueño y energía registrados.`,
      priority: 60,
    });
  }

  // 6. El pilar más bajo de la semana, si hay suficientes datos.
  const scored = PILLAR_IDS.filter((id) => weekScores[id] !== null);
  if (scored.length >= 3) {
    const lowest = scored.reduce((a, b) => ((weekScores[b] as number) < (weekScores[a] as number) ? b : a));
    const c = !activePillars.has(lowest) ? firstFree(lowest) : null;
    if (c && (weekScores[lowest] as number) < 70) {
      out.push(startChallenge(c, `lowest:${lowest}`, `${PILLAR_NAMES[lowest]} fue tu pilar más bajo esta semana (${weekScores[lowest]}/100).`, 70));
    }
  }

  // 7. Pilares que la persona eligió cuidar y aún no tienen reto.
  for (const p of input.focusPillars) {
    if (activePillars.has(p)) continue;
    const c = firstFree(p) ?? starterChallenge(p);
    if (activeKeys.has(c.key)) continue;
    out.push(startChallenge(c, `focus:${p}`, `Elegiste cuidar ${PILLAR_NAMES[p].toLowerCase()} y aún no tienes un reto activo ahí.`, 50));
  }

  // Sin duplicar retos ni mostrar lo descartado.
  const seen = new Set<string>();
  return out
    .filter((r) => !dismissed.has(r.key))
    .sort((a, b) => b.priority - a.priority)
    .filter((r) => {
      const k = r.action && 'challengeKey' in r.action ? r.action.challengeKey : r.key;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
}
