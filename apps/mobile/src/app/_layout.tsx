// Una importación por peso: el índice del paquete arrastraría todas las variantes.
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Newsreader_400Regular } from '@expo-google-fonts/newsreader/400Regular';
import { Newsreader_400Regular_Italic } from '@expo-google-fonts/newsreader/400Regular_Italic';
import { ApiError } from '@dyc/api-client';
import { focusManager, QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { auth, useAuth } from '../lib/api';
import { notificationsSupported } from '../lib/notifications';
import { useProfile } from '../lib/queries';
import { ThemeProvider, useTheme } from '../lib/theme';
import { ToastProvider } from '../lib/toast';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
auth.load();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Solo se reintenta si no hubo conexión; un 4xx no cambia por insistir.
      retry: (n, err) => n < 2 && err instanceof ApiError && err.isNetwork,
    },
  },
});

// Al volver a la app, los datos se refrescan como al enfocar una pestaña en la web.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Newsreader_400Regular, Newsreader_400Regular_Italic, Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold });
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ToastProvider>
            <Root fontsReady={fontsLoaded || !!fontError} />
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function Root({ fontsReady }: { fontsReady: boolean }) {
  const session = useAuth();
  const profile = useProfile();
  const qc = useQueryClient();
  const { name, colors } = useTheme();
  const signedIn = session.status === 'signedIn';

  // Al salir no queda nada de la persona anterior en caché.
  useEffect(() => {
    if (session.status === 'signedOut') qc.clear();
  }, [session.status, qc]);

  const ready = fontsReady && session.status !== 'loading' && (!signedIn || !profile.isPending);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
  if (!ready) return null;

  // Sin conexión el perfil puede fallar: se entra igual y cada pantalla muestra su estado.
  const onboarded = profile.data?.onboarded ?? true;

  return (
    <>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      {signedIn && notificationsSupported && <NotificationLinks />}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="bienvenida" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(herramientas)" />
          <Stack.Screen name="check-in" options={{ presentation: 'modal' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

/** Tocar el recordatorio abre la pantalla que indica (el check-in). */
function NotificationLinks() {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const url = response?.notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) router.push(url as '/check-in');
  }, [response, router]);
  return null;
}
