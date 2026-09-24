import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, auth } from './api';
import { forgetDevice } from './notifications';

/** Cierra la sesión en la API (y en este dispositivo aunque no haya red). */
export function useSignOut() {
  const qc = useQueryClient();
  return useCallback(async () => {
    await forgetDevice().catch(() => undefined);
    const refreshToken = auth.refreshToken();
    if (refreshToken) await api.session.logout(refreshToken).catch(() => undefined);
    await auth.signOut();
    qc.clear();
  }, [qc]);
}
