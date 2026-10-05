import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, type as typo } from '../components/ui';
import { useTheme } from './theme';

type Tone = 'info' | 'error';
/** Acción opcional del aviso («Deshacer», «Ver horario»): se toca una vez y el aviso se va. */
type ToastAction = { label: string; run: () => void };
type Toast = (message: string, opts?: { tone?: Tone; action?: ToastAction }) => void;

const ToastContext = createContext<Toast>(() => undefined);

/** Avisos breves al pie de la pantalla; también se leen con el lector de pantalla. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{ message: string; tone: Tone; id: number; action?: ToastAction } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const show = useCallback<Toast>((message, opts) => {
    setCurrent({ message, tone: opts?.tone ?? 'info', id: Date.now(), action: opts?.action });
    AccessibilityInfo.announceForAccessibility(opts?.action ? `${message} ${opts.action.label} disponible.` : message);
  }, []);

  useEffect(() => {
    if (!current) return;
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: false }).start();
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: false }).start(() => setCurrent((c) => (c?.id === current.id ? null : c)));
      // Con acción, más tiempo para alcanzarla.
    }, current.action ? 6000 : current.tone === 'error' ? 5000 : 3000);
    return () => clearTimeout(t);
  }, [current, opacity]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {current && (
        <Animated.View
          pointerEvents={current.action ? 'box-none' : 'none'}
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            { opacity, bottom: insets.bottom + 72, backgroundColor: current.tone === 'error' ? colors.danger : colors.ink },
          ]}
        >
          <View style={styles.row} pointerEvents="box-none">
            <Text style={[typo.small, { color: colors.bg, flex: 1 }]}>{current.message}</Text>
            {current.action && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={current.action.label}
                hitSlop={8}
                onPress={() => {
                  const run = current.action?.run;
                  setCurrent(null);
                  run?.();
                }}
                style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}
              >
                <Text style={[typo.small, { color: colors.bg, fontFamily: fonts.semibold, textDecorationLine: 'underline' }]}>{current.action.label}</Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  toast: { position: 'absolute', left: 16, right: 16, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignSelf: 'center', maxWidth: 480 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  action: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 4 },
});
