import { starterChallenge, TOOL_CATALOG, TOOL_GROUPS, type PillarId } from '@dyc/core';
import { pillars } from '@dyc/tokens';
import { CONTACT_EMAIL } from './config';

/** Los seis pilares, con un ejemplo real de reto de nivel 1 del catálogo de la app. */
export const PILLARS = pillars.map((p) => ({
  id: p.id as PillarId,
  name: p.name,
  description: p.description,
  example: starterChallenge(p.id as PillarId),
}));

/** Todas las herramientas de la app, por grupo, tal como aparecen en «Más». */
export const TOOLS = TOOL_GROUPS.map((g) => ({
  id: g.id,
  label: g.label,
  tools: TOOL_CATALOG.filter((t) => t.group === g.id && !t.optIn).map((t) => ({ id: t.id, label: t.label, description: t.description })),
})).filter((g) => g.tools.length > 0);
export const TOOL_COUNT = TOOLS.reduce((n, g) => n + g.tools.length, 0);

export interface Feature {
  id: string;
  kicker: string;
  title: string;
  body: string;
  points: string[];
  shot: string;
  alt: string;
}

/** Lo que más se usa, con su captura real (public/capturas). */
export const FEATURES: Feature[] = [
  {
    id: 'hoy',
    kicker: 'Hoy',
    title: 'Tu día, en una sola pantalla',
    body: 'Un check-in de un minuto, los hábitos de hoy y sugerencias que explican por qué te las damos.',
    points: ['Check-in de ánimo, energía, sueño y estrés', 'Hábitos con un toque', 'Sugerencias con su motivo'],
    shot: 'hoy',
    alt: 'Pantalla Hoy: check-in del día, resumen de la semana y hábitos de hoy',
  },
  {
    id: 'progreso',
    kicker: 'Progreso',
    title: 'Ves cómo avanzas, pilar por pilar',
    body: 'Tu día, tu semana y tu mes comparados con el periodo anterior. Sin rachas que te persigan: un día sin datos no te resta.',
    points: ['Puntuación de cada pilar', 'Comparación con la semana anterior', 'Evolución por mes'],
    shot: 'progreso',
    alt: 'Pantalla Progreso: puntuación general y barras por pilar',
  },
  {
    id: 'cursos',
    kicker: 'Cursos y estudio',
    title: 'Tus cursos, en orden y con horario',
    body: 'Pega el enlace de un curso de YouTube, Udemy o Coursera. La app calcula cuánto dura, lo ordena de lo básico a lo avanzado y arma tu horario de estudio.',
    points: ['Orden automático por tema', 'Videos de YouTube dentro de la app, con tu avance', '«Crear horario»: un curso de cada tema en tus horas libres'],
    shot: 'cursos',
    alt: 'Pantalla Cursos: temas con sus cursos ordenados y el siguiente marcado',
  },
  {
    id: 'horario',
    kicker: 'Organización',
    title: 'Horario, agenda y calendario que se hablan',
    body: 'Tus clases en una cuadrícula semanal, los bloques de tu día y los eventos del mes. Con avisos en el teléfono aunque la app esté cerrada.',
    points: ['Cuadrícula de la semana', 'Pendientes con subtareas', 'Temporizador de enfoque que sigue contando'],
    shot: 'horario',
    alt: 'Pantalla Horario: cuadrícula semanal con las clases de cada día',
  },
  {
    id: 'notas',
    kicker: 'Notas y cuadernos',
    title: 'Apuntes con formato, imágenes y fórmulas',
    body: 'Notas por materia con negritas, listas, casillas, código e imágenes. Las fórmulas entre $ se dibujan como fórmulas.',
    points: ['Biblioteca por materia y etiqueta', 'Fórmulas como x² o √x', 'Cuadernos con portada por materia'],
    shot: 'notas',
    alt: 'Pantalla Notas: biblioteca con notas agrupadas por materia',
  },
  {
    id: 'asistente',
    kicker: 'Asistente',
    title: 'Un asistente que conoce tu panel',
    body: 'Pregúntale por tu semana, adjunta una foto o un PDF y pídele que organice algo. Cada sección tiene «Sugerencias» con un botón «Hacer»: nada cambia sin tu permiso.',
    points: ['Fotos, PDF y archivos de texto', 'Historial de conversaciones', 'Sugerencias que aplicas con un toque'],
    shot: 'asistente',
    alt: 'Pantalla Asistente: conversación con sugerencias e historial',
  },
];

/** Plataformas en las que funciona. */
export const PLATFORMS = ['Navegador', 'Android', 'iPhone y iPad', 'Windows', 'Mac', 'Linux'] as const;

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
  {
    title: 'Bóveda cifrada',
    body: 'Tus contraseñas se cifran en tu dispositivo con tu contraseña maestra antes de guardarse. Ni nosotros podemos leerlas.',
  },
] as const;

export const FAQ = [
  {
    q: '¿Mis datos están en el teléfono y en la computadora a la vez?',
    a: 'Sí. Todo se guarda en tu cuenta: lo que anotas en el teléfono aparece en la computadora y al revés.',
  },
  {
    q: '¿Cómo instalo la app en el teléfono?',
    a: 'En Android, abre la app en Chrome y toca «Instalar». En iPhone, ábrela en Safari, toca Compartir y luego «Añadir a pantalla de inicio». Queda con su icono, como cualquier app.',
  },
  {
    q: '¿Y en la computadora?',
    a: 'Descarga la app para Windows, Mac o Linux desde la página Descargar. También puedes usarla en el navegador sin instalar nada.',
  },
  {
    q: '¿Qué necesito para usar el Asistente?',
    a: 'Una clave de Google Gemini, que se consigue gratis en Google AI Studio. Se guarda solo en tu navegador.',
  },
  {
    q: '¿Puedo descargar o borrar mis datos?',
    a: 'Sí, desde Perfil: descargas todo en un archivo o borras tu cuenta con todo lo que guardaste.',
  },
  {
    q: '¿Estará en App Store y Google Play?',
    a: 'Sí, está en camino. Mientras tanto, la app instalada desde el navegador tiene las mismas funciones.',
  },
  {
    q: '¿Cómo los contacto?',
    a: `Escríbenos a ${CONTACT_EMAIL}. Te respondemos por ese mismo correo.`,
  },
] as const;
