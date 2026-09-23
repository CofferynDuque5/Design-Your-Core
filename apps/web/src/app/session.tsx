import type { Session, User } from '@dyc/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { api, tokenStore } from './api';

interface SessionValue {
  token: string | null;
  user: User | null;
  /** true mientras se comprueba un token guardado. */
  loading: boolean;
  signIn: (s: Session) => void;
  signOut: () => void;
  /** true tras cerrar sesión a propósito: la próxima entrada empieza en Hoy. */
  signedOut: boolean;
  /** Sustituye el token (tras cambiar la contraseña o cerrar otras sesiones). */
  replaceToken: (token: string) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const token = useSyncExternalStore(tokenStore.subscribe, tokenStore.get);
  const [signedOut, setSignedOut] = useState(false);

  const me = useQuery({
    queryKey: ['me', token],
    queryFn: api.auth.me,
    enabled: !!token,
    staleTime: Infinity,
    retry: (n, err) => n < 2 && (err as { isNetwork?: boolean }).isNetwork === true,
  });

  // Al salir (o si la API invalida el token) no queda nada de la persona anterior en caché.
  useEffect(() => {
    if (!token) qc.clear();
  }, [token, qc]);

  const signIn = useCallback(
    (s: Session) => {
      qc.clear();
      setSignedOut(false);
      qc.setQueryData(['me', s.token], s.user);
      tokenStore.set(s.token);
    },
    [qc],
  );
  const signOut = useCallback(() => {
    setSignedOut(true);
    tokenStore.set(null);
  }, []);
  const replaceToken = useCallback(
    (t: string) => {
      const user = qc.getQueryData<User>(['me', tokenStore.get()]);
      if (user) qc.setQueryData(['me', t], user);
      tokenStore.set(t);
    },
    [qc],
  );

  const value = useMemo<SessionValue>(
    () => ({ token, user: me.data ?? null, loading: !!token && me.isPending, signIn, signOut, signedOut, replaceToken }),
    [token, me.data, me.isPending, signIn, signOut, signedOut, replaceToken],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession fuera de SessionProvider');
  return v;
}
