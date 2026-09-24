import { PILLAR_IDS, type PillarId } from './pillars.js';

export interface Challenge {
  key: string;
  pillar: PillarId;
  /** 1 = el paso más pequeño, 3 = el más exigente. */
  level: 1 | 2 | 3;
  /** Retos de la misma secuencia: permiten subir o bajar de nivel. */
  track: string;
  title: string;
  description: string;
  durationDays: number;
}

/**
 * Catálogo de retos: pequeños, concretos y adaptables. Cada pilar tiene una
 * secuencia de tres niveles y un reto suelto.
 */
export const CHALLENGES: readonly Challenge[] = [
  { key: 'caminar-1', pillar: 'movimiento', track: 'caminar', level: 1, durationDays: 7, title: 'Camina 10 minutos después de una comida', description: 'Una caminata corta después de comer ayuda a la digestión y a sostener la energía de la tarde.' },
  { key: 'caminar-2', pillar: 'movimiento', track: 'caminar', level: 2, durationDays: 7, title: 'Camina 20 minutos al día', description: 'Puede ser seguido o en dos tramos. Lo importante es sumar los 20 minutos.' },
  { key: 'caminar-3', pillar: 'movimiento', track: 'caminar', level: 3, durationDays: 14, title: '30 minutos de movimiento que acelere el pulso', description: 'Caminata rápida, bicicleta, baile o lo que disfrutes, con intensidad moderada.' },
  { key: 'pausa-activa', pillar: 'movimiento', track: 'pausa-activa', level: 1, durationDays: 5, title: 'Dos minutos de estiramiento cada dos horas', description: 'Levántate, estira cuello, espalda y piernas. Ideal en días de escritorio.' },

  { key: 'dormir-1', pillar: 'descanso', track: 'dormir', level: 1, durationDays: 7, title: 'Pantallas fuera 30 minutos antes de dormir', description: 'La luz y los estímulos de la pantalla retrasan el sueño. Cambia el teléfono por un libro o música tranquila.' },
  { key: 'dormir-2', pillar: 'descanso', track: 'dormir', level: 2, durationDays: 7, title: 'Acuéstate a la misma hora cinco noches', description: 'Con un margen de 30 minutos. La regularidad importa tanto como las horas.' },
  { key: 'dormir-3', pillar: 'descanso', track: 'dormir', level: 3, durationDays: 14, title: 'Rutina de cierre de 20 minutos', description: 'Luz baja, sin pantallas, algo de lectura o respiración. Siempre en el mismo orden.' },
  { key: 'sin-cafeina-tarde', pillar: 'descanso', track: 'sin-cafeina-tarde', level: 1, durationDays: 7, title: 'Sin cafeína después de las 14:00', description: 'La cafeína tarda horas en eliminarse. Prueba con infusiones por la tarde.' },

  { key: 'comer-1', pillar: 'alimentacion', track: 'comer', level: 1, durationDays: 7, title: 'Un vaso de agua al despertar', description: 'Déjalo preparado la noche anterior junto a la cama.' },
  { key: 'comer-2', pillar: 'alimentacion', track: 'comer', level: 2, durationDays: 7, title: 'Verdura en la comida y en la cena', description: 'Una porción basta: cruda, cocida o en sopa.' },
  { key: 'comer-3', pillar: 'alimentacion', track: 'comer', level: 3, durationDays: 14, title: 'Cocina en casa cinco días de la semana', description: 'Planea el menú el fin de semana para que entre semana sea fácil.' },
  { key: 'comer-sin-pantallas', pillar: 'alimentacion', track: 'comer-sin-pantallas', level: 1, durationDays: 7, title: 'Una comida al día sin pantallas', description: 'Come con atención: notarás mejor cuándo estás satisfecho.' },

  { key: 'atencion-1', pillar: 'enfoque', track: 'atencion', level: 1, durationDays: 7, title: 'Tres minutos de respiración consciente', description: 'Inhala en cuatro tiempos, exhala en seis. Un buen momento es antes de empezar a trabajar.' },
  { key: 'atencion-2', pillar: 'enfoque', track: 'atencion', level: 2, durationDays: 7, title: 'Un bloque de 25 minutos sin notificaciones', description: 'Una sola tarea, el teléfono en otra habitación y un temporizador.' },
  { key: 'atencion-3', pillar: 'enfoque', track: 'atencion', level: 3, durationDays: 14, title: 'Dos bloques de enfoque profundo de 50 minutos', description: 'Resérvalos en tu agenda como una reunión contigo.' },
  { key: 'descarga-mental', pillar: 'enfoque', track: 'descarga-mental', level: 1, durationDays: 7, title: 'Escribe lo que te preocupa antes de dormir', description: 'Anota cada preocupación y, si la hay, una próxima acción. La cabeza descansa mejor cuando no tiene que recordar.' },

  { key: 'conexion-1', pillar: 'relaciones', track: 'conexion', level: 1, durationDays: 7, title: 'Escríbele a alguien que extrañas', description: 'Un mensaje breve y sincero. No hace falta esperar respuesta.' },
  { key: 'conexion-2', pillar: 'relaciones', track: 'conexion', level: 2, durationDays: 7, title: 'Una conversación de 15 minutos sin teléfono', description: 'Con tu pareja, familia o amistades. Presencia completa.' },
  { key: 'conexion-3', pillar: 'relaciones', track: 'conexion', level: 3, durationDays: 14, title: 'Un encuentro a la semana con alguien importante', description: 'Propón el plan tú. Un café o una caminata cuentan.' },
  { key: 'agradecer', pillar: 'relaciones', track: 'agradecer', level: 1, durationDays: 7, title: 'Agradece algo concreto a una persona cada día', description: 'Di qué hizo y cómo te ayudó. Lo concreto se recuerda.' },

  { key: 'sentido-1', pillar: 'proposito', track: 'sentido', level: 1, durationDays: 7, title: 'Una línea de reflexión al final del día', description: '¿Qué te dio energía hoy? ¿Qué te la quitó? Una línea es suficiente.' },
  { key: 'sentido-2', pillar: 'proposito', track: 'sentido', level: 2, durationDays: 7, title: '20 minutos para algo que te importa', description: 'Aprender, crear, ayudar: algo que no sea urgente pero sí importante para ti.' },
  { key: 'sentido-3', pillar: 'proposito', track: 'sentido', level: 3, durationDays: 21, title: 'Avanza en una meta personal y revísala cada domingo', description: 'Define un paso por semana y dedica diez minutos del domingo a revisar cómo fue.' },
  { key: 'tres-gratitudes', pillar: 'proposito', track: 'tres-gratitudes', level: 1, durationDays: 7, title: 'Tres gratitudes al día', description: 'Tres cosas, pequeñas o grandes, por las que agradeces hoy.' },
];

const byKey = new Map(CHALLENGES.map((c) => [c.key, c]));

export const challengeByKey = (key: string): Challenge | undefined => byKey.get(key);

/** El reto del mismo recorrido con un nivel más (+1) o menos (-1), si existe. */
export function adjacentLevel(key: string, step: 1 | -1): Challenge | undefined {
  const c = byKey.get(key);
  if (!c) return undefined;
  return CHALLENGES.find((x) => x.track === c.track && x.level === c.level + step);
}

export const starterChallenge = (pillar: PillarId): Challenge =>
  CHALLENGES.find((c) => c.pillar === pillar && c.level === 1) as Challenge;

/** Pilar para el primer reto: el de enfoque con el punto de partida más bajo. */
export function suggestedPillar(focus: PillarId[], baseline: Partial<Record<PillarId, number>>): PillarId {
  const pool = focus.length ? focus : [...PILLAR_IDS];
  return [...pool].sort((a, b) => (baseline[a] ?? 3) - (baseline[b] ?? 3))[0];
}
