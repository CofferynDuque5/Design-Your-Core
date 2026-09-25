import { ChevronRight, ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import { useLegacyData } from '../app/legacy';
import { useSession } from '../app/session';
import { TOOL_GROUPS, TOOLS } from '../app/tools';
import { PageHeader } from '../components/AppShell';
import { ErrorState, Loading } from '../components/States';
import { plural } from '../lib/format';

export function More() {
  const legacy = useLegacyData();
  const { user } = useSession();
  const legacyUrl = import.meta.env.VITE_LEGACY_APP_URL;

  return (
    <div className="page page--narrow">
      <PageHeader eyebrow="Más" title="Otras herramientas" />
      <div className="stack-lg">
        <p className="lead">Design Your Core se centra en tus seis pilares. Aquí tienes todas las herramientas de la app anterior, con tus datos, agrupadas como en el menú.</p>
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
              {TOOL_GROUPS.map((g) => (
                <div key={g.id} className="stack-sm">
                  <h3 id={`tools-${g.id}`} className="group-title">
                    {g.label}
                  </h3>
                  <ul className="tool-links" aria-labelledby={`tools-${g.id}`}>
                    {TOOLS.filter((t) => t.group === g.id).map(({ to, label, icon: Icon, description, count, unit, note, optIn }) => {
                      const n = count ? count(legacy.data.data) : 0;
                      const status = count && unit ? (n ? plural(n, unit[0], unit[1]) : 'Vacío') : (note ?? '');
                      return (
                        <li key={to}>
                          <Link to={to} className="card tool-link">
                            <span className="tool-link__icon" aria-hidden="true">
                              <Icon size={22} strokeWidth={1.75} />
                            </span>
                            <span className="tool-link__text">
                              <strong>{label}</strong>
                              <span className="muted small">
                                {description}
                                {optIn && !user?.showCycle && ' · oculto en el menú'}
                              </span>
                            </span>
                            <span className="muted small numeric tool-link__count">{status}</span>
                            <ChevronRight size={18} aria-hidden="true" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </section>

            {legacyUrl && (
              <section className="card stack-sm" aria-labelledby="legacy-app-title">
                <h2 id="legacy-app-title" className="section-title">
                  La app anterior
                </h2>
                <p className="muted">Sigue disponible y usa los mismos datos. Si la tienes abierta a la vez, recárgala para ver lo que cambies aquí.</p>
                <div>
                  <a className="btn btn--secondary" href={legacyUrl} target="_blank" rel="noopener noreferrer">
                    Abrir la app anterior <ExternalLink size={16} aria-hidden="true" />
                  </a>
                </div>
              </section>
            )}
          </>
        )}
        <p className="muted small">¿Quieres una copia de todo? Descárgala desde Perfil › Tus datos.</p>
      </div>
    </div>
  );
}
