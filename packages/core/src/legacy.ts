import { z } from 'zod';
import { addDays, diffDays, isDay, periodRange, type Day } from './dates.js';

/**
 * Módulos de la app anterior ("Core"). Sus datos viven en el documento JSON de
 * /api/sync (un objeto por persona). Estos esquemas reproducen exactamente los
 * formatos que escribe la app anterior para que ambas apps puedan convivir.
 * Ver docs/modulos.md.
 */

/** Claves del documento que la API v2 permite editar por elemento (tandas 1 a 4). */
export const LEGACY_KEYS = [
  'blocks',
  'tasks',
  'todos',
  'subtasks',
  'reminders',
  'classes',
  'focus',
  'subjects',
  'projects',
  'roadmaps',
  'notebooks',
  'noteBoxes',
  'content',
  'ideas',
  'transactions',
  'goals',
  'pets',
  'petCares',
  'period',
  'workouts',
  'sleep',
  'journal',
  'routines',
  'meals',
  'notes',
  'workItems',
  'meditations',
] as const;
export type LegacyKey = (typeof LEGACY_KEYS)[number];
export const isLegacyKey = (k: unknown): k is LegacyKey => typeof k === 'string' && (LEGACY_KEYS as readonly string[]).includes(k);

/**
 * Claves que son un objeto (no una lista). `cycle` y `dayLog` son de la app
 * anterior; `budget` es nueva (la app anterior guardaba el presupuesto en el
 * localStorage del navegador) y la app anterior la conserva sin leerla.
 */
export const LEGACY_OBJECT_KEYS = ['cycle', 'dayLog', 'budget'] as const;
export type LegacyObjectKey = (typeof LEGACY_OBJECT_KEYS)[number];
export const isLegacyObjectKey = (k: unknown): k is LegacyObjectKey => typeof k === 'string' && (LEGACY_OBJECT_KEYS as readonly string[]).includes(k);

// ---------- Catálogos (mismos valores y colores que la app anterior) ----------

export const BLOCK_KINDS = ['ex', 'study', 'class', 'project', 'break', 'read'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
export const BLOCK_KIND_INFO: Record<BlockKind, { label: string; color: string }> = {
  ex: { label: 'Ejercicio', color: '#0FA968' },
  study: { label: 'Estudio', color: '#8B5CF6' },
  class: { label: 'Clase', color: '#4F7CFF' },
  project: { label: 'Proyecto', color: '#EC6A9C' },
  break: { label: 'Descanso', color: '#98A0AA' },
  read: { label: 'Lectura', color: '#E8A13A' },
};

export const TASK_PRIORITIES = ['alta', 'media', 'baja'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const TASK_PRIORITY_INFO: Record<TaskPriority, { label: string; color: string }> = {
  alta: { label: 'Alta', color: '#E5484D' },
  media: { label: 'Media', color: '#E8912A' },
  baja: { label: 'Baja', color: '#8A8F98' },
};

/** Colores que la API anterior acepta para un evento (el primero es el de por defecto). */
export const REMINDER_COLORS = ['#0FA968', '#4F7CFF', '#EC6A9C', '#8B5CF6', '#E8912A', '#E5484D'] as const;
/** Paleta de clases del Horario (el primero es el de por defecto). */
export const CLASS_COLORS = ['#4F7CFF', '#0FA968', '#8B5CF6', '#EC6A9C', '#E8912A', '#22B8CF', '#E5484D'] as const;
/** Paletas de la tanda 2 (el primer color es el de por defecto, salvo en proyectos, que empiezan por el de la materia). */
export const SUBJECT_COLORS = ['#4F7CFF', '#0FA968', '#E8912A', '#8B5CF6', '#EC6A9C', '#22B8CF'] as const;
export const PROJECT_COLORS = ['#0FA968', '#4F7CFF', '#E8912A', '#EC6A9C', '#8B5CF6', '#EF4444', '#14B8A6'] as const;
export const ROADMAP_COLORS = ['#8B5CF6', '#4F7CFF', '#0FA968', '#E8912A', '#EC6A9C'] as const;
export const NOTEBOOK_COLORS = ['#4F7CFF', '#0FA968', '#EC6A9C', '#8B5CF6', '#E8912A', '#E5484D', '#14B8A6', '#111827'] as const;
/** Fondos de las cajitas de texto; las de código usan siempre CODE_BOX_COLOR. */
export const BOX_COLORS = ['#FFF7D6', '#DDF3E4', '#E3ECFF', '#FCE0EC', '#EDE4FF', '#FFE8D6', '#F1F3F5'] as const;
export const CODE_BOX_COLOR = '#1e1e2e';
export const NOTEBOOK_EMOJIS = ['📓', '📕', '📗', '📘', '📙', '🧠', '🔬', '🧮', '📐', '🌍', '💻', '🎨', '🎵', '⚗️', '📖', '✏️'] as const;
/** Lenguajes de las cajitas de código (el primero es el de por defecto). */
export const CODE_LANGS = ['js', 'ts', 'python', 'html', 'css', 'java', 'c++', 'c#', 'php', 'sql', 'bash', 'json', 'otro'] as const;

export const COLOR_NAMES: Record<string, string> = {
  '#0FA968': 'Verde',
  '#4F7CFF': 'Azul',
  '#EC6A9C': 'Rosa',
  '#8B5CF6': 'Violeta',
  '#E8912A': 'Naranja',
  '#E5484D': 'Rojo',
  '#22B8CF': 'Turquesa',
  '#EF4444': 'Rojo',
  '#14B8A6': 'Verde azulado',
  '#111827': 'Negro',
  '#FFF7D6': 'Amarillo',
  '#DDF3E4': 'Verde',
  '#E3ECFF': 'Azul',
  '#FCE0EC': 'Rosa',
  '#EDE4FF': 'Lila',
  '#FFE8D6': 'Melocotón',
  '#F1F3F5': 'Gris',
};

export const PROJECT_STATUSES = ['curso', 'revision', 'entregado'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_INFO: Record<ProjectStatus, { label: string }> = {
  curso: { label: 'En curso' },
  revision: { label: 'En revisión' },
  entregado: { label: 'Entregado' },
};

export const CONTENT_STAGES = ['idea', 'guion', 'grabar', 'editar', 'publicado'] as const;
export type ContentStage = (typeof CONTENT_STAGES)[number];
export const CONTENT_STAGE_INFO: Record<ContentStage, { label: string }> = {
  idea: { label: 'Idea' },
  guion: { label: 'Guion' },
  grabar: { label: 'Grabar' },
  editar: { label: 'Editar' },
  publicado: { label: 'Publicado' },
};

export const CONTENT_PLATFORMS = ['youtube', 'tiktok', 'instagram', 'otro'] as const;
export type ContentPlatform = (typeof CONTENT_PLATFORMS)[number];
export const CONTENT_PLATFORM_INFO: Record<ContentPlatform, { label: string; color: string }> = {
  youtube: { label: 'YouTube', color: '#FF0033' },
  tiktok: { label: 'TikTok', color: '#111827' },
  instagram: { label: 'Instagram', color: '#E1306C' },
  otro: { label: 'Otro', color: '#8B8E88' },
};

export const IDEA_CATEGORIES = ['app', 'web', 'marketing', 'otro'] as const;
export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];
export const IDEA_CATEGORY_INFO: Record<IdeaCategory, { label: string; color: string }> = {
  app: { label: 'App', color: '#0FA968' },
  web: { label: 'Web', color: '#4F7CFF' },
  marketing: { label: 'Marketing', color: '#EC6A9C' },
  otro: { label: 'Otro', color: '#8A8F98' },
};

/** Días de la semana de las clases: 1 = lunes … 7 = domingo. */
export const CLASS_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

export const FOCUS_MODES = ['focus', 'short', 'long'] as const;
export type FocusMode = (typeof FOCUS_MODES)[number];
export const FOCUS_MODE_INFO: Record<FocusMode, { label: string; minutes: number }> = {
  focus: { label: 'Enfoque', minutes: 25 },
  short: { label: 'Descanso corto', minutes: 5 },
  long: { label: 'Descanso largo', minutes: 15 },
};
/** La app anterior guarda como máximo 500 sesiones, la más reciente primero. */
export const FOCUS_MAX = 500;

// ---------- Catálogos de la tanda 3 ----------

export const TX_TYPES = ['expense', 'income'] as const;
export type TxType = (typeof TX_TYPES)[number];
export const TX_TYPE_INFO: Record<TxType, { label: string }> = {
  expense: { label: 'Gasto' },
  income: { label: 'Ingreso' },
};
/** Categorías de la app anterior. Se guarda el texto; el Asistente anterior podía escribir otras. */
export const TX_CATEGORIES: Record<TxType, readonly string[]> = {
  expense: ['Comida', 'Transporte', 'Ocio', 'Hogar', 'Salud', 'Estudio', 'Otro'],
  income: ['Sueldo', 'Freelance', 'Contenido', 'Regalo', 'Otro'],
};

export const GOAL_CATEGORIES = ['salud', 'dinero', 'estudio', 'creador', 'personal'] as const;
export type GoalCategory = (typeof GOAL_CATEGORIES)[number];
export const GOAL_CATEGORY_INFO: Record<GoalCategory, { label: string; color: string }> = {
  salud: { label: 'Salud', color: '#0FA968' },
  dinero: { label: 'Dinero', color: '#E8912A' },
  estudio: { label: 'Estudio', color: '#4F7CFF' },
  creador: { label: 'Creador', color: '#EC6A9C' },
  personal: { label: 'Personal', color: '#8B5CF6' },
};

export const PET_SPECIES = ['dog', 'cat', 'rabbit', 'hamster', 'bird', 'fish', 'turtle', 'horse', 'cow', 'pig', 'chicken', 'reptile', 'other'] as const;
export type PetSpecies = (typeof PET_SPECIES)[number];
export const PET_SPECIES_INFO: Record<PetSpecies, { label: string; emoji: string }> = {
  dog: { label: 'Perro', emoji: '🐶' },
  cat: { label: 'Gato', emoji: '🐱' },
  rabbit: { label: 'Conejo', emoji: '🐰' },
  hamster: { label: 'Hámster', emoji: '🐹' },
  bird: { label: 'Ave', emoji: '🐦' },
  fish: { label: 'Pez', emoji: '🐠' },
  turtle: { label: 'Tortuga', emoji: '🐢' },
  horse: { label: 'Caballo', emoji: '🐴' },
  cow: { label: 'Vaca', emoji: '🐮' },
  pig: { label: 'Cerdo', emoji: '🐷' },
  chicken: { label: 'Gallina', emoji: '🐔' },
  reptile: { label: 'Reptil', emoji: '🦎' },
  other: { label: 'Otra', emoji: '🐾' },
};

export const CARE_KINDS = ['comida', 'agua', 'paseo', 'vet', 'otro'] as const;
export type CareKind = (typeof CARE_KINDS)[number];
export const CARE_KIND_INFO: Record<CareKind, { label: string; emoji: string }> = {
  comida: { label: 'Comida', emoji: '🍖' },
  agua: { label: 'Agua', emoji: '💧' },
  paseo: { label: 'Paseo', emoji: '🦮' },
  vet: { label: 'Veterinario', emoji: '🩺' },
  otro: { label: 'Otro', emoji: '🐾' },
};

export const PERIOD_FLOWS = ['light', 'medium', 'heavy'] as const;
export type PeriodFlow = (typeof PERIOD_FLOWS)[number];
export const PERIOD_FLOW_INFO: Record<PeriodFlow, { label: string; color: string }> = {
  light: { label: 'Ligero', color: '#F3A6BE' },
  medium: { label: 'Medio', color: '#E5487D' },
  heavy: { label: 'Abundante', color: '#B01E52' },
};
/** Se guardan como texto separado por comas, en español, igual que la app anterior. */
export const PERIOD_SYMPTOMS = ['Cólicos', 'Dolor de cabeza', 'Fatiga', 'Antojos', 'Hinchazón', 'Acné', 'Sensibilidad', 'Náuseas'] as const;
/** Ánimo del registro de regla (emoji guardado) con su nombre para lectores de pantalla. */
export const PERIOD_MOODS = [
  { emoji: '😀', label: 'Genial' },
  { emoji: '🙂', label: 'Bien' },
  { emoji: '😐', label: 'Normal' },
  { emoji: '😔', label: 'Bajo' },
  { emoji: '😣', label: 'Mal' },
  { emoji: '😴', label: 'Cansancio' },
] as const;
/** Ánimo del Diario (la app anterior usa 😄 aquí y 😀 en Ciclo). */
export const JOURNAL_MOODS = [
  { emoji: '😄', label: 'Genial' },
  { emoji: '🙂', label: 'Bien' },
  { emoji: '😐', label: 'Normal' },
  { emoji: '😔', label: 'Bajo' },
  { emoji: '😣', label: 'Mal' },
  { emoji: '😴', label: 'Cansancio' },
] as const;

/** Colores de los registros de salud en el Calendario, como la app anterior. */
export const PERIOD_COLOR = '#E5484D';
export const PREDICTED_PERIOD_COLOR = '#F3A7BB';

/** Duración por defecto del ciclo y de la regla (`cycle`). */
export const CYCLE_DEFAULTS = { cycleLength: 28, periodLength: 5 } as const;
export const WATER_GOAL_DEFAULT = 8;

/** Planes de entreno de la app anterior (se guarda el nombre en `workouts.plan`). */
export const WORKOUT_PLANS = [
  { name: 'Full body', minutes: 30, detail: 'Sentadillas, flexiones, zancadas y plancha' },
  { name: 'Piernas y glúteos', minutes: 25, detail: 'Sentadillas, puente de glúteo y zancadas' },
  { name: 'Core express', minutes: 15, detail: 'Plancha, abdominales y bicho muerto' },
  { name: 'Cardio suave', minutes: 20, detail: 'Marcha rápida, jumping jacks y comba' },
  { name: 'Estiramientos', minutes: 10, detail: 'Cuello, espalda, cadera y piernas' },
] as const;

export const SLEEP_QUALITY_LABELS = ['Muy mala', 'Mala', 'Regular', 'Buena', 'Muy buena'] as const;
export const MEAL_LABELS = ['Desayuno', 'Comida', 'Cena', 'Snack'] as const;

// ---------- Catálogos de la tanda 4 ----------

/** Colores de las notas: `tag` se calcula de la materia (`subject`) como la app anterior. */
export const NOTE_TAG_COLORS = ['#0FA968', '#4F7CFF', '#EC6A9C', '#8B5CF6', '#E8912A'] as const;
export const NOTE_DEFAULT_TITLE = 'Nota sin título';
export const NOTE_DEFAULT_SUBJECT = 'General';
/** Longitud del extracto (`excerpt` = los primeros caracteres del cuerpo). */
export const NOTE_EXCERPT_LENGTH = 90;

/** Mismo cálculo que la app anterior: `colores[|largo + primer código UTF-16| % 5]`. */
export function noteTag(subject: string): string {
  const n = Math.abs(subject.length + subject.charCodeAt(0));
  return NOTE_TAG_COLORS[Number.isFinite(n) ? n % NOTE_TAG_COLORS.length : 0];
}

/** `excerpt` de una nota: los primeros 90 caracteres del cuerpo, como la app anterior. */
export const noteExcerpt = (body: string): string => body.slice(0, NOTE_EXCERPT_LENGTH);

/**
 * `date` de una nota es un **texto para mostrar** («25 sept»), no una fecha:
 * la app anterior lo escribe con `toLocaleDateString("es", { day, month: "short" })`.
 */
export const noteDateLabel = (now: Date = new Date()): string => now.toLocaleDateString('es', { day: 'numeric', month: 'short' });

/** Proyectos de Trabajo: tres proyectos de demostración fijos en el código de la app anterior (no son `projects`). */
export const WORK_PROJECTS = ['p1', 'p2', 'p3'] as const;
export type WorkProject = (typeof WORK_PROJECTS)[number];
export const WORK_PROJECT_INFO: Record<WorkProject, { label: string; color: string }> = {
  p1: { label: 'Proyecto 1', color: '#0FA968' },
  p2: { label: 'Proyecto 2', color: '#EC6A9C' },
  p3: { label: 'Proyecto 3', color: '#4F7CFF' },
};
export const WORK_STATUSES = ['todo', 'curso'] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];
export const WORK_STATUS_INFO: Record<WorkStatus, { label: string }> = {
  todo: { label: 'Por hacer' },
  curso: { label: 'En curso' },
};

/** Tipo de sesión de Respiración (`meditations.kind`) que escribe la app anterior. */
export const MEDITATION_KIND = 'respiracion';

/** Máximo de registros que guarda la app anterior (el más reciente primero). */
export const LEGACY_NEWEST_FIRST: Partial<Record<LegacyKey, number>> = { focus: FOCUS_MAX, transactions: 2000, workouts: 400, sleep: 400, meditations: 400 };

/** Claves con un solo registro por fecha (la app anterior no permite duplicados). */
export const LEGACY_UNIQUE: Partial<Record<LegacyKey, { field: string; message: string }>> = {
  period: { field: 'date', message: 'Ese día ya está registrado' },
  journal: { field: 'date', message: 'Ya hay una entrada del diario para ese día' },
};

// ---------- Formas de los elementos ----------

export interface LegacyBlock {
  id: string;
  label: string;
  sub: string;
  /** Hora de inicio en horas decimales (8.5 = 8:30). */
  start: number;
  /** Duración en horas. */
  dur: number;
  kind: BlockKind;
}

export interface LegacyTask {
  id: string;
  title: string;
  pri: TaskPriority;
  time: string | null;
  rem: boolean;
  done: boolean;
  tags: string;
}

export interface LegacyTodo {
  id: string;
  title: string;
  done: boolean;
}

export interface LegacySubtask {
  id: string;
  todoId: string;
  title: string;
  done: boolean;
}

export interface LegacyReminder {
  id: string;
  /** Día del mes (1–31): el evento se repite cada mes. */
  day: number;
  title: string;
  when: string;
  color: string;
  icon: string;
  on: boolean;
}

export interface LegacyClass {
  id: string;
  /** 1 = lunes … 7 = domingo. */
  day: number;
  start: string;
  end: string;
  title: string;
  room: string;
  color: string;
  /** Id de la materia (`subjects`) o "". */
  subject: string;
}

export interface LegacyFocus {
  id: string;
  mode: FocusMode;
  seconds: number;
  /** Día en UTC, como la app anterior. */
  dateKey: Day;
}

/** Tema de una materia, hito de un proyecto o paso de un roadmap (van dentro de su elemento). */
export interface LegacyCheckItem {
  id: string;
  name: string;
  done: boolean;
}

export interface LegacySubject {
  id: string;
  name: string;
  teacher: string;
  room: string;
  color: string;
  /** Texto libre, p. ej. "Lunes 8:00". */
  nextClass: string;
  topics: LegacyCheckItem[];
}

export interface LegacyMilestone extends LegacyCheckItem {
  /** Siempre "" en la app anterior. */
  date: string;
}

export interface LegacyProject {
  id: string;
  title: string;
  /** NOMBRE de la materia (no su id) o "". */
  subject: string;
  /** Texto libre, p. ej. "20 SEP". */
  deadline: string;
  status: ProjectStatus;
  color: string;
  milestones: LegacyMilestone[];
}

export interface LegacyRoadmap {
  id: string;
  name: string;
  color: string;
  steps: LegacyCheckItem[];
}

export interface LegacyNotebook {
  id: string;
  title: string;
  category: string;
  /** Texto libre (no es un vínculo con `subjects`). */
  subject: string;
  topic: string;
  color: string;
  emoji: string;
}

export interface LegacyNoteBox {
  id: string;
  notebookId: string;
  title: string;
  text: string;
  color: string;
  kind: 'text' | 'code';
  /** "" en las de texto; en las de código, uno de CODE_LANGS. */
  lang: string;
}

export interface LegacyContent {
  id: string;
  title: string;
  stage: ContentStage;
  platform: ContentPlatform;
  notes: string;
  script: string;
  /** Texto libre, p. ej. "12 sep". */
  due: string;
}

export interface LegacyIdea {
  id: string;
  title: string;
  body: string;
  category: IdeaCategory;
  /** Etiquetas separadas por comas. */
  tags: string;
}

export interface LegacyTransaction {
  id: string;
  /** Día en UTC, como la app anterior. */
  date: Day;
  /** Siempre positivo: el signo lo da `type`. */
  amount: number;
  type: TxType;
  category: string;
  note: string;
}

export interface LegacyGoal {
  id: string;
  title: string;
  target: number;
  current: number;
  unit: string;
  /** "AAAA-MM-DD" o "". */
  deadline: string;
  category: GoalCategory;
  done: boolean;
}

export interface LegacyPet {
  id: string;
  name: string;
  species: PetSpecies;
  note: string;
}

export interface LegacyPetCare {
  id: string;
  petId: string;
  kind: CareKind;
  title: string;
  /** "HH:MM" o "". */
  time: string;
  /** Dígitos 1–7, 1 = lunes ("1234567"). */
  days: string;
  sound: boolean;
  enabled: boolean;
  /** Día UTC en que se hizo por última vez, o "". */
  lastDone: string;
}

export interface LegacyPeriodDay {
  id: string;
  /** Día LOCAL (Ciclo y Calendario usan la hora local). Uno por fecha. */
  date: Day;
  flow: PeriodFlow;
  /** Etiquetas en español separadas por comas. */
  symptoms: string;
  /** Emoji o "". */
  mood: string;
  note: string;
}

export interface LegacyWorkout {
  id: string;
  /** Día en UTC. */
  date: Day;
  plan: string;
  minutes: number;
}

export interface LegacySleep {
  id: string;
  /** Día en UTC. */
  date: Day;
  bedtime: string;
  waketime: string;
  /** 1–5. */
  quality: number;
  note: string;
}

export interface LegacyJournal {
  id: string;
  /** Día en UTC. Una entrada por fecha. */
  date: Day;
  mood: string;
  gratitude: string;
  note: string;
}

export interface LegacyRoutine {
  id: string;
  title: string;
  time: string;
  /** Dígitos 1–7, 1 = lunes. */
  days: string;
  icon: string;
  sound: boolean;
  enabled: boolean;
}

export interface LegacyMeal {
  id: string;
  label: string;
  time: string;
  note: string;
  /** Día en UTC. */
  dateKey: Day;
}

export interface LegacyCycle {
  cycleLength: number;
  periodLength: number;
}

export interface LegacyDayLog {
  /** Día UTC al que corresponde `water`; al cambiar de día empieza en 0. */
  dateKey: Day;
  water: number;
  waterGoal: number;
}

export interface LegacyNote {
  id: string;
  title: string;
  /** Materia: agrupa la biblioteca («General» por defecto). */
  subject: string;
  /** Texto para mostrar («25 sept»), no una fecha interpretable. */
  date: string;
  /** Color calculado de `subject` (NOTE_TAG_COLORS). */
  tag: string;
  /** Los primeros 90 caracteres de `body`. */
  excerpt: string;
  /** Markdown; las imágenes van como `![imagen](coreimg:<id>)` o incrustadas en base64. */
  body: string;
  /** Siempre false (activaba una demostración de la app anterior). */
  commit: boolean;
  /** Etiquetas separadas por comas. */
  tags: string;
  /** Enlace público de la app anterior (solo funcionaba en su navegador). La app nueva no lo cambia. */
  shareId: string | null;
}

export interface LegacyWorkItem {
  id: string;
  title: string;
  project: WorkProject;
  status: WorkStatus;
  done: boolean;
  /** Texto libre («Hoy», «Vie»…) o "". */
  due: string;
}

export interface LegacyMeditation {
  id: string;
  /** Día en UTC. */
  date: Day;
  minutes: number;
  kind: string;
}

/** Nuevo: presupuesto mensual de Finanzas, por persona (antes en localStorage `core_budget`). */
export interface LegacyBudget {
  monthly: number;
}

export interface LegacyObjects {
  cycle: LegacyCycle;
  dayLog: LegacyDayLog;
  budget: LegacyBudget;
}

export interface LegacyItems {
  blocks: LegacyBlock;
  tasks: LegacyTask;
  todos: LegacyTodo;
  subtasks: LegacySubtask;
  reminders: LegacyReminder;
  classes: LegacyClass;
  focus: LegacyFocus;
  subjects: LegacySubject;
  projects: LegacyProject;
  roadmaps: LegacyRoadmap;
  notebooks: LegacyNotebook;
  noteBoxes: LegacyNoteBox;
  content: LegacyContent;
  ideas: LegacyIdea;
  transactions: LegacyTransaction;
  goals: LegacyGoal;
  pets: LegacyPet;
  petCares: LegacyPetCare;
  period: LegacyPeriodDay;
  workouts: LegacyWorkout;
  sleep: LegacySleep;
  journal: LegacyJournal;
  routines: LegacyRoutine;
  meals: LegacyMeal;
  notes: LegacyNote;
  workItems: LegacyWorkItem;
  meditations: LegacyMeditation;
}

/** Documento completo de la app anterior: claves conocidas y cualquier otra que traiga. */
export type LegacyData = Record<string, unknown> & { [K in LegacyKey]?: Array<LegacyItems[K]> } & { [K in LegacyObjectKey]?: Partial<LegacyObjects[K]> };

// ---------- Validación ----------

/** Ids nuevos con crypto.randomUUID(); se aceptan también los antiguos (id_…, x…). */
export const legacyIdSchema = z.string().regex(/^[\w-]{1,100}$/, 'Id no válido');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no válida (usa HH:MM)');
const title = (max: number) => z.string().trim().min(1, 'Escribe un título').max(max);
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color no válido');
const text = (max: number) => z.string().max(max).default('');
const line = (max: number) => z.string().trim().max(max).default('');
const named = (max: number) => z.string().trim().min(1, 'Escribe un nombre').max(max);
const dayKey = z.string().refine(isDay, 'Fecha no válida (usa AAAA-MM-DD)');
const optionalDay = z.union([dayKey, z.literal('')]);
const optionalTime = z.union([hhmm, z.literal('')]);
/** Días de la semana como en la app anterior: dígitos 1–7 sin repetir, 1 = lunes. */
const weekdays = z
  .string()
  .regex(/^[1-7]{1,7}$/, 'Días no válidos (usa dígitos del 1 al 7, 1 = lunes)')
  .refine((d) => new Set(d).size === d.length, 'Días repetidos');

/**
 * Subelementos (temas, hitos, pasos). Se editan enviando la lista completa
 * dentro del PATCH del elemento. El nombre no se recorta ni se exige para no
 * rechazar datos antiguos al reenviarlos; la interfaz no deja crear vacíos.
 */
const checkItem = z.object({ id: legacyIdSchema, name: z.string().max(300), done: z.boolean().default(false) }).strict();
const checkList = (item: z.AnyZodObject = checkItem) => z.array(item).max(1000).default([]);

const shapes = {
  blocks: z.object({
    id: legacyIdSchema,
    label: title(120),
    sub: z.string().trim().max(200).default(''),
    start: z.number().min(0).max(23.5),
    dur: z.number().gt(0).max(24),
    kind: z.enum(BLOCK_KINDS).default('study'),
  }),
  tasks: z.object({
    id: legacyIdSchema,
    title: title(200),
    pri: z.enum(TASK_PRIORITIES).default('media'),
    time: hhmm.nullable().default(null),
    rem: z.boolean().default(false),
    done: z.boolean().default(false),
    tags: z.string().max(200).default(''),
  }),
  todos: z.object({ id: legacyIdSchema, title: title(300), done: z.boolean().default(false) }),
  subtasks: z.object({ id: legacyIdSchema, todoId: legacyIdSchema, title: title(300), done: z.boolean().default(false) }),
  reminders: z.object({
    id: legacyIdSchema,
    day: z.number().int().min(1).max(31),
    title: title(200),
    when: z.string().trim().max(60).default(''),
    color: z.enum(REMINDER_COLORS).default(REMINDER_COLORS[0]),
    icon: z.string().max(40).default('doc'),
    on: z.boolean().default(true),
  }),
  classes: z.object({
    id: legacyIdSchema,
    day: z.number().int().min(1).max(7),
    start: hhmm,
    end: hhmm,
    title: title(120),
    room: z.string().trim().max(60).default(''),
    // La paleta del Horario, o el color copiado de una materia.
    color: hex.default(CLASS_COLORS[0]),
    subject: z.union([legacyIdSchema, z.literal('')]).default(''),
  }),
  focus: z.object({
    id: legacyIdSchema,
    mode: z.enum(FOCUS_MODES),
    seconds: z.number().int().min(1).max(86_400),
    dateKey: z.string().refine(isDay, 'Fecha no válida (usa AAAA-MM-DD)'),
  }),
  subjects: z.object({
    id: legacyIdSchema,
    name: title(120),
    teacher: line(120),
    room: line(60),
    color: hex.default(SUBJECT_COLORS[0]),
    nextClass: line(60),
    topics: checkList(),
  }),
  projects: z.object({
    id: legacyIdSchema,
    title: title(200),
    subject: line(120),
    deadline: line(60),
    status: z.enum(PROJECT_STATUSES).default('curso'),
    color: hex.default(PROJECT_COLORS[0]),
    milestones: checkList(checkItem.extend({ date: z.string().max(60).default('') })),
  }),
  roadmaps: z.object({
    id: legacyIdSchema,
    name: title(120),
    color: hex.default(ROADMAP_COLORS[0]),
    steps: checkList(),
  }),
  notebooks: z.object({
    id: legacyIdSchema,
    title: title(120).default('Cuaderno'),
    category: z.string().trim().max(60).default('General').transform((c) => c || 'General'),
    subject: line(120),
    topic: line(120),
    color: hex.default(NOTEBOOK_COLORS[0]),
    emoji: z.string().min(1).max(16).default(NOTEBOOK_EMOJIS[0]),
  }),
  noteBoxes: z.object({
    id: legacyIdSchema,
    notebookId: legacyIdSchema,
    title: z.string().max(200).default(''),
    text: text(200_000),
    color: hex.optional(),
    kind: z.enum(['text', 'code']).default('text'),
    lang: z.string().max(20).optional(),
  }),
  content: z.object({
    id: legacyIdSchema,
    title: title(200),
    stage: z.enum(CONTENT_STAGES).default('idea'),
    platform: z.enum(CONTENT_PLATFORMS).default('youtube'),
    notes: text(50_000),
    script: text(50_000),
    due: line(60),
  }),
  ideas: z.object({
    id: legacyIdSchema,
    title: title(200),
    body: text(50_000),
    category: z.enum(IDEA_CATEGORIES).default('app'),
    tags: z.string().max(300).default(''),
  }),
  transactions: z.object({
    id: legacyIdSchema,
    date: dayKey,
    amount: z.number().finite().min(0, 'El monto no puede ser negativo').max(1e12),
    type: z.enum(TX_TYPES).default('expense'),
    category: z.string().trim().max(60).default('Otro').transform((c) => c || 'Otro'),
    note: line(300),
  }),
  goals: z.object({
    id: legacyIdSchema,
    title: title(200),
    target: z.number().int().min(1, 'La meta debe ser al menos 1').max(1e9).default(10),
    current: z.number().int().min(0).max(1e9).default(0),
    unit: line(40),
    deadline: optionalDay.default(''),
    category: z.enum(GOAL_CATEGORIES).default('personal'),
    done: z.boolean().default(false),
  }),
  pets: z.object({
    id: legacyIdSchema,
    name: named(80),
    species: z.enum(PET_SPECIES).default('dog'),
    note: line(300),
  }),
  petCares: z.object({
    id: legacyIdSchema,
    petId: legacyIdSchema,
    kind: z.enum(CARE_KINDS).default('comida'),
    title: title(120),
    time: optionalTime.default(''),
    days: weekdays.default('1234567'),
    sound: z.boolean().default(true),
    enabled: z.boolean().default(true),
    lastDone: optionalDay.default(''),
  }),
  period: z.object({
    id: legacyIdSchema,
    date: dayKey,
    flow: z.enum(PERIOD_FLOWS).default('medium'),
    symptoms: z.string().max(300).default(''),
    mood: z.string().max(16).default(''),
    note: text(2000),
  }),
  workouts: z.object({
    id: legacyIdSchema,
    date: dayKey,
    plan: title(120),
    minutes: z.number().int().min(1, 'Al menos 1 minuto').max(1440),
  }),
  sleep: z.object({
    id: legacyIdSchema,
    date: dayKey,
    bedtime: hhmm,
    waketime: hhmm,
    quality: z.number().int().min(1).max(5).default(3),
    note: text(1000),
  }),
  journal: z.object({
    id: legacyIdSchema,
    date: dayKey,
    mood: z.string().max(16).default(''),
    gratitude: text(5000),
    note: text(50_000),
  }),
  routines: z.object({
    id: legacyIdSchema,
    title: title(120),
    time: hhmm,
    days: weekdays.default('1234567'),
    icon: z.string().max(40).default('bell'),
    sound: z.boolean().default(true),
    enabled: z.boolean().default(true),
  }),
  meals: z.object({
    id: legacyIdSchema,
    label: z.string().trim().max(60).default('Comida').transform((l) => l || 'Comida'),
    time: optionalTime.default(''),
    note: line(300),
    dateKey: dayKey,
  }),
  notes: z.object({
    id: legacyIdSchema,
    // Sin recortar: el título se guarda mientras escribes y un espacio al final no debe desaparecer.
    title: z.string().max(200).default(NOTE_DEFAULT_TITLE).transform((t) => (t.trim() ? t : NOTE_DEFAULT_TITLE)),
    subject: z.string().max(120).default(NOTE_DEFAULT_SUBJECT).transform((t) => t.trim() || NOTE_DEFAULT_SUBJECT),
    date: z.string().max(40).default(''),
    // Se aceptan (la vista optimista los lleva) pero siempre se recalculan de la materia y del cuerpo.
    tag: z.string().max(20).optional(),
    excerpt: z.string().max(400).optional(),
    // Admite imágenes incrustadas en base64 como la app anterior (el cuerpo JSON admite 8 MB).
    body: text(6_000_000),
    tags: z.string().max(300).default(''),
    commit: z.boolean().default(false),
    shareId: z.string().regex(/^[a-z0-9]{1,40}$/, 'Enlace no válido').nullable().default(null),
  }),
  workItems: z.object({
    id: legacyIdSchema,
    title: title(200),
    project: z.enum(WORK_PROJECTS).default('p1'),
    status: z.enum(WORK_STATUSES).default('todo'),
    done: z.boolean().default(false),
    due: line(60),
  }),
  meditations: z.object({
    id: legacyIdSchema,
    date: dayKey,
    minutes: z.number().int().min(0).max(1440),
    kind: z.string().trim().max(40).default(MEDITATION_KIND).transform((k) => k || MEDITATION_KIND),
  }),
};

/** Formas de las claves que son un objeto. */
const objectShapes = {
  cycle: z.object({
    cycleLength: z.number().int().min(15, 'El ciclo dura al menos 15 días').max(60, 'El ciclo dura como mucho 60 días').default(CYCLE_DEFAULTS.cycleLength),
    periodLength: z.number().int().min(1, 'La regla dura al menos 1 día').max(14, 'La regla dura como mucho 14 días').default(CYCLE_DEFAULTS.periodLength),
  }),
  dayLog: z.object({
    dateKey: dayKey,
    water: z.number().int().min(0).max(40).default(0),
    waterGoal: z.number().int().min(1).max(40).default(WATER_GOAL_DEFAULT),
  }),
  budget: z.object({ monthly: z.number().finite().min(0, 'El presupuesto no puede ser negativo').max(1e12) }),
};

/**
 * Reglas entre campos. Se comprueban sobre el elemento ya fusionado, y en un
 * PATCH solo si el cambio toca alguno de `fields` (así un dato antiguo raro no
 * impide, por ejemplo, marcar algo como hecho).
 */
export const LEGACY_CROSS: Partial<Record<LegacyKey, { fields: string[]; check: (item: Record<string, unknown>) => string | null }>> = {
  blocks: {
    fields: ['start', 'dur'],
    check: (b) => (typeof b.start === 'number' && typeof b.dur === 'number' && b.start + b.dur > 24 ? 'El bloque no puede pasar de medianoche' : null),
  },
  classes: {
    fields: ['start', 'end'],
    check: (c) => (typeof c.start === 'string' && typeof c.end === 'string' && c.end > c.start ? null : 'La hora de fin debe ser posterior a la de inicio'),
  },
};

const withCross = <T extends z.ZodTypeAny>(key: LegacyKey, schema: T) => {
  const cross = LEGACY_CROSS[key];
  return cross
    ? schema.superRefine((v, ctx) => {
        const msg = cross.check(v as Record<string, unknown>);
        if (msg) ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg, path: [cross.fields[1] ?? cross.fields[0]] });
      })
    : schema;
};

/** Elemento nuevo (POST): campos exactos, sin extras. Rellena los valores por defecto de la app anterior. */
export const legacyItemSchemas = {
  blocks: withCross('blocks', shapes.blocks.strict()),
  tasks: shapes.tasks.strict().transform((t) => ({ ...t, rem: !!t.time })),
  todos: shapes.todos.strict(),
  subtasks: shapes.subtasks.strict(),
  reminders: shapes.reminders.strict(),
  classes: withCross('classes', shapes.classes.strict()),
  focus: shapes.focus.strict(),
  subjects: shapes.subjects.strict(),
  projects: shapes.projects.strict(),
  roadmaps: shapes.roadmaps.strict(),
  notebooks: shapes.notebooks.strict(),
  // Color y lenguaje por defecto según el tipo, y en el mismo orden que la app anterior.
  noteBoxes: shapes.noteBoxes.strict().transform((b) => ({
    id: b.id,
    notebookId: b.notebookId,
    title: b.title,
    text: b.text,
    color: b.color ?? (b.kind === 'code' ? CODE_BOX_COLOR : BOX_COLORS[0]),
    kind: b.kind,
    lang: b.lang ?? (b.kind === 'code' ? CODE_LANGS[0] : ''),
  })),
  content: shapes.content.strict(),
  ideas: shapes.ideas.strict(),
  transactions: shapes.transactions.strict(),
  goals: shapes.goals.strict(),
  pets: shapes.pets.strict(),
  petCares: shapes.petCares.strict(),
  period: shapes.period.strict(),
  workouts: shapes.workouts.strict(),
  sleep: shapes.sleep.strict(),
  journal: shapes.journal.strict(),
  routines: shapes.routines.strict(),
  meals: shapes.meals.strict(),
  // `tag` y `excerpt` se calculan siempre (de la materia y del cuerpo), en el orden de campos de la app anterior.
  notes: shapes.notes.strict().transform((n) => ({
    id: n.id,
    title: n.title,
    subject: n.subject,
    date: n.date,
    tag: noteTag(n.subject),
    excerpt: noteExcerpt(n.body),
    body: n.body,
    commit: n.commit,
    tags: n.tags,
    shareId: n.shareId,
  })),
  workItems: shapes.workItems.strict(),
  meditations: shapes.meditations.strict(),
} satisfies Record<LegacyKey, z.ZodTypeAny>;

const patchOf = (o: z.AnyZodObject): z.AnyZodObject => {
  // Sin valores por defecto: un PATCH solo cambia lo que trae.
  const entries = Object.entries(o.shape as Record<string, z.ZodTypeAny>).filter(([k]) => k !== 'id');
  return z.object(Object.fromEntries(entries.map(([k, v]) => [k, (v instanceof z.ZodDefault ? v.removeDefault() : v).optional()]))).strict();
};

/** Cambios parciales (PATCH). El id no se puede cambiar. */
export const legacyPatchSchemas = {
  blocks: patchOf(shapes.blocks),
  tasks: patchOf(shapes.tasks),
  todos: patchOf(shapes.todos),
  subtasks: patchOf(shapes.subtasks),
  reminders: patchOf(shapes.reminders),
  classes: patchOf(shapes.classes),
  focus: patchOf(shapes.focus),
  subjects: patchOf(shapes.subjects),
  projects: patchOf(shapes.projects),
  roadmaps: patchOf(shapes.roadmaps),
  notebooks: patchOf(shapes.notebooks),
  noteBoxes: patchOf(shapes.noteBoxes),
  content: patchOf(shapes.content),
  ideas: patchOf(shapes.ideas),
  transactions: patchOf(shapes.transactions),
  goals: patchOf(shapes.goals),
  pets: patchOf(shapes.pets),
  petCares: patchOf(shapes.petCares),
  period: patchOf(shapes.period),
  workouts: patchOf(shapes.workouts),
  sleep: patchOf(shapes.sleep),
  journal: patchOf(shapes.journal),
  routines: patchOf(shapes.routines),
  meals: patchOf(shapes.meals),
  // El enlace público (`shareId`) y `commit` son de la app anterior: la app nueva no los cambia.
  notes: patchOf(shapes.notes.omit({ shareId: true, commit: true, tag: true, excerpt: true })),
  workItems: patchOf(shapes.workItems),
  meditations: patchOf(shapes.meditations),
} satisfies Record<LegacyKey, z.ZodTypeAny>;

/**
 * Campos que se derivan de otros en un cambio parcial, igual en el servidor y
 * en la vista optimista: `rem` de una tarea sigue a `time`; el extracto de una
 * nota sigue al cuerpo y su color, a la materia.
 */
export function deriveLegacyPatch(key: LegacyKey, patch: Record<string, unknown>): Record<string, unknown> {
  if (key === 'tasks' && 'time' in patch) return { ...patch, rem: !!patch.time };
  if (key === 'notes') {
    const out = { ...patch };
    if (typeof patch.body === 'string') out.excerpt = noteExcerpt(patch.body);
    if (typeof patch.subject === 'string') out.tag = noteTag(patch.subject);
    return out;
  }
  return patch;
}

/** Objeto completo (PUT): campos exactos, con los valores por defecto de la app anterior. */
export const legacyObjectSchemas = {
  cycle: objectShapes.cycle.strict(),
  dayLog: objectShapes.dayLog.strict(),
  budget: objectShapes.budget.strict(),
} satisfies Record<LegacyObjectKey, z.ZodTypeAny>;

/** Cambio parcial de un objeto (PATCH). */
export const legacyObjectPatchSchemas = {
  cycle: patchOf(objectShapes.cycle),
  dayLog: patchOf(objectShapes.dayLog),
  budget: patchOf(objectShapes.budget),
} satisfies Record<LegacyObjectKey, z.ZodTypeAny>;

/** Valores con los que se completa un objeto que falta o está a medias (como `ur()` en la app anterior). */
export function legacyObjectDefaults<K extends LegacyObjectKey>(key: K, today: Day = utcDayKey()): LegacyObjects[K] {
  const defaults: LegacyObjects = {
    cycle: { ...CYCLE_DEFAULTS },
    dayLog: { dateKey: today, water: 0, waterGoal: WATER_GOAL_DEFAULT },
    budget: { monthly: 0 },
  };
  return defaults[key];
}

/** Lee un objeto del documento con sus valores por defecto y conservando los campos desconocidos. */
export function legacyObject<K extends LegacyObjectKey>(data: Record<string, unknown> | null | undefined, key: K, today?: Day): LegacyObjects[K] {
  const v = data?.[key];
  return { ...legacyObjectDefaults(key, today), ...(isObj(v) ? v : {}) } as LegacyObjects[K];
}

/** Cambios parciales de un elemento (sin id). */
export type LegacyPatch<K extends LegacyKey> = Partial<Omit<LegacyItems[K], 'id'>>;

/** Lista de subelementos de cada clave (se edita con un PATCH del elemento). */
export const LEGACY_NESTED: Partial<Record<LegacyKey, string>> = { subjects: 'topics', projects: 'milestones', roadmaps: 'steps' };

/** Relaciones padre → hijos: el hijo guarda el id del padre en `field` y se borra con él, como en la app anterior. */
export const LEGACY_CHILDREN: Partial<Record<LegacyKey, { key: LegacyKey; field: string }>> = {
  todos: { key: 'subtasks', field: 'todoId' },
  notebooks: { key: 'noteBoxes', field: 'notebookId' },
  pets: { key: 'petCares', field: 'petId' },
};

/** Padre de cada clave hija (el inverso de LEGACY_CHILDREN) y el error si no existe. */
export const LEGACY_PARENT: Partial<Record<LegacyKey, { key: LegacyKey; field: string; missing: string }>> = {
  subtasks: { key: 'todos', field: 'todoId', missing: 'La tarea principal no existe' },
  noteBoxes: { key: 'notebooks', field: 'notebookId', missing: 'El cuaderno no existe' },
  petCares: { key: 'pets', field: 'petId', missing: 'La mascota no existe' },
};

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/**
 * Aplica un cambio parcial igual en el servidor y en la vista optimista:
 * fusión superficial (se conservan los campos que la app nueva no conoce) y,
 * en las listas anidadas, cada subelemento se fusiona con el guardado de su
 * mismo id para no perder sus campos desconocidos.
 */
export function mergeLegacyItem<T extends { id: string }>(key: LegacyKey, item: T, patch: Record<string, unknown>): T {
  const next: Record<string, unknown> = { ...item, ...patch, id: item.id };
  const field = LEGACY_NESTED[key];
  if (field && Array.isArray(patch[field])) {
    const before = (item as Record<string, unknown>)[field];
    const old = new Map((Array.isArray(before) ? before : []).filter(isObj).map((s) => [s.id, s]));
    next[field] = (patch[field] as unknown[]).map((s) => (isObj(s) ? { ...(old.get(s.id) ?? {}), ...s } : s));
  }
  return next as T;
}

/** Subelementos de un elemento con la defensa de la app anterior: sin entradas rotas, ids y `done` garantizados. */
export function checkItems<T extends LegacyCheckItem>(list: unknown, makeId: () => string): T[] {
  if (!Array.isArray(list)) return [];
  return list.filter(isObj).map((s) => ({ ...s, id: typeof s.id === 'string' && s.id ? s.id : makeId(), name: typeof s.name === 'string' ? s.name : '', done: !!s.done }) as T);
}

/** Para enviar una lista anidada: solo los campos conocidos (el servidor conserva el resto por id). */
export function checkItemsPayload<T extends LegacyCheckItem>(list: T[]): T[] {
  return list.map((s) => ({ id: s.id, name: s.name, done: !!s.done, ...('date' in s ? { date: typeof s.date === 'string' ? s.date : '' } : {}) }) as T);
}

export const legacyReorderSchema = z.object({ ids: z.array(legacyIdSchema).max(5000) }).strict();

/** Lee una lista del documento con la misma defensa que la app anterior (`x || []`). */
export function legacyList<K extends LegacyKey>(data: Record<string, unknown> | null | undefined, key: K): Array<LegacyItems[K]> {
  const v = data?.[key];
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Array<LegacyItems[K]>) : [];
}

/** Reordena como la app anterior: primero los ids indicados, después el resto en su orden. */
export function reorderById<T extends { id: string }>(list: T[], ids: string[]): T[] {
  // Tolera entradas rotas en datos antiguos: se conservan al final.
  const byId = new Map(list.map((x) => [x?.id, x]));
  const used = new Set<T>();
  for (const id of ids) {
    const x = byId.get(id);
    if (x) used.add(x);
  }
  return [...used, ...list.filter((x) => !used.has(x))];
}

/** Un cambio de una lista del documento, tal como lo envían la web y el móvil a /api/v2/modules. */
export type LegacyOp<K extends LegacyKey> =
  | { type: 'add'; item: LegacyItems[K] }
  | { type: 'update'; id: string; patch: LegacyPatch<K> }
  | { type: 'remove'; id: string }
  | { type: 'reorder'; ids: string[] };

/** Aplica un cambio en la copia local igual que lo hará el servidor (para las vistas optimistas). */
export function applyLegacyOp<K extends LegacyKey>(data: LegacyData, key: K, op: LegacyOp<K>): LegacyData {
  const list = legacyList(data, key) as Array<LegacyItems[K]>;
  switch (op.type) {
    case 'add': {
      // Enfoque, finanzas, entrenos, sueño y respiración: lo más reciente primero, como en el servidor.
      const max = LEGACY_NEWEST_FIRST[key];
      return { ...data, [key]: max ? [op.item, ...list].slice(0, max) : [...list, op.item] };
    }
    case 'update': {
      // Con los campos derivados (extracto y color de una nota, `rem` de una tarea), como el servidor.
      const patch = deriveLegacyPatch(key, op.patch as Record<string, unknown>);
      return { ...data, [key]: list.map((x) => (x.id === op.id ? mergeLegacyItem(key, x, patch) : x)) };
    }
    case 'remove': {
      // Pendiente → subtareas, cuaderno → cajitas y mascota → cuidados se borran juntos, como en el servidor.
      const child = LEGACY_CHILDREN[key];
      return {
        ...data,
        [key]: list.filter((x) => x.id !== op.id),
        ...(child ? { [child.key]: legacyList(data, child.key).filter((s) => (s as unknown as Record<string, unknown>)[child.field] !== op.id) } : {}),
      };
    }
    case 'reorder':
      return { ...data, [key]: reorderById(list, op.ids) };
  }
}

/** Id nuevo como en la app anterior: randomUUID si existe (navegador) o uno aleatorio con la fecha (React Native). */
export function newLegacyId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  return `id_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

// ---------- Enfoque (Pomodoro) ----------

/** Día en UTC, como guarda la app anterior (`toISOString().slice(0,10)`). */
export const utcDayKey = (now: Date = new Date()): Day => now.toISOString().slice(0, 10);

/**
 * Lo que viene después de una sesión. Tras cada cuarta sesión de enfoque
 * completada toca descanso largo; tras las demás, corto; tras un descanso, enfoque.
 */
export function nextFocusMode(mode: FocusMode, completedFocus: number): FocusMode {
  if (mode !== 'focus') return 'focus';
  return completedFocus > 0 && completedFocus % 4 === 0 ? 'long' : 'short';
}

export interface FocusStats {
  sessionsToday: number;
  hoursWeek: number;
  hoursTotal: number;
  streak: number;
}

/** Estadísticas de Enfoque: solo cuentan las sesiones `focus`. `today` es el día UTC. */
export function focusStats(records: LegacyFocus[], today: Day): FocusStats {
  const focus = records.filter((r) => r.mode === 'focus' && typeof r.seconds === 'number');
  const weekStart = addDays(today, -6);
  const days = new Set(focus.map((r) => r.dateKey));
  // La racha cuenta hasta hoy; si hoy aún no hay sesión, hasta ayer.
  let day = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(day)) {
    streak++;
    day = addDays(day, -1);
  }
  const hours = (list: LegacyFocus[]) => list.reduce((s, r) => s + r.seconds, 0) / 3600;
  return {
    sessionsToday: focus.filter((r) => r.dateKey === today).length,
    hoursWeek: hours(focus.filter((r) => r.dateKey >= weekStart && r.dateKey <= today)),
    hoursTotal: hours(focus),
    streak,
  };
}

// ---------- Horas ----------

/** "08:30" → 8.5 */
export const hhmmToHours = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h + m / 60;
};

/** 8.5 → "8:30" (para bloques con horas decimales). */
export function hoursLabel(h: number): string {
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// ---------- Tanda 2: derivados de Materias, Proyectos y Roadmaps ----------

/** Porcentaje entero de hechos (0 si la lista está vacía). */
export const donePercent = (list: Array<{ done?: unknown }>): number => (list.length ? Math.round((list.filter((x) => !!x.done).length / list.length) * 100) : 0);

/** Progreso de un proyecto como la app anterior: por hitos; sin hitos, 100 % entregado, 90 % en revisión y 0 % en otro caso. */
export function projectProgress(p: { milestones?: unknown; status?: unknown }): number {
  const ms = Array.isArray(p.milestones) ? (p.milestones as Array<{ done?: unknown }>).filter(isObj) : [];
  if (ms.length) return donePercent(ms);
  return p.status === 'entregado' ? 100 : p.status === 'revision' ? 90 : 0;
}

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Lee una fecha de entrega escrita a mano. Entiende "20 SEP", "12 sep.",
 * "3 de octubre (de 2026)" (del año en curso si no lo lleva) y fechas con año
 * que entienda `Date.parse` ("2026-09-28"). Devuelve null si no la entiende.
 */
export function parseDeadline(text: unknown, now: Date = new Date()): Date | null {
  const t = typeof text === 'string' ? text.trim().toLowerCase() : '';
  if (!t) return null;
  const m = /^(\d{1,2})\s*(?:de\s+)?([a-záéíóú]{3,})\.?(?:\s+(?:de\s+)?(\d{4}))?$/.exec(t);
  if (m) {
    const month = MONTHS_ES.indexOf(m[2].slice(0, 3).replace('set', 'sep'));
    const day = Number(m[1]);
    if (month < 0 || day < 1 || day > 31) return null;
    return new Date(m[3] ? Number(m[3]) : now.getFullYear(), month, day);
  }
  if (!/\d{4}/.test(t)) return null;
  const at = Date.parse(t);
  return Number.isNaN(at) ? null : new Date(at);
}

/**
 * ¿Cuenta como entrega de esta semana? Como la app anterior: entre ayer y
 * dentro de 7 días, y una fecha que no se entiende cuenta siempre (vacía no).
 * Mejora: "20 SEP" se lee en español del año en curso (la app anterior se lo
 * pasaba a `Date.parse`, que en Chrome lo toma como del año 2001).
 */
export function dueThisWeek(deadline: unknown, now: number = Date.now()): boolean {
  const t = typeof deadline === 'string' ? deadline.trim() : '';
  if (!t) return false;
  const at = parseDeadline(t, new Date(now));
  if (!at) return true;
  const day = 86_400_000;
  // Fin del día de la entrega: "hoy" cuenta todo el día.
  const diff = at.getTime() + day - 1 - now;
  return diff >= -day && diff <= 8 * day;
}

export type StepState = 'done' | 'current' | 'next' | 'locked';

/** Estado de cada paso de un roadmap (no se guarda): el primero sin hacer es el actual y el siguiente, el próximo. */
export function stepStates(steps: Array<{ done?: unknown }>): StepState[] {
  const current = steps.findIndex((s) => !s.done);
  return steps.map((s, i) => (s.done ? 'done' : i === current ? 'current' : i === current + 1 ? 'next' : 'locked'));
}

/** "examen, física , " → ["examen", "física"] */
export const splitTags = (tags: unknown): string[] =>
  typeof tags === 'string'
    ? tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

// ---------- Tanda 3: Finanzas, Metas, Mascotas, Ciclo, Ejercicio, Sueño, Diario y Rutina ----------

const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const hhmmMinutes = (t: unknown): number | null => {
  if (typeof t !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export interface MonthSummary {
  income: number;
  expense: number;
  balance: number;
  /** Gastos por categoría, de mayor a menor. */
  byCategory: Array<{ category: string; amount: number }>;
  /** Movimientos del mes, del más reciente al más antiguo. */
  items: LegacyTransaction[];
}

/**
 * Resumen de un mes ("AAAA-MM") como la app anterior: filtra por
 * `date.startsWith(mes)`, usa el valor absoluto del monto y todo lo que no es
 * `income` cuenta como gasto.
 */
export function monthSummary(list: LegacyTransaction[], month: string): MonthSummary {
  const items = list.filter((t) => typeof t.date === 'string' && t.date.startsWith(month)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  let income = 0;
  let expense = 0;
  const cats = new Map<string, number>();
  for (const t of items) {
    const amount = Math.abs(num(t.amount));
    if (t.type === 'income') income += amount;
    else {
      expense += amount;
      const c = typeof t.category === 'string' && t.category.trim() ? t.category.trim() : 'Otro';
      cats.set(c, (cats.get(c) ?? 0) + amount);
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    income: round(income),
    expense: round(expense),
    balance: round(income - expense),
    byCategory: [...cats].map(([category, amount]) => ({ category, amount: round(amount) })).sort((a, b) => b.amount - a.amount),
    items,
  };
}

/** Porcentaje entero de una meta (0–100). */
export function goalPercent(g: { current?: unknown; target?: unknown }): number {
  const target = num(g.target);
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((num(g.current) / target) * 100)));
}

/** +1 / −1 como la app anterior: `done` pasa a verdadero al llegar a la meta. */
export function goalStep(g: LegacyGoal, delta: number): Pick<LegacyGoal, 'current' | 'done'> {
  const current = Math.max(0, Math.round(num(g.current)) + delta);
  return { current, done: current >= Math.max(1, num(g.target)) };
}

/** «✓ Lograda» alterna `done`; al marcarla, `current` pasa a ser la meta. */
export function goalToggleDone(g: LegacyGoal): Partial<Pick<LegacyGoal, 'current' | 'done'>> {
  return g.done ? { done: false } : { done: true, current: Math.max(num(g.current), num(g.target)) };
}

/** Minutos dormidos entre dos horas "HH:MM" (cruza la medianoche). null si alguna no es válida. */
export function sleepMinutes(bedtime: unknown, waketime: unknown): number | null {
  const bed = hhmmMinutes(bedtime);
  const wake = hhmmMinutes(waketime);
  if (bed === null || wake === null) return null;
  const d = wake - bed;
  return d <= 0 ? d + 1440 : d;
}

/** Media de las últimas `nights` noches (por fecha), como la app anterior (14). */
export function sleepStats(list: LegacySleep[], nights = 14): { nights: number; avgMinutes: number | null; avgQuality: number | null } {
  const recent = [...list]
    .filter((s) => isDay(s.date))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, nights);
  const mins = recent.map((s) => sleepMinutes(s.bedtime, s.waketime)).filter((m): m is number => m !== null);
  const quality = recent.map((s) => s.quality).filter((q) => typeof q === 'number' && q >= 1 && q <= 5);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return { nights: recent.length, avgMinutes: avg(mins), avgQuality: avg(quality) };
}

/** Entrenos de la semana (lunes a domingo del día `today`), total y racha de días seguidos. */
export function workoutStats(list: LegacyWorkout[], today: Day): { weekCount: number; weekMinutes: number; total: number; streak: number } {
  const week = periodRange('week', today);
  const valid = list.filter((w) => isDay(w.date));
  const inWeek = valid.filter((w) => w.date >= week.from && w.date <= week.to);
  const days = new Set(valid.map((w) => w.date));
  let day = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(day)) {
    streak++;
    day = addDays(day, -1);
  }
  return { weekCount: inWeek.length, weekMinutes: inWeek.reduce((s, w) => s + num(w.minutes), 0), total: valid.length, streak };
}

export interface CycleInfo {
  /** Inicio del último periodo registrado (retrocediendo por días seguidos). */
  lastStart: Day;
  /** Día del ciclo de hoy (1 = primer día de regla). */
  cycleDay: number;
  /** Próximo periodo previsto. */
  nextStart: Day;
  daysUntilNext: number;
  /** Ventana fértil estimada: de 17 a 13 días antes del próximo periodo. */
  fertileStart: Day;
  fertileEnd: Day;
}

/** Días registrados (válidos y sin repetir), ordenados. */
export function periodDays(list: Array<{ date?: unknown }>): Day[] {
  return [...new Set(list.map((p) => p.date).filter(isDay))].sort();
}

/**
 * Previsión de Ciclo como la app anterior (no se guarda): el último periodo
 * empieza en la fecha registrada más reciente (hasta hoy), retrocediendo por
 * días seguidos; el próximo es ese inicio más la duración del ciclo, avanzando
 * hasta que no quede en el pasado; la ventana fértil va de 14 días antes del
 * próximo periodo −3 a +1. Es una estimación, no un consejo médico.
 */
export function cycleInfo(list: Array<{ date?: unknown }>, cycle: Partial<LegacyCycle> | undefined, today: Day): CycleInfo | null {
  const days = periodDays(list).filter((d) => d <= today);
  if (!days.length) return null;
  const set = new Set(days);
  let lastStart = days[days.length - 1];
  while (set.has(addDays(lastStart, -1))) lastStart = addDays(lastStart, -1);
  const length = cycleLengthOf(cycle);
  let nextStart = addDays(lastStart, length);
  while (nextStart < today) nextStart = addDays(nextStart, length);
  return {
    lastStart,
    cycleDay: diffDays(lastStart, today) + 1,
    nextStart,
    daysUntilNext: diffDays(today, nextStart),
    fertileStart: addDays(nextStart, -17),
    fertileEnd: addDays(nextStart, -13),
  };
}

const cycleLengthOf = (c: Partial<LegacyCycle> | undefined) => {
  const n = c?.cycleLength;
  return typeof n === 'number' && Number.isInteger(n) && n >= 15 && n <= 60 ? n : CYCLE_DEFAULTS.cycleLength;
};
const periodLengthOf = (c: Partial<LegacyCycle> | undefined) => {
  const n = c?.periodLength;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 14 ? n : CYCLE_DEFAULTS.periodLength;
};

/**
 * Días previstos entre `from` y `to` (incluidos): regla prevista (sin los ya
 * registrados) y ventana fértil de cada ciclo a partir del próximo periodo.
 */
export function cyclePredictions(info: CycleInfo | null, cycle: Partial<LegacyCycle> | undefined, from: Day, to: Day, registered: Iterable<Day> = []): { period: Set<Day>; fertile: Set<Day> } {
  const period = new Set<Day>();
  const fertile = new Set<Day>();
  if (!info) return { period, fertile };
  const seen = new Set(registered);
  const length = cycleLengthOf(cycle);
  const days = periodLengthOf(cycle);
  const inRange = (d: Day) => d >= from && d <= to;
  for (let k = 0, start = info.nextStart; k < 60 && addDays(start, -17) <= to; k++, start = addDays(start, length)) {
    for (let i = 0; i < days; i++) {
      const d = addDays(start, i);
      if (inRange(d) && !seen.has(d)) period.add(d);
    }
    for (let i = -17; i <= -13; i++) {
      const d = addDays(start, i);
      if (inRange(d) && !seen.has(d)) fertile.add(d);
    }
  }
  return { period, fertile };
}

/** Periodos registrados (días seguidos agrupados), del más reciente al más antiguo. */
export function periodRuns(list: Array<{ date?: unknown }>): Array<{ start: Day; end: Day; days: number }> {
  const runs: Array<{ start: Day; end: Day; days: number }> = [];
  for (const d of periodDays(list)) {
    const last = runs[runs.length - 1];
    if (last && addDays(last.end, 1) === d) {
      last.end = d;
      last.days++;
    } else runs.push({ start: d, end: d, days: 1 });
  }
  return runs.reverse();
}

/** "1234567" contiene el día ISO (1 = lunes). Días no válidos cuentan como todos, como la app anterior por defecto. */
export function onWeekday(days: unknown, isoDay: number): boolean {
  return typeof days === 'string' && /^[1-7]+$/.test(days) ? days.includes(String(isoDay)) : true;
}

/**
 * Próxima vez que toca un cuidado de mascota (o una rutina): hoy si está en
 * sus días y no se hizo hoy (día UTC, como la app anterior), si no el
 * siguiente día de la semana que le toque. `late` = hoy y ya pasó su hora.
 */
export function nextDue(item: { days?: unknown; time?: unknown; enabled?: unknown; lastDone?: unknown }, now: Date = new Date()): { inDays: number; time: string; late: boolean } | null {
  if (item.enabled === false) return null;
  const today = now.getDay() === 0 ? 7 : now.getDay();
  const doneToday = item.lastDone === utcDayKey(now);
  const time = typeof item.time === 'string' ? item.time : '';
  const t = hhmmMinutes(time);
  for (let inDays = 0; inDays < 8; inDays++) {
    const iso = ((today - 1 + inDays) % 7) + 1;
    if (!onWeekday(item.days, iso) || (inDays === 0 && doneToday)) continue;
    return { inDays, time, late: inDays === 0 && t !== null && t < now.getHours() * 60 + now.getMinutes() };
  }
  return null;
}

/** Vasos de agua de hoy: el registro de otro día cuenta como 0 (la app anterior lo reinicia en el primer cambio). */
export const waterToday = (log: Partial<LegacyDayLog> | undefined, today: Day): number => (log?.dateKey === today ? Math.max(0, Math.round(num(log.water))) : 0);
