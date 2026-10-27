import { NOTEBOOK_COLORS, notebookCoverArt, notebookCoverColors, notebookIcon, safeColor, type CoverShape, type LegacyNotebook } from '@dyc/core';
import { useId, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { MONO } from './markdown';
import { fonts } from './ui';
import { UiIcon } from './UiIcon';

// Lienzos de la portada: apaisada en las tarjetas y vertical, como un cuaderno, en la cabecera.
const SIZES = { card: [320, 200], hero: [150, 200] } as const;

/**
 * Portada de un cuaderno (la misma que en la web): el color del cuaderno en
 * degradado, el lomo a la izquierda, un dibujo de línea según la materia y su
 * icono en una insignia. Es decorativa: la tarjeta o la cabecera ya dicen el título.
 */
export function NotebookCover({
  notebook: n,
  variant,
  style,
}: {
  notebook: Pick<LegacyNotebook, 'id' | 'title' | 'category' | 'subject' | 'topic' | 'color' | 'emoji'>;
  variant: keyof typeof SIZES;
  style?: StyleProp<ViewStyle>;
}) {
  const [w, h] = SIZES[variant];
  const art = useMemo(() => notebookCoverArt({ id: n.id, subject: n.subject, topic: n.topic, title: n.title, category: n.category }, w, h), [n.id, n.subject, n.topic, n.title, n.category, w, h]);
  const colors = notebookCoverColors(safeColor(n.color, NOTEBOOK_COLORS[0]));
  const icon = notebookIcon(n.emoji);
  const id = `cover${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const badge = variant === 'card' ? 28 : 24;
  return (
    <View
      testID={`notebook-cover-${art.theme}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[st.cover, { aspectRatio: w / h }, variant === 'hero' && st.hero, style]}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.top} />
            <Stop offset="1" stopColor={colors.bottom} />
          </LinearGradient>
          <LinearGradient id={`${id}-sheen`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.12} />
            <Stop offset="0.6" stopColor="#ffffff" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width={w} height={h} fill={`url(#${id}-bg)`} />
        <G stroke={colors.ink} fill={colors.ink} strokeLinecap="round" strokeLinejoin="round">
          {art.shapes.map((s, i) => (
            <Shape key={i} shape={s} ink={colors.ink} />
          ))}
        </G>
        <Rect width={w} height={h} fill={`url(#${id}-sheen)`} />
        {/* Lomo: una banda más oscura con un filo de luz. */}
        <Rect width={art.spine} height={h} fill="#000000" fillOpacity={0.22} />
        <Rect x={art.spine} width={1} height={h} fill="#ffffff" fillOpacity={0.14} />
      </Svg>
      <View style={[st.badge, { width: badge, height: badge, borderRadius: badge / 2, left: `${Math.round((art.spine / w) * 100 + 3)}%` as `${number}%`, backgroundColor: colors.badgeSolid }]}>
        <UiIcon name={icon.icon} size={variant === 'card' ? 15 : 13} color={colors.ink} />
      </View>
    </View>
  );
}

function Shape({ shape: s, ink }: { shape: CoverShape; ink: string }) {
  if (s.kind === 'text') {
    return (
      <SvgText x={s.x} y={s.y} fontSize={s.size} fill={ink} fillOpacity={s.fill} stroke="none" textAnchor={s.anchor ?? 'start'} fontFamily={s.font === 'mono' ? MONO : s.italic ? fonts.displayItalic : fonts.display}>
        {s.text}
      </SvgText>
    );
  }
  const paint = { strokeOpacity: s.stroke ?? 0, strokeWidth: s.width ?? 1, fillOpacity: s.fill ?? 0, strokeDasharray: 'dash' in s && s.dash ? s.dash : undefined };
  if (s.kind === 'circle') return <Circle cx={s.cx} cy={s.cy} r={s.r} {...paint} />;
  return <Path d={s.d} {...paint} />;
}

const st = StyleSheet.create({
  cover: { width: '100%', overflow: 'hidden' },
  hero: { width: 72, borderTopLeftRadius: 4, borderBottomLeftRadius: 4, borderTopRightRadius: 10, borderBottomRightRadius: 10 },
  badge: { position: 'absolute', bottom: 8, alignItems: 'center', justifyContent: 'center' },
});
