import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { api } from '../app/api';
import { PageHeader } from '../components/AppShell';
import { ErrorState, Loading } from '../components/States';
import { plural } from '../lib/format';

/**
 * Módulos de productividad de la app anterior. No forman parte de los seis
 * pilares, así que viven aquí: sus datos se conservan intactos en el servidor.
 */
export const LEGACY_GROUPS: Array<{ title: string; modules: Array<{ name: string; keys: string[]; unit: [string, string] }> }> = [
  {
    title: 'Organización',
    modules: [
      { name: 'Agenda y tareas', keys: ['tasks', 'blocks', 'todos', 'subtasks'], unit: ['elemento', 'elementos'] },
      { name: 'Recordatorios y rutinas', keys: ['reminders', 'routines'], unit: ['elemento', 'elementos'] },
      { name: 'Notas', keys: ['notes', 'noteBoxes'], unit: ['nota', 'notas'] },
    ],
  },
  {
    title: 'Trabajo y estudio',
    modules: [
      { name: 'Trabajo', keys: ['workItems'], unit: ['elemento', 'elementos'] },
      { name: 'Contenido e ideas', keys: ['content', 'ideas'], unit: ['elemento', 'elementos'] },
      { name: 'Proyectos y roadmaps', keys: ['projects', 'roadmaps'], unit: ['proyecto', 'proyectos'] },
      { name: 'Materias y horario', keys: ['subjects', 'classes'], unit: ['elemento', 'elementos'] },
      { name: 'Cuadernos', keys: ['notebooks'], unit: ['cuaderno', 'cuadernos'] },
    ],
  },
  {
    title: 'Vida personal',
    modules: [
      { name: 'Finanzas', keys: ['transactions'], unit: ['movimiento', 'movimientos'] },
      { name: 'Metas', keys: ['goals'], unit: ['meta', 'metas'] },
      { name: 'Mascotas', keys: ['pets', 'petCares'], unit: ['registro', 'registros'] },
    ],
  },
];

export function countItems(data: Record<string, unknown>, keys: string[]): number {
  return keys.reduce((n, k) => n + (Array.isArray(data[k]) ? (data[k] as unknown[]).length : 0), 0);
}

export function More() {
  const legacy = useQuery({ queryKey: ['legacy'], queryFn: api.legacy.get, staleTime: 5 * 60_000 });
  const legacyUrl = import.meta.env.VITE_LEGACY_APP_URL;

  return (
    <div className="page page--narrow">
      <PageHeader eyebrow="Más" title="Otras herramientas" />
      <div className="stack-lg">
        <p className="lead">
          Design Your Core se centra en tus seis pilares. Las herramientas de productividad de la app anterior siguen disponibles aquí, con todos tus datos guardados.
        </p>
        {legacyUrl && (
          <div>
            <a className="btn" href={legacyUrl} target="_blank" rel="noopener noreferrer">
              Abrir la app anterior <ExternalLink size={16} aria-hidden="true" />
            </a>
          </div>
        )}
        {legacy.isPending ? (
          <Loading />
        ) : legacy.isError ? (
          <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
        ) : (
          LEGACY_GROUPS.map((g) => (
            <section key={g.title} className="card stack" aria-labelledby={`g-${g.title}`}>
              <h2 id={`g-${g.title}`} className="section-title">
                {g.title}
              </h2>
              <ul className="legacy-list">
                {g.modules.map((m) => {
                  const n = countItems(legacy.data.data, m.keys);
                  return (
                    <li key={m.name}>
                      <span>{m.name}</span>
                      <span className="muted small numeric">{n ? plural(n, m.unit[0], m.unit[1]) : 'Sin datos'}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
        <p className="muted small">¿Quieres una copia de todo? Descárgala desde Perfil › Tus datos.</p>
      </div>
    </div>
  );
}
