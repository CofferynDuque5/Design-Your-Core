import { COLOR_NAMES } from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { useRouter } from 'expo-router';
import { Check, ChevronLeft, Minus, Plus } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../lib/theme';
import { Card, PageHeader, Screen, T, fonts } from './ui';

// Piezas comunes de las herramientas de la app anterior en el móvil
// (Agenda, Pendientes, Calendario, Horario y Enfoque).

/** Pantalla de una herramienta: vuelve a «Más» y lleva la cabecera editorial de siempre. */
export function ToolScreen({
  title,
  right,
  children,
  refreshing,
  onRefresh,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} edges={['top', 'bottom']}>
      <View style={{ gap: space[2] }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver a Más"
          onPress={() => (router.canGoBack() ? router.back() : router.navigate('/mas'))}
          hitSlop={4}
          style={({ pressed }) => [s.back, pressed && { opacity: 0.7 }]}
        >
          <ChevronLeft size={20} color={colors.primary} />
          <T v="label" tint="primary">
            Más
          </T>
        </Pressable>
        <PageHeader eyebrow="Herramientas" title={title} right={right} />
      </View>
      {children}
    </Screen>
  );
}

/** Botón de solo icono con objetivo táctil de 44 pt y nombre para lectores de pantalla. */
export function IconButton({ label, onPress, disabled, children, style }: { label: string; onPress: () => void; disabled?: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.iconBtn, { opacity: disabled ? 0.35 : pressed ? 0.6 : 1 }, style]}
    >
      {children}
    </Pressable>
  );
}

/** Mezcla opaca de un color con el fondo (`amount` de 0 a 1): los fondos suaves no dejan ver lo que hay detrás. */
export function tint(hex: string, over: string, amount: number): string {
  const parse = (h: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
    const n = m ? parseInt(m[1], 16) : 0x888888;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const a = parse(hex);
  const b = parse(over);
  return `#${a.map((v, i) => Math.round(v * amount + b[i] * (1 - amount)).toString(16).padStart(2, '0')).join('')}`;
}

/** Punto de color (tipo de bloque, prioridad, evento). */
export function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

/** Casilla grande con su texto; toda la fila es el objetivo táctil. */
export function CheckRow({ title, done, onToggle, meta, color, trailing }: { title: string; done: boolean; onToggle: () => void; meta?: string; color?: string; trailing?: ReactNode }) {
  const { colors } = useTheme();
  const tone = color ?? colors.primary;
  return (
    <View style={s.checkRow}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={title}
        accessibilityHint={meta}
        onPress={onToggle}
        style={({ pressed }) => [s.checkHit, pressed && { opacity: 0.7 }]}
      >
        <View style={[s.box, { borderColor: done ? tone : colors.lineStrong, backgroundColor: done ? tone : 'transparent' }]}>{done && <Check size={16} strokeWidth={2.5} color={colors.surface} />}</View>
        <View style={{ flex: 1 }}>
          <T v="body" tint={done ? 'muted' : 'ink'} style={done && { textDecorationLine: 'line-through' }}>
            {title}
          </T>
          {meta ? (
            <T v="small" tint="subtle">
              {meta}
            </T>
          ) : null}
        </View>
      </Pressable>
      {trailing}
    </View>
  );
}

/**
 * Valor con botones de menos y más (horas, duraciones, día del mes). Sin
 * selectores nativos: funciona igual en iOS, Android y la vista web.
 */
export function Stepper({
  label,
  value,
  onDec,
  onInc,
  decDisabled,
  incDisabled,
  decLabel,
  incLabel,
  error,
  hint,
}: {
  label: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
  decDisabled?: boolean;
  incDisabled?: boolean;
  decLabel: string;
  incLabel: string;
  error?: string | null;
  hint?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space[1], flex: 1 }}>
      <T v="label">{label}</T>
      <View style={[s.stepper, { borderColor: error ? colors.danger : colors.lineStrong, backgroundColor: colors.surface }]}>
        <IconButton label={decLabel} onPress={onDec} disabled={decDisabled}>
          <Minus size={18} color={colors.primary} />
        </IconButton>
        <T v="label" accessibilityLabel={`${label}: ${value}`} style={{ flex: 1, textAlign: 'center', fontFamily: fonts.semibold, fontVariant: ['tabular-nums'] }}>
          {value}
        </T>
        <IconButton label={incLabel} onPress={onInc} disabled={incDisabled}>
          <Plus size={18} color={colors.primary} />
        </IconButton>
      </View>
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
}

/** Paleta de colores como grupo de opciones, con el nombre de cada color para lectores. */
export function ColorSwatches({ legend, colors: palette, value, onChange }: { legend: string; colors: readonly string[]; value: string; onChange: (c: string) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space[2] }}>
      <T v="label">{legend}</T>
      <View accessibilityRole="radiogroup" accessibilityLabel={legend} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {palette.map((c) => {
          const on = c.toLowerCase() === value.toLowerCase();
          return (
            <Pressable
              key={c}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={COLOR_NAMES[c.toUpperCase()] ?? COLOR_NAMES[c] ?? c}
              onPress={() => onChange(c)}
              style={[s.swatch, { borderColor: on ? colors.ink : 'transparent' }]}
            >
              <View style={[s.swatchInner, { backgroundColor: c }]}>{on && <Check size={16} strokeWidth={3} color="#FFFFFF" />}</View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Opciones de una sola elección como fichas con punto de color (tipo, prioridad). */
export function DotChoices<V extends string>({ legend, options, value, onChange }: { legend: string; options: Array<{ value: V; label: string; color: string }>; value: V; onChange: (v: V) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space[2] }}>
      <T v="label">{legend}</T>
      <View accessibilityRole="radiogroup" accessibilityLabel={legend} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={o.label}
              onPress={() => onChange(o.value)}
              style={[s.dotChip, { borderColor: on ? o.color : colors.lineStrong, backgroundColor: on ? `${o.color}1F` : colors.surface }]}
            >
              <Dot color={o.color} />
              <T v="small" style={{ fontFamily: fonts.medium, color: on ? colors.ink : colors.inkMuted }}>
                {o.label}
              </T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Cifras de cabecera en dos columnas. */
export function Stats({ items }: { items: Array<{ value: string; label: string }> }) {
  return (
    <View style={s.stats}>
      {items.map((it) => (
        <Card key={it.label} style={s.stat}>
          <View accessible accessibilityLabel={`${it.label}: ${it.value}`}>
            <T v="title" style={{ fontVariant: ['tabular-nums'] }}>
              {it.value}
            </T>
            <T v="small" tint="muted">
              {it.label}
            </T>
          </View>
        </Card>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: touchTarget, alignSelf: 'flex-start', marginLeft: -space[1], paddingRight: space[3] },
  iconBtn: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  checkHit: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: touchTarget + 4, paddingVertical: space[1] },
  box: { width: 26, height: 26, borderRadius: radius.sm, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, minHeight: touchTarget + 4 },
  swatch: { width: touchTarget, height: touchTarget, borderRadius: touchTarget / 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatchInner: { width: touchTarget - 10, height: touchTarget - 10, borderRadius: (touchTarget - 10) / 2, alignItems: 'center', justifyContent: 'center' },
  dotChip: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: touchTarget, paddingHorizontal: space[3], borderRadius: radius.pill, borderWidth: 1 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  stat: { flexGrow: 1, flexBasis: '45%', gap: space[1] },
});
