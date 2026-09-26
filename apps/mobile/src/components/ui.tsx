import { ApiError } from '@dyc/api-client';
import { radius, space, touchTarget } from '@dyc/tokens';
import { CloudOff, RotateCw } from 'lucide-react-native';
import { forwardRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';

/** Familias cargadas con expo-font (cada peso es una familia en React Native). */
export const fonts = {
  display: 'Newsreader_400Regular',
  displayItalic: 'Newsreader_400Regular_Italic',
  regular: 'Figtree_400Regular',
  medium: 'Figtree_500Medium',
  semibold: 'Figtree_600SemiBold',
} as const;

export const type = StyleSheet.create({
  display: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.6 },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  lead: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 26 },
  label: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 20 },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  eyebrow: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 1, textTransform: 'uppercase' },
  number: { fontFamily: fonts.semibold, fontVariant: ['tabular-nums'] },
});

type Variant = keyof typeof type;
type Tint = 'ink' | 'muted' | 'subtle' | 'primary' | 'danger' | 'onPrimary';

export function T({ v = 'body', tint = 'ink', style, children, ...rest }: { v?: Variant; tint?: Tint; style?: StyleProp<TextStyle>; children: ReactNode } & Omit<React.ComponentProps<typeof Text>, 'style'>) {
  const { colors } = useTheme();
  const c = { ink: colors.ink, muted: colors.inkMuted, subtle: colors.inkSubtle, primary: colors.primary, danger: colors.danger, onPrimary: colors.onPrimary }[tint];
  return (
    <Text style={[type[v], { color: c }, style]} maxFontSizeMultiplier={1.6} {...rest}>
      {children}
    </Text>
  );
}

/** Pantalla con desplazamiento, márgenes y "tirar para actualizar". */
export function Screen({
  children,
  refreshing,
  onRefresh,
  edges = ['top'],
  contentStyle,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: Array<'top' | 'bottom'>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={[styles.screen, contentStyle]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.inkMuted} /> : undefined}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function PageHeader({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1, gap: space[1] }}>
        {eyebrow && (
          <T v="eyebrow" tint="muted">
            {eyebrow}
          </T>
        )}
        <T v="title" accessibilityRole="header">
          {title}
        </T>
      </View>
      {right}
    </View>
  );
}

export function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <T v="heading" accessibilityRole="header">
        {title}
      </T>
      {right}
    </View>
  );
}

export function Card({ children, style, tone = 'plain' }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'plain' | 'accent' | 'sunken' }) {
  const { colors } = useTheme();
  const bg = tone === 'accent' ? colors.sandSoft : tone === 'sunken' ? colors.surfaceSunken : colors.surface;
  return <View style={[styles.card, { backgroundColor: bg, borderColor: tone === 'plain' ? colors.line : 'transparent' }, style]}>{children}</View>;
}

/** `link`: solo texto, sin relleno lateral (acciones secundarias junto a títulos). */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'link' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  icon,
  small,
  accessibilityHint,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  icon?: ReactNode;
  small?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
    secondary: { bg: colors.surface, fg: colors.primary, border: colors.lineStrong },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
    link: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
    danger: { bg: colors.danger, fg: colors.bg, border: colors.danger },
  };
  const p = palette[variant];
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      accessibilityHint={accessibilityHint}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        variant === 'link' && styles.buttonLink,
        { backgroundColor: p.bg, borderColor: p.border, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={p.fg} /> : icon}
      <Text style={[type.label, { color: p.fg }]} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
    </Pressable>
  );
}

export const Field = forwardRef<TextInput, { label: string; hint?: string; error?: string | null } & TextInputProps>(function Field({ label, hint, error, style, ...rest }, ref) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space[1] }}>
      <T v="label">{label}</T>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={colors.inkSubtle}
        style={[
          type.body,
          styles.input,
          { color: colors.ink, backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.lineStrong },
          rest.multiline && { minHeight: 88, textAlignVertical: 'top' },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <T v="small" tint="danger" accessibilityLiveRegion="polite">
          {error}
        </T>
      ) : hint ? (
        <T v="small" tint="muted">
          {hint}
        </T>
      ) : null}
    </View>
  );
});

/** Escala de 1 a 5 como grupo de opciones. Tocar la elegida la quita. */
export function Scale({ legend, value, onChange, low, high }: { legend: string; value: number | null | undefined; onChange: (v: number | null) => void; low: string; high: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space[2] }} accessibilityRole="radiogroup" accessibilityLabel={legend}>
      <T v="label">{legend}</T>
      <View style={styles.scale}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value === n;
          const label = `${n}${n === 1 ? `, ${low}` : n === 5 ? `, ${high}` : ''}`;
          return (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={label}
              onPress={() => onChange(on ? null : n)}
              style={[styles.scaleItem, { borderColor: on ? colors.primary : colors.lineStrong, backgroundColor: on ? colors.primary : colors.surface }]}
            >
              <Text style={[type.label, type.number, { color: on ? colors.onPrimary : colors.ink }]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.scaleEnds} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <T v="small" tint="muted">
          {low}
        </T>
        <T v="small" tint="muted">
          {high}
        </T>
      </View>
    </View>
  );
}

export function Segmented<V extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: V;
  /** `a11yLabel`: nombre completo para lectores cuando la etiqueta visible es corta. */
  options: Array<{ value: V; label: string; a11yLabel?: string }>;
  onChange: (v: V) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.segmented, { backgroundColor: colors.surfaceSunken }, disabled && { opacity: 0.55 }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: !!disabled }}
            accessibilityLabel={o.a11yLabel}
            disabled={disabled}
            onPress={() => onChange(o.value)}
            style={[styles.segment, on && { backgroundColor: colors.surface, borderColor: colors.line }]}
          >
            <Text style={[type.label, { color: on ? colors.ink : colors.inkMuted }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, selected, onPress, color: accent }: { label: string; selected: boolean; onPress: () => void; color?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, { borderColor: selected ? (accent ?? colors.primary) : colors.lineStrong, backgroundColor: selected ? colors.primarySoft : colors.surface }]}
    >
      <Text style={[type.small, { fontFamily: fonts.medium, color: selected ? (accent ?? colors.primary) : colors.inkMuted }]}>{label}</Text>
    </Pressable>
  );
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Algo salió mal. Inténtalo de nuevo.';
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.empty, { borderColor: colors.lineStrong }]}>
      <T v="heading">{title}</T>
      {children && (
        <T v="small" tint="muted" style={{ textAlign: 'center' }}>
          {children}
        </T>
      )}
      {action}
    </View>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const { colors } = useTheme();
  const offline = error instanceof ApiError && error.isNetwork;
  return (
    <View style={[styles.empty, { borderColor: colors.lineStrong }]} accessibilityRole="alert">
      {offline && <CloudOff size={24} color={colors.inkMuted} />}
      <T v="heading">{offline ? 'Sin conexión' : 'No se pudo cargar'}</T>
      <T v="small" tint="muted" style={{ textAlign: 'center' }}>
        {errorMessage(error)}
      </T>
      {retry && <Button small variant="secondary" label="Reintentar" icon={<RotateCw size={16} color={colors.primary} />} onPress={retry} />}
    </View>
  );
}

/** Bloques con la forma aproximada del contenido mientras carga. */
export function Loading({ label = 'Cargando' }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <Card>
      <View accessible accessibilityLabel={`${label}…`} accessibilityState={{ busy: true }} style={{ gap: space[2] }}>
        {[100, 88, 76].map((w) => (
          <View key={w} style={{ height: 18, width: `${w}%`, borderRadius: radius.xs, backgroundColor: colors.surfaceSunken }} />
        ))}
      </View>
    </Card>
  );
}

export const styles = StyleSheet.create({
  screen: { padding: space[5], paddingBottom: space[12], gap: space[6], width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: space[3], paddingTop: space[2] },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space[4], gap: space[3] },
  button: {
    minHeight: touchTarget + 4,
    paddingHorizontal: space[5],
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
  },
  buttonSmall: { minHeight: touchTarget, paddingHorizontal: space[4] },
  buttonLink: { paddingHorizontal: 0 },
  input: { minHeight: touchTarget + 4, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space[3], paddingVertical: space[2] },
  scale: { flexDirection: 'row', gap: space[2] },
  scaleItem: { flex: 1, minHeight: touchTarget, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  scaleEnds: { flexDirection: 'row', justifyContent: 'space-between' },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 3, gap: 3 },
  segment: { flex: 1, minHeight: touchTarget - 4, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent', paddingHorizontal: space[2] },
  chip: { minHeight: 36, paddingHorizontal: space[3], borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.lg, padding: space[5], alignItems: 'center', gap: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
});
