import { Stack } from 'expo-router';
import { useTheme } from '../../lib/theme';

/** Herramientas de la app anterior: se abren desde «Más» encima de las pestañas. */
export default function ToolsLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
