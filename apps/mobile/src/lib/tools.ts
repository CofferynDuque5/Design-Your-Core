import type { ToolId } from '@dyc/core';
import { useEffect, useState } from 'react';
import {
  AlarmClock,
  BookOpen,
  BriefcaseBusiness,
  CalendarClock,
  CalendarDays,
  Clapperboard,
  Dumbbell,
  Flower2,
  FolderKanban,
  GraduationCap,
  KeyRound,
  Lightbulb,
  ListTodo,
  Moon,
  NotebookPen,
  PawPrint,
  Route,
  School,
  Sparkles,
  StickyNote,
  Target,
  Timer,
  Wallet,
  Wind,
  type LucideIcon,
} from 'lucide-react-native';

/** Los mismos iconos que la web para cada herramienta. */
export const TOOL_ICONS: Record<ToolId, LucideIcon> = {
  agenda: CalendarClock,
  pendientes: ListTodo,
  calendario: CalendarDays,
  horario: School,
  enfoque: Timer,
  materias: GraduationCap,
  proyectos: FolderKanban,
  roadmaps: Route,
  cuadernos: BookOpen,
  contenido: Clapperboard,
  ideas: Lightbulb,
  trabajo: BriefcaseBusiness,
  notas: StickyNote,
  boveda: KeyRound,
  asistente: Sparkles,
  finanzas: Wallet,
  metas: Target,
  mascotas: PawPrint,
  ejercicio: Dumbbell,
  sueno: Moon,
  diario: NotebookPen,
  rutina: AlarmClock,
  respiracion: Wind,
  ciclo: Flower2,
};

/** Herramientas que ya tienen pantalla en el móvil; el resto se abre en la web. */
export const NATIVE_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(['agenda', 'pendientes', 'calendario', 'horario', 'enfoque']);

/** La hora actual, refrescada cada minuto (línea de «ahora», próxima clase). */
export function useNow(every = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}
