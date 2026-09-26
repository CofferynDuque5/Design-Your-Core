import type { ToolId } from '@dyc/core';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, Platform, Share } from 'react-native';
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
export const NATIVE_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>([
  'agenda',
  'pendientes',
  'calendario',
  'horario',
  'enfoque',
  'materias',
  'proyectos',
  'roadmaps',
  'cuadernos',
  'contenido',
  'ideas',
  'finanzas',
  'metas',
  'mascotas',
  'ciclo',
  'ejercicio',
  'sueno',
  'diario',
  'rutina',
]);

/** La hora actual, refrescada cada minuto (línea de «ahora», próxima clase). */
export function useNow(every = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}

/**
 * Texto que se guarda solo mientras escribes (con una espera corta, como la
 * app anterior), al salir del campo, al pasar la app a segundo plano y al
 * cerrar la pantalla. Mientras hay cambios sin guardar, lo que llega del
 * servidor no pisa lo que estás escribiendo. Igual que `useAutosave` de la web.
 */
export function useAutosave(value: string, save: (v: string) => void, delay = 600) {
  const [draft, setDraft] = useState(value);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef(save);
  useLayoutEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    if (pending.current === null) setDraft(value);
  }, [value]);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const v = pending.current;
    pending.current = null;
    if (v !== null) saveRef.current(v);
  }, []);
  const change = useCallback(
    (v: string) => {
      setDraft(v);
      pending.current = v;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [delay, flush],
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s !== 'active' && flush());
    return () => {
      sub.remove();
      flush();
    };
  }, [flush]);
  return { draft, change, flush };
}

/**
 * Copiar el texto de una cajita. En la vista web va al portapapeles; en el
 * teléfono se abre la hoja de compartir del sistema, que incluye «Copiar»
 * (React Native ya no trae portapapeles y no se añaden dependencias).
 */
export async function copyOrShare(text: string): Promise<'copied' | 'shared' | 'failed'> {
  try {
    if (Platform.OS === 'web') {
      const clip = (globalThis as { navigator?: { clipboard?: { writeText?: (t: string) => Promise<void> } } }).navigator?.clipboard;
      if (!clip?.writeText) return 'failed';
      await clip.writeText(text);
      return 'copied';
    }
    await Share.share({ message: text });
    return 'shared';
  } catch {
    return 'failed';
  }
}
