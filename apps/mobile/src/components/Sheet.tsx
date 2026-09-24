import { radius, space } from '@dyc/tokens';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';
import { T } from './ui';

/** Hoja inferior para confirmar o editar algo sin salir de la pantalla. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar" />
        <View style={{ flex: 1 }} pointerEvents="box-none" />
        <View
          accessibilityViewIsModal
          style={[styles.panel, { backgroundColor: colors.surfaceRaised, paddingBottom: insets.bottom + space[5] }]}
        >
          <View style={[styles.handle, { backgroundColor: colors.lineStrong }]} />
          <T v="title" accessibilityRole="header">
            {title}
          </T>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  panel: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space[5], gap: space[4], width: '100%', maxWidth: 640, alignSelf: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: -space[2] },
});
