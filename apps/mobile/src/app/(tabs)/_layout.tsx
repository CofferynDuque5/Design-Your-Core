import { Tabs } from 'expo-router';
import { ChartNoAxesColumn, Flag, House, LayoutGrid, ListChecks, UserRound } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts } from '../../components/ui';
import { useTheme } from '../../lib/theme';

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.inkMuted,
        // Algo más alta que la de serie (49): las etiquetas de 12 px no caben en ella.
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, height: 58 + insets.bottom },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Hoy', tabBarIcon: ({ color }) => <House color={color} size={22} strokeWidth={1.75} /> }} />
      <Tabs.Screen name="progreso" options={{ title: 'Progreso', tabBarIcon: ({ color }) => <ChartNoAxesColumn color={color} size={22} strokeWidth={1.75} /> }} />
      <Tabs.Screen name="retos" options={{ title: 'Retos', tabBarIcon: ({ color }) => <Flag color={color} size={22} strokeWidth={1.75} /> }} />
      <Tabs.Screen name="habitos" options={{ title: 'Hábitos', tabBarIcon: ({ color }) => <ListChecks color={color} size={22} strokeWidth={1.75} /> }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil', tabBarIcon: ({ color }) => <UserRound color={color} size={22} strokeWidth={1.75} /> }} />
      <Tabs.Screen name="mas" options={{ title: 'Más', tabBarIcon: ({ color }) => <LayoutGrid color={color} size={22} strokeWidth={1.75} /> }} />
    </Tabs>
  );
}
