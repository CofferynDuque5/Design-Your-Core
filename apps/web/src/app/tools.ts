import { legacyList, type LegacyData } from '@dyc/core';
import {
  AlarmClock,
  BookOpen,
  CalendarClock,
  CalendarDays,
  Clapperboard,
  Dumbbell,
  Flower2,
  FolderKanban,
  GraduationCap,
  Lightbulb,
  ListTodo,
  Moon,
  NotebookPen,
  PawPrint,
  Route,
  School,
  Target,
  Timer,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export type ToolGroup = 'organizacion' | 'estudio' | 'personal' | 'salud';

/** Subgrupos de «Herramientas» en la barra lateral y en «Más». */
export const TOOL_GROUPS: Array<{ id: ToolGroup; label: string }> = [
  { id: 'organizacion', label: 'Organización' },
  { id: 'estudio', label: 'Estudio y trabajo' },
  { id: 'personal', label: 'Vida personal' },
  { id: 'salud', label: 'Salud' },
];

export interface Tool {
  to: string;
  label: string;
  icon: LucideIcon;
  group: ToolGroup;
  description: string;
  count: (d: LegacyData) => number;
  unit: [string, string];
  /** Solo aparece en el menú si la persona lo activa (Ciclo, como `showCycle` en la app anterior). */
  optIn?: 'cycle';
}

/** Herramientas de la app anterior ya reconstruidas en la app nueva (tandas 1, 2 y 3). */
export const TOOLS: Tool[] = [
  {
    to: '/agenda',
    label: 'Agenda',
    icon: CalendarClock,
    group: 'organizacion',
    description: 'Bloques de tu día y tareas por prioridad',
    count: (d) => legacyList(d, 'blocks').length + legacyList(d, 'tasks').length,
    unit: ['elemento', 'elementos'],
  },
  {
    to: '/pendientes',
    label: 'Pendientes',
    icon: ListTodo,
    group: 'organizacion',
    description: 'Tu lista de cosas por hacer, con subtareas',
    count: (d) => legacyList(d, 'todos').filter((t) => !t.done).length,
    unit: ['por hacer', 'por hacer'],
  },
  {
    to: '/calendario',
    label: 'Calendario',
    icon: CalendarDays,
    group: 'organizacion',
    description: 'Eventos de cada mes, entrenos, metas y diario',
    count: (d) => legacyList(d, 'reminders').length,
    unit: ['evento', 'eventos'],
  },
  {
    to: '/horario',
    label: 'Horario',
    icon: School,
    group: 'organizacion',
    description: 'Tus clases de la semana',
    count: (d) => legacyList(d, 'classes').length,
    unit: ['clase', 'clases'],
  },
  {
    to: '/enfoque',
    label: 'Enfoque',
    icon: Timer,
    group: 'organizacion',
    description: 'Temporizador Pomodoro y tus horas de concentración',
    count: (d) => legacyList(d, 'focus').filter((f) => f.mode === 'focus').length,
    unit: ['sesión', 'sesiones'],
  },
  {
    to: '/materias',
    label: 'Materias',
    icon: GraduationCap,
    group: 'estudio',
    description: 'Asignaturas, temas y avance del curso',
    count: (d) => legacyList(d, 'subjects').length,
    unit: ['materia', 'materias'],
  },
  {
    to: '/proyectos',
    label: 'Proyectos',
    icon: FolderKanban,
    group: 'estudio',
    description: 'Trabajos y entregas con hitos y progreso',
    count: (d) => legacyList(d, 'projects').filter((p) => p.status !== 'entregado').length,
    unit: ['activo', 'activos'],
  },
  {
    to: '/roadmaps',
    label: 'Roadmaps',
    icon: Route,
    group: 'estudio',
    description: 'Tu ruta de estudio paso a paso',
    count: (d) => legacyList(d, 'roadmaps').length,
    unit: ['ruta', 'rutas'],
  },
  {
    to: '/cuadernos',
    label: 'Cuadernos',
    icon: BookOpen,
    group: 'estudio',
    description: 'Apuntes en cajitas de texto y de código',
    count: (d) => legacyList(d, 'notebooks').length,
    unit: ['cuaderno', 'cuadernos'],
  },
  {
    to: '/contenido',
    label: 'Contenido',
    icon: Clapperboard,
    group: 'estudio',
    description: 'Tus videos: guion, notas y publicación',
    count: (d) => legacyList(d, 'content').length,
    unit: ['video', 'videos'],
  },
  {
    to: '/ideas',
    label: 'Ideas',
    icon: Lightbulb,
    group: 'estudio',
    description: 'Tu banco de ideas de apps, webs y marketing',
    count: (d) => legacyList(d, 'ideas').length,
    unit: ['idea', 'ideas'],
  },
  {
    to: '/finanzas',
    label: 'Finanzas',
    icon: Wallet,
    group: 'personal',
    description: 'Ingresos, gastos por categoría y presupuesto del mes',
    count: (d) => legacyList(d, 'transactions').length,
    unit: ['movimiento', 'movimientos'],
  },
  {
    to: '/metas',
    label: 'Metas',
    icon: Target,
    group: 'personal',
    description: 'Objetivos con progreso y fecha límite',
    count: (d) => legacyList(d, 'goals').filter((g) => !g.done).length,
    unit: ['en curso', 'en curso'],
  },
  {
    to: '/mascotas',
    label: 'Mascotas',
    icon: PawPrint,
    group: 'personal',
    description: 'Tus mascotas y sus cuidados de cada día',
    count: (d) => legacyList(d, 'pets').length,
    unit: ['mascota', 'mascotas'],
  },
  {
    to: '/ejercicio',
    label: 'Ejercicio',
    icon: Dumbbell,
    group: 'salud',
    description: 'Planes de entreno y tu historial',
    count: (d) => legacyList(d, 'workouts').length,
    unit: ['entreno', 'entrenos'],
  },
  {
    to: '/sueno',
    label: 'Sueño',
    icon: Moon,
    group: 'salud',
    description: 'Horas y calidad de tus noches',
    count: (d) => legacyList(d, 'sleep').length,
    unit: ['noche', 'noches'],
  },
  {
    to: '/diario',
    label: 'Diario',
    icon: NotebookPen,
    group: 'salud',
    description: 'Ánimo, gratitud y notas de cada día',
    count: (d) => legacyList(d, 'journal').length,
    unit: ['entrada', 'entradas'],
  },
  {
    to: '/rutina',
    label: 'Rutina',
    icon: AlarmClock,
    group: 'salud',
    description: 'Rutinas por hora y día, comidas y agua',
    count: (d) => legacyList(d, 'routines').length,
    unit: ['rutina', 'rutinas'],
  },
  {
    to: '/ciclo',
    label: 'Ciclo',
    icon: Flower2,
    group: 'salud',
    description: 'Registro de tu regla y previsión del próximo periodo',
    count: (d) => legacyList(d, 'period').length,
    unit: ['día registrado', 'días registrados'],
    optIn: 'cycle',
  },
];
