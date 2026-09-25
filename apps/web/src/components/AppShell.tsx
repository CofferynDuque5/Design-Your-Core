import { BarChart3, CheckSquare, Flag, LayoutGrid, Sun, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { TOOLS } from '../app/tools';
import { Logo } from './Logo';

const NAV = [
  { to: '/', label: 'Hoy', icon: Sun, end: true },
  { to: '/progreso', label: 'Progreso', icon: BarChart3 },
  { to: '/retos', label: 'Retos', icon: Flag },
  { to: '/habitos', label: 'Hábitos', icon: CheckSquare },
  { to: '/perfil', label: 'Perfil', icon: User },
];

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function AppShell() {
  const online = useOnline();
  const location = useLocation();
  // Los enlaces de invitación de pareja llegan como /?invite=CODIGO.
  const invite = new URLSearchParams(location.search).get('invite');
  if (invite && location.pathname !== '/perfil') return <Navigate to={`/perfil?invite=${encodeURIComponent(invite)}`} replace />;
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>
      <aside className="sidebar">
        <Logo />
        <nav aria-label="Principal">
          <ul className="sidebar__nav">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink to={to} end={end} className="sidebar__link">
                  <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                  {label}
                </NavLink>
              </li>
            ))}
            <li>
              <NavLink to="/mas" className="sidebar__link">
                <LayoutGrid size={20} strokeWidth={1.75} aria-hidden="true" />
                Más
              </NavLink>
            </li>
          </ul>
        </nav>
        <nav aria-labelledby="nav-tools">
          <p id="nav-tools" className="sidebar__group">
            Herramientas
          </p>
          <ul className="sidebar__nav">
            {TOOLS.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink to={to} className="sidebar__link">
                  <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main id="main" className="main" tabIndex={-1}>
        {!online && (
          <div className="alert alert--warning offline-banner" role="status">
            Estás sin conexión. Verás lo último que se cargó; los cambios se podrán guardar cuando vuelvas a tener internet.
          </div>
        )}
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="Principal">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="tabbar__link">
            <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Design Your Core`;
  }, [title]);
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
      </div>
      {children && <div className="page-header__actions">{children}</div>}
    </header>
  );
}
