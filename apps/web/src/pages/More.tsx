import { toolStatus } from '@dyc/core';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { useLegacyData } from '../app/legacy';
import { useSession } from '../app/session';
import { TOOL_GROUPS, TOOLS } from '../app/tools';
import { PageHeader } from '../components/AppShell';
import { ErrorState, Loading } from '../components/States';

export function More() {
  const legacy = useLegacyData();
  const { user } = useSession();

  return (
    <div className="page page--narrow">
      <PageHeader eyebrow="Más" title="Otras herramientas" />
      <div className="stack-lg">
        <p className="lead">Design Your Core se centra en tus seis pilares. Aquí tienes el resto de herramientas, con lo que llevas en cada una.</p>
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
                    {TOOLS.filter((t) => t.group === g.id).map((tool) => {
                      const { to, label, icon: Icon, description, optIn } = tool;
                      const status = toolStatus(tool, legacy.data.data);
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
          </>
        )}
        <p className="muted small">¿Quieres una copia de todo? Descárgala desde Perfil › Tus datos.</p>
      </div>
    </div>
  );
}
