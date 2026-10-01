import { TOOL_CATALOG, type ToolId, type ToolInfo } from '@dyc/core';
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
} from 'lucide-react';

// El catálogo (grupos, textos y cuentas) está en @dyc/core y lo comparte la app móvil.
export { TOOL_GROUPS, type ToolGroup } from '@dyc/core';

export interface Tool extends ToolInfo {
  to: string;
  icon: LucideIcon;
}

/** Iconos de Lucide de cada sección (los mismos que usa la app móvil). */
const ICONS: Record<ToolId, LucideIcon> = {
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

/** Todas las secciones de la app anterior, reconstruidas en la app nueva (tandas 1 a 4). */
export const TOOLS: Tool[] = TOOL_CATALOG.map((t) => ({ ...t, to: t.path, icon: ICONS[t.id] }));
