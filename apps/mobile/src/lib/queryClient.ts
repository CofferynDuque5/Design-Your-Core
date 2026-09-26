import { ApiError } from '@dyc/api-client';
import { QueryClient } from '@tanstack/react-query';

/** Caché de datos de toda la app (las pruebas la vacían entre casos). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Solo se reintenta si no hubo conexión; un 4xx no cambia por insistir.
      retry: (n, err) => n < 2 && err instanceof ApiError && err.isNetwork,
    },
  },
});
