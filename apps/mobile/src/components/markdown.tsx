import { isNoteImageRef, MD_MAX_QUOTE_DEPTH, mdImageLabel, parseBlocks, parseInline, SAFE_LINK, type MdBlock, type MdInline } from '@dyc/core';
import { radius, space } from '@dyc/tokens';
import { Check, ImageOff } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Image, Linking, Platform, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import type { ImageResolver } from '../lib/images';
import { useTheme } from '../lib/theme';
import { T, fonts, type as typo } from './ui';

/**
 * Markdown SEGURO de las notas en el móvil. El análisis es el de la web
 * (@dyc/core) y aquí cada trozo se dibuja con `Text` y `View` de React
 * Native: nunca se interpreta HTML ni se abre nada que no sea http(s) o
 * mailto. Las imágenes `coreimg:` y base64 se muestran; las de otras webs,
 * como enlace (no se cargan).
 */

export const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' });

type Colors = ReturnType<typeof useTheme>['colors'];
interface Ctx {
  resolve: ImageResolver;
  images: { n: number };
  colors: Colors;
}

const open = (href: string) => {
  if (SAFE_LINK.test(href)) Linking.openURL(href).catch(() => undefined);
};

/** Trozos dentro de un `Text` (las imágenes anidadas en negrita o enlaces quedan como su nombre). */
function inline(tokens: MdInline[], ctx: Ctx, key: string): ReactNode[] {
  const { colors } = ctx;
  return tokens.map((t, n) => {
    const k = `${key}-${n}`;
    switch (t.type) {
      case 'text':
        return t.text;
      case 'code':
      case 'math':
        return (
          <Text key={k} style={[s.codeInline, { fontFamily: MONO, backgroundColor: colors.surfaceSunken, color: t.type === 'math' ? colors.primary : colors.ink }]}>
            {t.text}
          </Text>
        );
      case 'strong':
        return (
          <Text key={k} style={{ fontFamily: fonts.semibold }}>
            {inline(t.children, ctx, k)}
          </Text>
        );
      case 'em':
        return (
          <Text key={k} style={{ fontFamily: fonts.displayItalic }}>
            {inline(t.children, ctx, k)}
          </Text>
        );
      case 'del':
        return (
          <Text key={k} style={{ textDecorationLine: 'line-through' }}>
            {inline(t.children, ctx, k)}
          </Text>
        );
      case 'link':
        return t.href ? (
          <Link key={k} href={t.href} color={colors.primary}>
            {inline(t.children, ctx, k)}
          </Link>
        ) : (
          <Text key={k}>{inline(t.children, ctx, k)}</Text>
        );
      case 'url':
        return (
          <Link key={k} href={t.href} color={colors.primary}>
            {t.href}
          </Link>
        );
      case 'image': {
        const label = mdImageLabel(t.alt, ++ctx.images.n);
        return !isNoteImageRef(t.ref) && SAFE_LINK.test(t.ref) ? (
          <Link key={k} href={t.ref} color={colors.primary}>
            {label} (enlace externo)
          </Link>
        ) : (
          `[${label}]`
        );
      }
    }
  });
}

function Link({ href, color, children }: { href: string; color: string; children: ReactNode }) {
  return (
    <Text accessibilityRole="link" accessibilityHint="Se abre en el navegador" onPress={() => open(href)} style={{ color, textDecorationLine: 'underline' }}>
      {children}
    </Text>
  );
}

/**
 * Una línea de texto con sus imágenes: el texto va en `Text` y cada imagen
 * propia de la nota se dibuja debajo, a todo el ancho, en el orden del texto.
 */
function rich(text: string, ctx: Ctx, key: string, style: StyleProp<TextStyle>, textProps: { accessibilityRole?: 'header' } = {}): ReactNode[] {
  const out: ReactNode[] = [];
  let run: MdInline[] = [];
  const flush = () => {
    // Un trozo solo de espacios entre dos imágenes no ocupa sitio.
    if (run.length && !run.every((t) => t.type === 'text' && !t.text.trim())) {
      out.push(
        <Text key={`${key}-t${out.length}`} style={style} maxFontSizeMultiplier={1.6} {...textProps}>
          {inline(run, ctx, `${key}-${out.length}`)}
        </Text>,
      );
    }
    run = [];
  };
  for (const t of parseInline(text)) {
    if (t.type === 'image' && isNoteImageRef(t.ref)) {
      flush();
      out.push(<NoteImage key={`${key}-i${out.length}`} src={ctx.resolve(t.ref)} label={mdImageLabel(t.alt, ++ctx.images.n)} colors={ctx.colors} />);
    } else run.push(t);
  }
  flush();
  return out;
}

function NoteImage({ src, label, colors }: { src: string | null | undefined; label: string; colors: Colors }) {
  if (src)
    return <FitImage src={src} label={label} />;
  return (
    <View style={[s.missing, { borderColor: colors.line, backgroundColor: colors.surfaceSunken }]}>
      <ImageOff size={16} color={colors.inkMuted} />
      <T v="small" tint="muted" style={{ flex: 1 }}>
        {src === undefined ? 'Cargando la imagen…' : `${label}: no disponible. Solo está en el navegador donde se añadió.`}
      </T>
    </View>
  );
}

/** Imagen a todo el ancho con su proporción real (16:9 mientras se lee). */
export function FitImage({ src, label }: { src: string; label: string }) {
  const [ratio, setRatio] = useState(16 / 9);
  useEffect(() => {
    let alive = true;
    try {
      Image.getSize(
        src,
        (w, h) => alive && w > 0 && h > 0 && setRatio(Math.max(0.5, Math.min(3, w / h))),
        () => undefined,
      );
    } catch {
      // Si no se puede medir, se queda en 16:9.
    }
    return () => {
      alive = false;
    };
  }, [src]);
  return <Image source={{ uri: src }} accessibilityLabel={label} accessibilityRole="image" resizeMode="contain" style={[s.image, { aspectRatio: ratio }]} />;
}

const HEADING: Record<number, TextStyle> = {
  1: { fontFamily: fonts.display, fontSize: 26, lineHeight: 32, letterSpacing: -0.3 },
  2: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  3: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24 },
};

function blocks(list: MdBlock[], ctx: Ctx, key: string, depth: number): ReactNode[] {
  const { colors } = ctx;
  const body = [typo.body, { color: colors.ink }];
  return list.map((b, i) => {
    const k = `${key}${i}`;
    switch (b.type) {
      case 'heading':
        return (
          <View key={k} style={{ gap: space[2], marginTop: i ? space[2] : 0 }}>
            {rich(b.text, ctx, k, [HEADING[Math.min(3, b.level)], { color: colors.ink }], { accessibilityRole: 'header' })}
          </View>
        );
      case 'paragraph':
        return (
          <View key={k} style={{ gap: space[2] }}>
            {rich(b.text, ctx, k, body)}
          </View>
        );
      case 'code':
      case 'math':
        return (
          <View
            key={k}
            accessible
            accessibilityLabel={b.type === 'math' ? `Fórmula: ${b.text}` : `Código${b.lang ? ` (${b.lang})` : ''}: ${b.text}`}
            style={[s.codeBlock, { backgroundColor: colors.surfaceSunken, borderColor: colors.line }]}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Text style={{ fontFamily: MONO, fontSize: 14, lineHeight: 20, color: b.type === 'math' ? colors.primary : colors.ink }} maxFontSizeMultiplier={1.4}>
                {b.text}
              </Text>
            </ScrollView>
          </View>
        );
      case 'quote':
        return (
          <View key={k} style={[s.quote, { borderLeftColor: colors.lineStrong }]}>
            {depth < MD_MAX_QUOTE_DEPTH ? blocks(parseBlocks(b.text), ctx, `${k}-`, depth + 1) : <T tint="muted">{b.text}</T>}
          </View>
        );
      case 'rule':
        return <View key={k} style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.lineStrong, marginVertical: space[1] }} />;
      case 'list':
        return (
          <View key={k} style={{ gap: space[1] }}>
            {b.items.map((it, j) => (
              <View key={j} style={s.item}>
                {it.task === null ? (
                  <T tint="muted" style={s.marker} importantForAccessibility="no" accessibilityElementsHidden>
                    {b.ordered ? `${b.start + j}.` : '•'}
                  </T>
                ) : (
                  <View
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={it.task ? 'Hecho' : 'Por hacer'}
                    style={[s.check, { borderColor: it.task ? colors.primary : colors.lineStrong, backgroundColor: it.task ? colors.primary : 'transparent' }]}
                  >
                    {it.task && <Check size={13} strokeWidth={3} color={colors.onPrimary} />}
                  </View>
                )}
                <View style={{ flex: 1, gap: space[2] }}>{rich(it.text, ctx, `${k}-${j}`, [body, it.task ? { color: colors.inkMuted, textDecorationLine: 'line-through' } : null])}</View>
              </View>
            ))}
          </View>
        );
    }
  });
}

/** Muestra el Markdown de una nota con componentes nativos. */
export function Markdown({ text, resolveImage }: { text: string; resolveImage: ImageResolver }) {
  const { colors } = useTheme();
  const ctx: Ctx = { resolve: resolveImage, images: { n: 0 }, colors };
  return <View style={{ gap: space[3] }}>{blocks(parseBlocks(text), ctx, 'b', 0)}</View>;
}

const s = StyleSheet.create({
  codeInline: { fontSize: 14 },
  codeBlock: { borderRadius: radius.md, borderWidth: 1, padding: space[3] },
  quote: { borderLeftWidth: 3, paddingLeft: space[3], gap: space[2] },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  marker: { minWidth: 18, textAlign: 'right' },
  check: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  missing: { flexDirection: 'row', alignItems: 'center', gap: space[2], borderWidth: 1, borderRadius: radius.md, padding: space[3] },
  image: { width: '100%', borderRadius: radius.sm },
});
