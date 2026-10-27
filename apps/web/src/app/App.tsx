import { ApiError } from '@dyc/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, useState, type ComponentType, type ReactNode } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { AppShell } from '../components/AppShell';
import { UpdatePrompt } from '../components/UpdatePrompt';
import { Forgot } from '../pages/auth/Forgot';
import { Login } from '../pages/auth/Login';
import { Register } from '../pages/auth/Register';
import { CheckIn } from '../pages/CheckIn';
import { NotFound } from '../pages/NotFound';
import { Onboarding } from '../pages/Onboarding';
import { Today } from '../pages/Today';
import { useProfile } from './queries';
import { SessionProvider, useSession } from './session';
import { ToastProvider } from './toast';

// Cada herramienta se descarga al abrirla por primera vez: la pantalla Hoy, el
// check-in y la entrada van en el paquete inicial; el resto, en trozos aparte.
const page = <K extends string>(name: K, load: () => Promise<Record<K, ComponentType>>) => lazy(() => load().then((m) => ({ default: m[name] })));
const Agenda = page('Agenda', () => import('../pages/Agenda'));
const Assistant = page('Assistant', () => import('../pages/Assistant'));
const Breathe = page('Breathe', () => import('../pages/Breathe'));
const Calendar = page('Calendar', () => import('../pages/Calendar'));
const Challenges = page('Challenges', () => import('../pages/Challenges'));
const Content = page('Content', () => import('../pages/Content'));
const Cycle = page('Cycle', () => import('../pages/Cycle'));
const Exercise = page('Exercise', () => import('../pages/Exercise'));
const Finance = page('Finance', () => import('../pages/Finance'));
const Goals = page('Goals', () => import('../pages/Goals'));
const Journal = page('Journal', () => import('../pages/Journal'));
const Pets = page('Pets', () => import('../pages/Pets'));
const Routine = page('Routine', () => import('../pages/Routine'));
const Sleep = page('Sleep', () => import('../pages/Sleep'));
const Focus = page('Focus', () => import('../pages/Focus'));
const Habits = page('Habits', () => import('../pages/Habits'));
const Ideas = page('Ideas', () => import('../pages/Ideas'));
const More = page('More', () => import('../pages/More'));
const NotebookDetail = page('NotebookDetail', () => import('../pages/Notebooks'));
const Notebooks = page('Notebooks', () => import('../pages/Notebooks'));
const NoteEditor = page('NoteEditor', () => import('../pages/Notes'));
const Notes = page('Notes', () => import('../pages/Notes'));
const Profile = page('Profile', () => import('../pages/Profile'));
const Progress = page('Progress', () => import('../pages/Progress'));
const Projects = page('Projects', () => import('../pages/Projects'));
const Roadmaps = page('Roadmaps', () => import('../pages/Roadmaps'));
const Schedule = page('Schedule', () => import('../pages/Schedule'));
const Subjects = page('Subjects', () => import('../pages/Subjects'));
const Todos = page('Todos', () => import('../pages/Todos'));
const Vault = page('Vault', () => import('../pages/Vault'));
const Work = page('Work', () => import('../pages/Work'));

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Los errores de la API (4xx) no mejoran reintentando; los de red, sí.
        retry: (n, err) => n < 2 && !(err instanceof ApiError && err.status >= 400 && err.status < 500),
        refetchOnWindowFocus: true,
      },
    },
  });
}

function Splash() {
  return (
    <div className="splash" role="status">
      <span className="visually-hidden">Cargando…</span>
    </div>
  );
}

/** Pide sesión; sin onboarding terminado, lleva a la bienvenida. */
function RequireAuth({ children, onboarding = false }: { children: ReactNode; onboarding?: boolean }) {
  const { token, loading, signedOut } = useSession();
  const location = useLocation();
  const profile = useProfile();
  if (!token) return <Navigate to="/entrar" replace state={signedOut ? null : { from: location.pathname + location.search }} />;
  if (loading || profile.isPending) return <Splash />;
  if (profile.data && !profile.data.onboarded && !onboarding) return <Navigate to="/bienvenida" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { token } = useSession();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  if (token) return <Navigate to={from && from !== '/entrar' ? from : '/'} replace />;
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/entrar" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/registro" element={<PublicOnly><Register /></PublicOnly>} />
      <Route path="/recuperar" element={<PublicOnly><Forgot /></PublicOnly>} />
      <Route path="/bienvenida" element={<RequireAuth onboarding><Onboarding /></RequireAuth>} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<Today />} />
        <Route path="check-in" element={<CheckIn />} />
        <Route path="progreso" element={<Progress />} />
        <Route path="retos" element={<Challenges />} />
        <Route path="habitos" element={<Habits />} />
        <Route path="perfil" element={<Profile />} />
        <Route path="mas" element={<More />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="pendientes" element={<Todos />} />
        <Route path="calendario" element={<Calendar />} />
        <Route path="horario" element={<Schedule />} />
        <Route path="enfoque" element={<Focus />} />
        <Route path="materias" element={<Subjects />} />
        <Route path="proyectos" element={<Projects />} />
        <Route path="roadmaps" element={<Roadmaps />} />
        <Route path="cuadernos" element={<Notebooks />} />
        <Route path="cuadernos/:id" element={<NotebookDetail />} />
        <Route path="contenido" element={<Content />} />
        <Route path="ideas" element={<Ideas />} />
        <Route path="finanzas" element={<Finance />} />
        <Route path="metas" element={<Goals />} />
        <Route path="mascotas" element={<Pets />} />
        <Route path="ciclo" element={<Cycle />} />
        <Route path="ejercicio" element={<Exercise />} />
        <Route path="sueno" element={<Sleep />} />
        <Route path="diario" element={<Journal />} />
        <Route path="rutina" element={<Routine />} />
        <Route path="notas" element={<Notes />} />
        <Route path="notas/:id" element={<NoteEditor />} />
        <Route path="boveda" element={<Vault />} />
        <Route path="asistente" element={<Assistant />} />
        <Route path="trabajo" element={<Work />} />
        <Route path="respiracion" element={<Breathe />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export function Providers({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const [qc] = useState(() => client ?? makeQueryClient());
  return (
    <QueryClientProvider client={qc}>
      <SessionProvider>
        <ToastProvider>{children}</ToastProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}

// La versión de prueba es un solo archivo HTML servido en cualquier ruta: las rutas van tras «#».
const Router = import.meta.env.VITE_DEMO ? HashRouter : BrowserRouter;

export function App() {
  return (
    <Providers>
      <Router>
        <AppRoutes />
        {!import.meta.env.VITE_DEMO && <UpdatePrompt />}
      </Router>
    </Providers>
  );
}
