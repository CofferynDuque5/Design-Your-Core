import { BarChart3, CheckSquare, ChevronDown, Flag, LayoutGrid, Sun, User } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { useUnsavedGuard } from '../app/legacy';
import { useSession } from '../app/session';
import { TOOL_GROUPS, TOOLS, type ToolGroup } from '../app/tools';
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

const GROUPS_KEY = 'dyc.sidebar.groups';

/**
 * Subgrupos plegables de la barra lateral. Por defecto solo está abierto el de
 * la página actual; lo que la persona abre o cierra se recuerda en este
 * navegador (si el almacenamiento no está disponible, se usa el defecto).
 */
function useToolGroups(pathname: string) {
  const [saved, setSaved] = useState<Partial<Record<ToolGroup, boolean>>>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '{}');
      return v && typeof v === 'object' ? v : {};
    } catch {
      return {};
    }
  });
  const active = TOOLS.find((t) => pathname === t.to || pathname.startsWith(`${t.to}/`))?.group;
  const isOpen = (g: ToolGroup) => saved[g] ?? g === active;
  const toggle = useCallback(
    (g: ToolGroup, open: boolean) =>
      setSaved((s) => {
        const next = { ...s, [g]: !open };
        try {
          localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
        } catch {
          /* sin almacenamiento: solo en esta visita */
        }
        return next;
      }),
    [],
  );
  return { isOpen, toggle };
}

export function AppShell() {
  const online = useOnline();
  const location = useLocation();
  const { user } = useSession();
  const groups = useToolGroups(location.pathname);
  useUnsavedGuard();
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
        <nav aria-label="Herramientas" className="sidebar__tools">
          {TOOL_GROUPS.map((g) => {
            const open = groups.isOpen(g.id);
            // Ciclo solo aparece si la persona lo activó (siempre se llega desde Más).
            const tools = TOOLS.filter((t) => t.group === g.id && (!t.optIn || user?.showCycle));
            return (
              <div key={g.id}>
                <button
                  type="button"
                  id={`nav-tools-${g.id}`}
                  className="sidebar__group"
                  aria-expanded={open}
                  aria-controls={open ? `nav-tools-${g.id}-list` : undefined}
                  onClick={() => groups.toggle(g.id, open)}
                >
                  {g.label}
                  <ChevronDown size={16} aria-hidden="true" />
                </button>
                {open && (
                  <ul id={`nav-tools-${g.id}-list`} className="sidebar__nav sidebar__nav--compact" aria-labelledby={`nav-tools-${g.id}`}>
                    {tools.map(({ to, label, icon: Icon }) => (
                      <li key={to}>
                        <NavLink to={to} className="sidebar__link">
                          <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                          {label}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
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
