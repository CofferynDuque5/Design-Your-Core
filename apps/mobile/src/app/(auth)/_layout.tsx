import { Stack } from 'expo-router';
import { useTheme } from '../../lib/theme';

export const unstable_settings = { initialRouteName: 'entrar' };

export default function AuthLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
