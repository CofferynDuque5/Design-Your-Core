import { PILLAR_IDS } from '@dyc/core';
import { useEffect, type ReactNode } from 'react';
import { Logo } from '../../components/Logo';
import { pillarShort } from '../../components/Pillar';
import { PillarIcon } from '../../components/PillarIcon';

export function AuthLayout({ title, lead, children, footer }: { title: string; lead?: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Design Your Core`;
  }, [title]);
  return (
    <div className="auth">
      <section className="auth__brand" aria-hidden="true">
        <Logo />
        <div className="auth__quote">
          <p className="display">Pequeños pasos, en lo que de verdad importa.</p>
          <ul className="auth__pillars">
            {PILLAR_IDS.map((p) => (
              <li key={p} data-pillar={p}>
                <PillarIcon pillar={p} size={18} />
                {pillarShort(p)}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <main className="auth__panel" id="main">
        <div className="auth__form">
          <div className="auth__mobile-logo">
            <Logo />
          </div>
          <div className="stack-sm">
            <h1 className="page-title">{title}</h1>
            {lead && <p className="lead">{lead}</p>}
          </div>
          {children}
          {footer && <div className="auth__footer">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
