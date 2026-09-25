import { ChevronRight, ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import { useLegacyData } from '../app/legacy';
import { TOOLS } from '../app/tools';
import { PageHeader } from '../components/AppShell';
import { ErrorState, Loading } from '../components/States';
import { plural } from '../lib/format';

/**
 * Módulos de la app anterior que aún no están en la app nueva. Sus datos se
 * conservan intactos en el servidor; llegan en las próximas tandas.
 */
export const LEGACY_GROUPS: Array<{ title: string; modules: Array<{ name: string; keys: string[]; unit: [string, string] }> }> = [
  {
    title: 'Organización',
    modules: [
      { name: 'Rutinas', keys: ['routines'], unit: ['rutina', 'rutinas'] },
      { name: 'Notas', keys: ['notes', 'noteBoxes'], unit: ['nota', 'notas'] },
    ],
  },
  {
    title: 'Trabajo y estudio',
    modules: [
      { name: 'Materias', keys: ['subjects'], unit: ['materia', 'materias'] },
      { name: 'Proyectos y roadmaps', keys: ['projects', 'roadmaps'], unit: ['proyecto', 'proyectos'] },
      { name: 'Cuadernos', keys: ['notebooks'], unit: ['cuaderno', 'cuadernos'] },
      { name: 'Contenido e ideas', keys: ['content', 'ideas'], unit: ['elemento', 'elementos'] },
      { name: 'Trabajo', keys: ['workItems'], unit: ['elemento', 'elementos'] },
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
  const legacy = useLegacyData();
  const legacyUrl = import.meta.env.VITE_LEGACY_APP_URL;

  return (
    <div className="page page--narrow">
      <PageHeader eyebrow="Más" title="Otras herramientas" />
      <div className="stack-lg">
        <p className="lead">Design Your Core se centra en tus seis pilares. Aquí tienes las herramientas de productividad de la app anterior, con todos tus datos.</p>
        {legacy.isPending ? (
          <Loading />
        ) : legacy.isError ? (
          <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
        ) : (
          <>
            <section className="stack" aria-labelledby="tools-title">
              <h2 id="tools-title" className="section-title">
                Herramientas
              </h2>
              <ul className="tool-links">
                {TOOLS.map(({ to, label, icon: Icon, description, count, unit }) => {
                  const n = count(legacy.data.data);
                  return (
                    <li key={to}>
                      <Link to={to} className="card tool-link">
                        <span className="tool-link__icon" aria-hidden="true">
                          <Icon size={22} strokeWidth={1.75} />
                        </span>
                        <span className="tool-link__text">
                          <strong>{label}</strong>
                          <span className="muted small">{description}</span>
                        </span>
                        <span className="muted small numeric tool-link__count">{n ? plural(n, unit[0], unit[1]) : 'Vacío'}</span>
                        <ChevronRight size={18} aria-hidden="true" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>

            <div className="stack-sm">
              <h2 className="section-title">Llegan pronto</h2>
              <p className="muted">Estas secciones llegarán a la app nueva en las próximas actualizaciones. Mientras tanto siguen en la app anterior, con tus datos guardados.</p>
              {legacyUrl && (
                <div>
                  <a className="btn btn--secondary" href={legacyUrl} target="_blank" rel="noopener noreferrer">
                    Abrir la app anterior <ExternalLink size={16} aria-hidden="true" />
                  </a>
                </div>
              )}
            </div>
            {LEGACY_GROUPS.map((g, i) => (
              <section key={g.title} className="card stack" aria-labelledby={`legacy-group-${i}`}>
                <h3 id={`legacy-group-${i}`} className="section-title">
                  {g.title}
                </h3>
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
            ))}
          </>
        )}
        <p className="muted small">¿Quieres una copia de todo? Descárgala desde Perfil › Tus datos.</p>
      </div>
    </div>
  );
}
