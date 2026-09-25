import { ApiError } from '@dyc/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { AppShell } from '../components/AppShell';
import { UpdatePrompt } from '../components/UpdatePrompt';
import { Forgot } from '../pages/auth/Forgot';
import { Login } from '../pages/auth/Login';
import { Register } from '../pages/auth/Register';
import { Agenda } from '../pages/Agenda';
import { Breathe } from '../pages/Breathe';
import { Calendar } from '../pages/Calendar';
import { CheckIn } from '../pages/CheckIn';
import { Challenges } from '../pages/Challenges';
import { Content } from '../pages/Content';
import { Cycle } from '../pages/Cycle';
import { Exercise } from '../pages/Exercise';
import { Finance } from '../pages/Finance';
import { Goals } from '../pages/Goals';
import { Journal } from '../pages/Journal';
import { Pets } from '../pages/Pets';
import { Routine } from '../pages/Routine';
import { Sleep } from '../pages/Sleep';
import { Focus } from '../pages/Focus';
import { Habits } from '../pages/Habits';
import { Ideas } from '../pages/Ideas';
import { More } from '../pages/More';
import { NotebookDetail, Notebooks } from '../pages/Notebooks';
import { NoteEditor, Notes } from '../pages/Notes';
import { NotFound } from '../pages/NotFound';
import { Onboarding } from '../pages/Onboarding';
import { Profile } from '../pages/Profile';
import { Progress } from '../pages/Progress';
import { Projects } from '../pages/Projects';
import { Roadmaps } from '../pages/Roadmaps';
import { Schedule } from '../pages/Schedule';
import { Subjects } from '../pages/Subjects';
import { Today } from '../pages/Today';
import { Todos } from '../pages/Todos';
import { Vault } from '../pages/Vault';
import { Work } from '../pages/Work';
import { useProfile } from './queries';
import { SessionProvider, useSession } from './session';
import { ToastProvider } from './toast';

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

export function App() {
  return (
    <Providers>
      <BrowserRouter>
        <AppRoutes />
        <UpdatePrompt />
      </BrowserRouter>
    </Providers>
  );
}
