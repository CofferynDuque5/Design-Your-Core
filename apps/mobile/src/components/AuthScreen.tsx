import { space } from '@dyc/tokens';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useTheme } from '../lib/theme';
import { Logo } from './Logo';
import { errorMessage, Screen, T } from './ui';

export function AuthScreen({ title, lead, children, footer }: { title: string; lead?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['top', 'bottom']} contentStyle={{ maxWidth: 460, paddingTop: space[10], gap: space[8] }}>
        <Logo />
        <View style={{ gap: space[2] }}>
          <T v="display" accessibilityRole="header">
            {title}
          </T>
          {lead && (
            <T v="lead" tint="muted">
              {lead}
            </T>
          )}
        </View>
        <View style={{ gap: space[4] }}>{children}</View>
        {footer && <View style={{ gap: space[3], alignItems: 'center' }}>{footer}</View>}
      </Screen>
    </KeyboardAvoidingView>
  );
}

export function FormError({ error }: { error: unknown }) {
  const { colors } = useTheme();
  if (!error) return null;
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: colors.dangerSoft, borderRadius: 10, padding: space[3] }}>
      <T v="small" style={{ color: colors.danger }}>
        {errorMessage(error)}
      </T>
    </View>
  );
}
