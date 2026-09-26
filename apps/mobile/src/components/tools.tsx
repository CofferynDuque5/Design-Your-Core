import { COLOR_NAMES, type LegacyCheckItem } from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { useRouter, type Href } from 'expo-router';
import { Check, ChevronDown, ChevronLeft, ChevronUp, Minus, Plus, Trash2 } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../lib/theme';
import { Button, Card, Field, PageHeader, Screen, T, fonts } from './ui';

// Piezas comunes de las herramientas de la app anterior en el móvil
// (tanda 1: Agenda, Pendientes, Calendario, Horario y Enfoque; tanda 2:
// Materias, Proyectos, Roadmaps, Cuadernos, Contenido e Ideas).

/**
 * Pantalla de una herramienta: vuelve a «Más» (o a donde diga `back`) y
 * lleva la cabecera editorial de siempre. `header` sustituye la cabecera
 * (la portada de un cuaderno).
 */
export function ToolScreen({
  title,
  right,
  children,
  refreshing,
  onRefresh,
  eyebrow = 'Herramientas',
  back = { label: 'Más', href: '/mas' },
  header,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  eyebrow?: string;
  back?: { label: string; href: Href };
  header?: ReactNode;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} edges={['top', 'bottom']}>
      <View style={{ gap: space[2] }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Volver a ${back.label}`}
          onPress={() => (router.canGoBack() ? router.back() : router.navigate(back.href))}
          hitSlop={4}
          style={({ pressed }) => [s.back, pressed && { opacity: 0.7 }]}
        >
          <ChevronLeft size={20} color={colors.primary} />
          <T v="label" tint="primary">
            {back.label}
          </T>
        </Pressable>
        {header ?? <PageHeader eyebrow={eyebrow} title={title} right={right} />}
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

/** Punto de color (tipo de bloque, prioridad, evento). Un color casi negro lleva borde en el tema oscuro (TikTok). */
export function Dot({ color, size = 10 }: { color: string; size?: number }) {
  const { colors, name } = useTheme();
  const ring = name === 'dark' && luminance(color) < 0.08;
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, borderWidth: ring ? 1 : 0, borderColor: colors.inkMuted }} />;
}

/** Luminancia relativa (0 negro, 1 blanco) de un color hex. */
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
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
  const { colors, name } = useTheme();
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
              <View style={[s.swatchInner, { backgroundColor: c }, (name === 'dark' ? luminance(c) < 0.08 : luminance(c) > 0.8) && { borderWidth: 1, borderColor: name === 'dark' ? colors.inkMuted : colors.lineStrong }]}>{on && <Check size={16} strokeWidth={3} color={luminance(c) > 0.6 ? "#1B2230" : "#FFFFFF"} />}</View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Opciones de una sola elección como fichas, con punto de color si lo
 * llevan (tipo, prioridad, plataforma). `a11yLabel`: nombre para lectores
 * cuando la ficha solo muestra un icono o emoji. `hideLegend`: la leyenda
 * solo se lee (el contexto ya la muestra).
 */
export function DotChoices<V extends string>({
  legend,
  options,
  value,
  onChange,
  hideLegend,
}: {
  legend: string;
  options: Array<{ value: V; label: string; color?: string; a11yLabel?: string }>;
  value: V;
  onChange: (v: V) => void;
  hideLegend?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space[2] }}>
      {!hideLegend && <T v="label">{legend}</T>}
      <View accessibilityRole="radiogroup" accessibilityLabel={legend} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {options.map((o) => {
          const on = o.value === value;
          const accent = o.color ?? colors.primary;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={o.a11yLabel ?? o.label}
              onPress={() => onChange(o.value)}
              style={[s.dotChip, { borderColor: on ? accent : colors.lineStrong, backgroundColor: on ? (o.color ? `${o.color}1F` : colors.primarySoft) : colors.surface }]}
            >
              {o.color && <Dot color={o.color} />}
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

/** Cifras de cabecera en dos o tres columnas. */
export function Stats({ items }: { items: Array<{ value: string; label: string }> }) {
  return (
    <View style={s.stats}>
      {items.map((it) => (
        <Card key={it.label} style={[s.stat, items.length === 3 && { flexBasis: '28%', padding: space[3] }]}>
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

// ---------- Tanda 2 ----------

/** Barra de avance con el color del elemento; se lee como «Avance de X, 40 %». */
export function Meter({ value, label, color }: { value: number; label: string; color?: string }) {
  const { colors } = useTheme();
  const v = Math.max(0, Math.min(100, value));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: v, text: `${v} %` }}
      style={[s.meter, { backgroundColor: colors.surfaceSunken }]}
    >
      <View style={{ width: `${v}%`, height: '100%', borderRadius: radius.pill, backgroundColor: color ?? colors.primary }} />
    </View>
  );
}

/** Botón que abre y cierra una lista (temas, hitos) con su cuenta. */
export function Disclosure({ label, count, open, onToggle, a11yLabel }: { label: string; count?: string; open: boolean; onToggle: () => void; a11yLabel: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={a11yLabel}
      onPress={onToggle}
      style={({ pressed }) => [s.disclosure, pressed && { opacity: 0.7 }]}
    >
      <T v="label" tint="primary">
        {label}
      </T>
      {count ? (
        <T v="small" tint="muted" style={{ fontVariant: ['tabular-nums'] }}>
          {count}
        </T>
      ) : null}
      {open ? <ChevronUp size={18} color={colors.primary} /> : <ChevronDown size={18} color={colors.primary} />}
    </Pressable>
  );
}

/**
 * Temas o hitos con casillas. Cada cambio devuelve la lista completa, que se
 * guarda con un PATCH del elemento que la contiene (como la web).
 */
export function CheckList<I extends LegacyCheckItem>({
  items,
  onChange,
  owner,
  noun,
  listLabel,
  placeholder,
  make,
  color,
}: {
  items: I[];
  onChange: (next: I[]) => void;
  /** Nombre del elemento que las contiene, para las etiquetas. */
  owner: string;
  /** "tema", "hito"… */
  noun: string;
  listLabel: string;
  placeholder: string;
  make: (name: string) => I;
  color?: string;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const add = () => {
    if (!name.trim()) return;
    onChange([...items, make(name.trim())]);
    setName('');
  };
  return (
    <View style={[s.checklist, { borderLeftColor: colors.line }]}>
      {items.length > 0 && (
        <View accessibilityLabel={`${listLabel} de «${owner}»`}>
          {items.map((it) => (
            <CheckRow
              key={it.id}
              title={it.name || 'Sin nombre'}
              done={it.done}
              color={color}
              onToggle={() => onChange(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))}
              trailing={
                <IconButton label={`Borrar ${noun} «${it.name}»`} onPress={() => onChange(items.filter((x) => x.id !== it.id))}>
                  <Trash2 size={16} color={colors.inkMuted} />
                </IconButton>
              }
            />
          ))}
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[2] }}>
        <View style={{ flex: 1 }}>
          <Field
            label={`Nuevo ${noun}`}
            accessibilityLabel={`Nuevo ${noun} de «${owner}»`}
            value={name}
            onChangeText={setName}
            maxLength={300}
            placeholder={placeholder}
            returnKeyType="done"
            onSubmitEditing={add}
          />
        </View>
        <Button small variant="secondary" label="Añadir" onPress={add} disabled={!name.trim()} />
      </View>
    </View>
  );
}

/**
 * Guardar y, si se puede, borrar pidiendo confirmación en el mismo sitio
 * (como la web): «Borrar» se cambia por el aviso con «Borrar definitivamente».
 */
export function FormActions({ submitLabel, onSubmit, disabled, onDelete, confirm }: { submitLabel: string; onSubmit: () => void; disabled?: boolean; onDelete?: () => void; confirm?: string }) {
  const { colors } = useTheme();
  const [asking, setAsking] = useState(false);
  if (asking && onDelete) {
    return (
      <View accessibilityRole="alert" style={[s.confirm, { backgroundColor: colors.dangerSoft, borderColor: colors.danger }]}>
        <T v="small">{confirm}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          <Button small variant="danger" label="Borrar definitivamente" onPress={onDelete} />
          <Button small variant="ghost" label="Cancelar" onPress={() => setAsking(false)} />
        </View>
      </View>
    );
  }
  return (
    <View style={{ gap: space[2] }}>
      <Button label={submitLabel} onPress={onSubmit} disabled={disabled} />
      {onDelete && <Button variant="ghost" label="Borrar" icon={<Trash2 size={16} color={colors.primary} />} onPress={() => setAsking(true)} />}
    </View>
  );
}

/** Valores que ya existen para un campo de texto libre (como el `datalist` de la web): tocar uno lo rellena. */
export function Suggestions({ field, values, current, onPick }: { field: string; values: string[]; current: string; onPick: (v: string) => void }) {
  const { colors } = useTheme();
  const q = current.trim().toLowerCase();
  const shown = values.filter((v) => v.toLowerCase() !== q && (!q || v.toLowerCase().includes(q))).slice(0, 8);
  if (!shown.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space[2] }} style={{ marginTop: -space[2] }}>
      {shown.map((v) => (
        <Pressable
          key={v}
          accessibilityRole="button"
          accessibilityLabel={`${field}: usar «${v}»`}
          hitSlop={4}
          onPress={() => onPick(v)}
          style={({ pressed }) => [s.suggestion, { borderColor: colors.lineStrong, backgroundColor: colors.surfaceSunken, opacity: pressed ? 0.7 : 1 }]}
        >
          <T v="small" tint="muted" style={{ fontFamily: fonts.medium }}>
            {v}
          </T>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** Etiqueta pequeña de solo lectura (estado, etapa, clase). */
export function Pill({ children, color, a11yLabel }: { children: ReactNode; color?: string; a11yLabel?: string }) {
  const { colors } = useTheme();
  return (
    <View accessible={!!a11yLabel} accessibilityLabel={a11yLabel} style={[s.pill, { backgroundColor: color ? `${color}24` : colors.surfaceSunken }]}>
      <T v="small" style={{ fontSize: 13, lineHeight: 18, fontFamily: fonts.medium, color: colors.inkMuted }}>
        {children}
      </T>
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
  meter: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  disclosure: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: touchTarget, alignSelf: 'flex-start', paddingRight: space[2] },
  checklist: { marginLeft: 12, paddingLeft: space[4], borderLeftWidth: 2, gap: space[2] },
  confirm: { borderWidth: 1, borderRadius: radius.md, padding: space[4], gap: space[3] },
  suggestion: { minHeight: 36, justifyContent: 'center', paddingHorizontal: space[3], borderRadius: radius.pill, borderWidth: 1 },
  pill: { borderRadius: radius.pill, paddingHorizontal: space[2], paddingVertical: 2, alignSelf: 'flex-start' },
});
