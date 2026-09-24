import { starterChallenge, type PillarId } from '@dyc/core';
import { pillars } from '@dyc/tokens';

/** Los seis pilares, con un ejemplo real de reto de nivel 1 del catálogo de la app. */
export const PILLARS = pillars.map((p) => ({
  id: p.id as PillarId,
  name: p.name,
  description: p.description,
  example: starterChallenge(p.id as PillarId),
}));

export const STEPS = [
  {
    title: 'Cuéntanos dónde estás',
    body: 'Eliges hasta tres pilares en los que enfocarte y marcas tu punto de partida. Sin tests largos: un par de minutos.',
  },
  {
    title: 'Un minuto al día',
    body: 'Un check-in rápido de ánimo, energía, sueño o lo que quieras registrar. Lo que dejas en blanco no te resta.',
  },
  {
    title: 'Pasos pequeños, a tu medida',
    body: 'Retos de 5 a 14 días pensados para cumplirse. Si te quedan cortos o largos, subes o bajas de nivel.',
  },
  {
    title: 'Mira cómo avanzas',
    body: 'Tu día, tu semana y tu mes en cada pilar, comparados con el periodo anterior, y sugerencias que dicen por qué te las damos.',
  },
] as const;

export const PRINCIPLES = [
  {
    title: 'Sin culpa',
    body: 'Registras lo que te sirve. Un día sin datos no baja tu puntuación y las rachas nunca son el objetivo.',
  },
  {
    title: 'Recomendaciones con motivo',
    body: 'Cada sugerencia explica en qué se basa: «dormiste 6 horas de media esta semana», no una caja negra.',
  },
  {
    title: 'Tus datos son tuyos',
    body: 'Puedes descargarlos todos en un archivo o borrar tu cuenta cuando quieras, desde la propia app.',
  },
] as const;
