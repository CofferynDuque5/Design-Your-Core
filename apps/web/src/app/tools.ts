import { legacyList, type LegacyData } from '@dyc/core';
import { CalendarClock, CalendarDays, ListTodo, School, Timer, type LucideIcon } from 'lucide-react';

/** Herramientas de la app anterior ya reconstruidas en la app nueva (tanda 1). */
export const TOOLS: Array<{ to: string; label: string; icon: LucideIcon; description: string; count: (d: LegacyData) => number; unit: [string, string] }> = [
  {
    to: '/agenda',
    label: 'Agenda',
    icon: CalendarClock,
    description: 'Bloques de tu día y tareas por prioridad',
    count: (d) => legacyList(d, 'blocks').length + legacyList(d, 'tasks').length,
    unit: ['elemento', 'elementos'],
  },
  {
    to: '/pendientes',
    label: 'Pendientes',
    icon: ListTodo,
    description: 'Tu lista de cosas por hacer, con subtareas',
    count: (d) => legacyList(d, 'todos').filter((t) => !t.done).length,
    unit: ['por hacer', 'por hacer'],
  },
  {
    to: '/calendario',
    label: 'Calendario',
    icon: CalendarDays,
    description: 'Eventos de cada mes, entrenos, metas y diario',
    count: (d) => legacyList(d, 'reminders').length,
    unit: ['evento', 'eventos'],
  },
  {
    to: '/horario',
    label: 'Horario',
    icon: School,
    description: 'Tus clases de la semana',
    count: (d) => legacyList(d, 'classes').length,
    unit: ['clase', 'clases'],
  },
  {
    to: '/enfoque',
    label: 'Enfoque',
    icon: Timer,
    description: 'Temporizador Pomodoro y tus horas de concentración',
    count: (d) => legacyList(d, 'focus').filter((f) => f.mode === 'focus').length,
    unit: ['sesión', 'sesiones'],
  },
];
