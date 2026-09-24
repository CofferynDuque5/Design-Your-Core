import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type as typo } from '../components/ui';
import { useTheme } from './theme';

type Tone = 'info' | 'error';
type Toast = (message: string, opts?: { tone?: Tone }) => void;

const ToastContext = createContext<Toast>(() => undefined);

/** Avisos breves al pie de la pantalla; también se leen con el lector de pantalla. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{ message: string; tone: Tone; id: number } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const show = useCallback<Toast>((message, opts) => {
    setCurrent({ message, tone: opts?.tone ?? 'info', id: Date.now() });
    AccessibilityInfo.announceForAccessibility(message);
  }, []);

  useEffect(() => {
    if (!current) return;
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: false }).start();
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: false }).start(() => setCurrent((c) => (c?.id === current.id ? null : c)));
    }, current.tone === 'error' ? 5000 : 3000);
    return () => clearTimeout(t);
  }, [current, opacity]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {current && (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            { opacity, bottom: insets.bottom + 72, backgroundColor: current.tone === 'error' ? colors.danger : colors.ink },
          ]}
        >
          <Text style={[typo.small, { color: colors.bg }]}>{current.message}</Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  toast: { position: 'absolute', left: 16, right: 16, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignSelf: 'center', maxWidth: 480 },
});
