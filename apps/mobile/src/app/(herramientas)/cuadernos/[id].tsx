import {
  BOX_COLORS,
  CODE_LANGS,
  coreImageIds,
  DATA_IMAGE,
  inlineImages,
  legacySubjectNames,
  newNoteBox,
  NOTEBOOK_COLORS,
  noteBoxKind,
  optionsWith,
  paletteWith,
  safeColor,
  type LegacyNoteBox,
} from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronDown, Code2, Copy, ImageOff, Palette, Trash2, Type } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { NotebookForm, NotebookTags } from '../../../components/notebooks';
import { Sheet } from '../../../components/Sheet';
import { ColorSwatches, DotChoices, IconButton, tint, ToolScreen } from '../../../components/tools';
import { Button, EmptyState, ErrorState, Loading, PageHeader, SectionHeader, T, fonts, type as typo } from '../../../components/ui';
import { api } from '../../../lib/api';
import { newId, useLegacyData, useLegacyList, useModule } from '../../../lib/legacy';
import { useTheme } from '../../../lib/theme';
import { useToast } from '../../../lib/toast';
import { copyOrShare, useAutosave } from '../../../lib/tools';

const BACK = { label: 'Cuadernos', href: '/cuadernos' } as const;
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' });
// Colores fijos del editor de código, como en la web y la app anterior (siempre oscuro).
const CODE = { bg: '#1e1e2e', head: '#181825', line: '#2a2a3c', ink: '#cdd6f4', muted: '#a6adc8', subtle: '#7f849c' };

export default function NotebookDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { colors, name } = useTheme();
  const legacy = useLegacyData();
  const notebooks = useLegacyList(legacy.data?.data, 'notebooks');
  const allBoxes = useLegacyList(legacy.data?.data, 'noteBoxes');
  const actions = useModule('noteBoxes');
  const [decorating, setDecorating] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const notebook = notebooks.find((n) => n.id === id);
  const boxes = allBoxes.filter((b) => b.notebookId === id);

  const addBox = (kind: 'text' | 'code') => {
    if (!notebook) return;
    const box = newNoteBox(newId(), notebook.id, kind);
    actions.add(box);
    setAdded(box.id);
  };

  if (legacy.isPending || legacy.isError || !notebook) {
    return (
      <ToolScreen title={notebook?.title || 'Cuaderno'} eyebrow="Cuaderno" back={BACK} refreshing={legacy.isRefetching} onRefresh={() => legacy.refetch()}>
        {legacy.isPending ? (
          <Loading label="Cargando el cuaderno" />
        ) : legacy.isError ? (
          <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
        ) : (
          <EmptyState title="Este cuaderno ya no existe" action={<Button small variant="secondary" label="Ver tus cuadernos" onPress={() => router.replace('/cuadernos')} />}>
            Puede que lo hayas borrado aquí o en la app anterior.
          </EmptyState>
        )}
      </ToolScreen>
    );
  }

  const color = safeColor(notebook.color, NOTEBOOK_COLORS[0]);
  return (
    <ToolScreen
      title={notebook.title || 'Cuaderno'}
      back={BACK}
      refreshing={legacy.isRefetching}
      onRefresh={() => legacy.refetch()}
      header={
        <View style={[st.hero, { backgroundColor: tint(color, colors.bg, name === 'dark' ? 0.22 : 0.12), borderColor: tint(color, colors.bg, 0.35) }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3] }}>
            <View style={[st.emoji, { backgroundColor: colors.surface }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <T v="title" style={{ fontSize: 30, lineHeight: 38 }}>
                {notebook.emoji || '📓'}
              </T>
            </View>
            <View style={{ flex: 1 }}>
              <PageHeader eyebrow="Cuaderno" title={notebook.title || 'Cuaderno'} />
            </View>
          </View>
          <NotebookTags notebook={notebook} />
          <Button small variant="secondary" label="Decorar" icon={<Palette size={16} color={colors.primary} />} onPress={() => setDecorating(true)} style={{ alignSelf: 'flex-start' }} />
        </View>
      }
    >
      <View style={{ gap: space[3] }}>
        <SectionHeader
          title="Cajitas"
          right={
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Button small variant="secondary" label="Texto" accessibilityLabel="Nueva cajita de texto" icon={<Type size={16} color={colors.primary} />} onPress={() => addBox('text')} />
              <Button small variant="secondary" label="Código" accessibilityLabel="Nueva cajita de código" icon={<Code2 size={16} color={colors.primary} />} onPress={() => addBox('code')} />
            </View>
          }
        />
        {boxes.length === 0 ? (
          <EmptyState title="Sin cajitas todavía">Añade cajitas para separar tus apuntes en bloques que puedes copiar con un toque.</EmptyState>
        ) : (
          boxes.map((b, i) => (noteBoxKind(b) === 'code' ? <CodeBox key={b.id} box={b} n={i + 1} autoFocus={added === b.id} /> : <TextBox key={b.id} box={b} n={i + 1} autoFocus={added === b.id} />))
        )}
      </View>

      <Sheet open={decorating} onClose={() => setDecorating(false)} title="Decorar cuaderno">
        {decorating && (
          <NotebookForm
            notebook={notebook}
            all={notebooks}
            subjects={legacySubjectNames(legacy.data.data)}
            boxCount={boxes.length}
            onDone={() => setDecorating(false)}
            onDeleted={() => {
              toast('Cuaderno eliminado con sus cajitas.');
              router.replace('/cuadernos');
            }}
          />
        )}
      </Sheet>
    </ToolScreen>
  );
}

function useBoxFields(box: LegacyNoteBox) {
  const actions = useModule('noteBoxes');
  const title = useAutosave(box.title ?? '', (v) => v !== box.title && actions.update(box.id, { title: v.slice(0, 200) }));
  const text = useAutosave(box.text ?? '', (v) => v !== box.text && actions.update(box.id, { text: v }));
  return { actions, title, text };
}

/** Copiar (o compartir) y borrar una cajita. */
function BoxTools({ box, name, copyText, ink }: { box: LegacyNoteBox; name: string; copyText: string; ink: string }) {
  const toast = useToast();
  const actions = useModule('noteBoxes');
  return (
    <>
      <IconButton
        label={Platform.OS === 'web' ? `Copiar ${name}` : `Copiar o compartir ${name}`}
        onPress={async () => {
          const r = await copyOrShare(copyText);
          if (r === 'copied') toast('Copiado.');
          else if (r === 'failed') toast('No se pudo copiar.', { tone: 'error' });
        }}
      >
        <Copy size={17} color={ink} />
      </IconButton>
      <IconButton
        label={`Borrar ${name}`}
        onPress={() => {
          actions.remove(box.id);
          toast('Cajita eliminada.');
        }}
      >
        <Trash2 size={17} color={ink} />
      </IconButton>
    </>
  );
}

function TextBox({ box, n, autoFocus }: { box: LegacyNoteBox; n: number; autoFocus: boolean }) {
  const { colors, name: scheme } = useTheme();
  const { actions, title, text } = useBoxFields(box);
  const [picking, setPicking] = useState(false);
  const label = title.draft.trim() ? `la cajita «${title.draft.trim()}»` : `la cajita ${n}`;
  const color = safeColor(box.color, BOX_COLORS[0]);
  // Como la web: el color tal cual en claro y un tinte suave sobre la superficie en oscuro.
  const bg = scheme === 'dark' ? tint(color, colors.surface, 0.16) : color;
  const ink = scheme === 'dark' ? colors.ink : '#1B2230';
  const muted = scheme === 'dark' ? colors.inkMuted : '#4A5263';
  return (
    <View style={[st.box, { backgroundColor: bg, borderColor: scheme === 'dark' ? tint(color, colors.surface, 0.4) : 'rgba(27, 34, 48, 0.1)' }]} accessibilityLabel={title.draft.trim() ? `Cajita «${title.draft.trim()}»` : `Cajita ${n}`}>
      <View style={st.boxHead}>
        <TextInput
          accessibilityLabel={`Título de ${label}`}
          value={title.draft}
          onChangeText={title.change}
          onBlur={title.flush}
          maxLength={200}
          placeholder="Título"
          placeholderTextColor={muted}
          style={[typo.heading, st.boxTitle, { color: ink }]}
        />
        <IconButton label={`Color de ${label}`} onPress={() => setPicking(true)}>
          <Palette size={17} color={muted} />
        </IconButton>
        <BoxTools box={box} name={label} copyText={(title.draft ? `${title.draft}\n` : '') + text.draft} ink={muted} />
      </View>
      <TextInput
        accessibilityLabel={`Texto de ${label}`}
        value={text.draft}
        onChangeText={text.change}
        onBlur={text.flush}
        multiline
        autoFocus={autoFocus}
        placeholder="Escribe aquí…"
        placeholderTextColor={muted}
        style={[typo.body, st.boxText, { color: ink, backgroundColor: scheme === 'dark' ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.45)' }]}
      />
      <BoxImages text={text.draft} muted={muted} />
      <Sheet open={picking} onClose={() => setPicking(false)} title="Color de la cajita">
        {picking && (
          <ColorSwatches
            legend={`Color de ${label}`}
            colors={paletteWith(BOX_COLORS, color)}
            value={color}
            onChange={(c) => {
              if (c !== color) actions.update(box.id, { color: c });
              setPicking(false);
            }}
          />
        )}
      </Sheet>
    </View>
  );
}

function CodeBox({ box, n, autoFocus }: { box: LegacyNoteBox; n: number; autoFocus: boolean }) {
  const { actions, title, text } = useBoxFields(box);
  const [picking, setPicking] = useState(false);
  const label = title.draft.trim() ? `la cajita de código «${title.draft.trim()}»` : `la cajita de código ${n}`;
  const lang = box.lang || CODE_LANGS[0];
  // Líneas visibles contando las que se parten (unos 38 caracteres por línea en un teléfono).
  const lines = Math.min(40, Math.max(6, text.draft.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 38)), 0) + 1));
  return (
    <View style={[st.code, { backgroundColor: CODE.bg, borderColor: CODE.line }]} accessibilityLabel={title.draft.trim() ? `Cajita de código «${title.draft.trim()}»` : `Cajita de código ${n}`}>
      <View style={[st.codeHead, { backgroundColor: CODE.head, borderBottomColor: CODE.line }]}>
        <View style={st.dots} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
            <View key={c} style={[st.dot, { backgroundColor: c }]} />
          ))}
        </View>
        <TextInput
          accessibilityLabel={`Nombre del archivo de ${label}`}
          value={title.draft}
          onChangeText={title.change}
          onBlur={title.flush}
          maxLength={200}
          placeholder="archivo.js"
          placeholderTextColor={CODE.subtle}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          style={[typo.small, st.codeTitle, { color: CODE.ink, fontFamily: MONO }]}
        />
        {/* La app anterior no guardaba este cambio; aquí se guarda en el mismo campo `lang`. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Lenguaje de ${label}: ${lang}`}
          onPress={() => setPicking(true)}
          hitSlop={6}
          style={({ pressed }) => [st.lang, { borderColor: CODE.line, opacity: pressed ? 0.7 : 1 }]}
        >
          <T v="small" style={{ color: CODE.muted, fontFamily: MONO, fontSize: 13 }}>
            {lang}
          </T>
          <ChevronDown size={14} color={CODE.muted} />
        </Pressable>
        <BoxTools box={box} name={label} copyText={text.draft} ink={CODE.muted} />
      </View>
      <TextInput
        accessibilityLabel={`Contenido de ${label}`}
        value={text.draft}
        onChangeText={text.change}
        onBlur={text.flush}
        multiline
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        placeholder="// Tu código"
        placeholderTextColor={CODE.subtle}
        style={[st.codeText, { color: CODE.ink, fontFamily: MONO, minHeight: lines * 20 + space[3] * 2 }]}
      />
      <Sheet open={picking} onClose={() => setPicking(false)} title="Lenguaje">
        {picking && (
          <DotChoices
            legend={`Lenguaje de ${label}`}
            value={lang}
            onChange={(l) => {
              if (l !== box.lang) actions.update(box.id, { lang: l });
              setPicking(false);
            }}
            options={optionsWith(CODE_LANGS, lang).map((l) => ({ value: l, label: l }))}
          />
        )}
      </Sheet>
    </View>
  );
}

// ---------- Imágenes de la app anterior ----------

/**
 * La app anterior referencia las imágenes como `coreimg:<id>` (guardadas en
 * el navegador y, con nube, en /api/images) o las incrusta en base64. Se
 * muestran las que se pueden leer, como en la web; subir imágenes no está en el móvil.
 */
function BoxImages({ text, muted }: { text: string; muted: string }) {
  const ids = useMemo(() => coreImageIds(text).slice(0, 100), [text]);
  const inline = useMemo(() => inlineImages(text), [text]);
  const cloud = useQuery({ queryKey: ['legacy-images', ids], queryFn: () => api.legacy.images(ids), enabled: ids.length > 0, staleTime: Infinity });
  if (!ids.length && !inline.length) return null;
  const found = cloud.data?.images ?? {};
  const missing = cloud.isSuccess || cloud.isError ? ids.filter((i) => !found[i]).length : 0;
  const sources = [...ids.filter((i) => found[i]).map((i) => found[i]), ...inline].filter((src) => DATA_IMAGE.test(src));
  return (
    <View style={{ gap: space[2] }}>
      {sources.map((src, i) => (
        <BoxImage key={i} src={src} label={`Imagen ${i + 1} de la cajita`} />
      ))}
      {missing > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <ImageOff size={15} color={muted} />
          <T v="small" style={{ color: muted, flex: 1 }}>
            {missing === 1 ? 'Una imagen' : `${missing} imágenes`} solo está{missing === 1 ? '' : 'n'} en el navegador donde se añadi{missing === 1 ? 'ó' : 'eron'}.
          </T>
        </View>
      )}
    </View>
  );
}

/** Imagen a todo el ancho con su proporción real (16:9 mientras se lee). */
function BoxImage({ src, label }: { src: string; label: string }) {
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
  return <Image source={{ uri: src }} accessibilityLabel={label} accessibilityRole="image" resizeMode="contain" style={[st.image, { aspectRatio: ratio }]} />;
}

const st = StyleSheet.create({
  hero: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space[4], gap: space[3], marginTop: space[2] },
  emoji: { width: 60, height: 60, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginTop: space[2] },
  box: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space[3], paddingTop: space[1], paddingBottom: space[3], gap: space[2] },
  boxHead: { flexDirection: 'row', alignItems: 'center' },
  boxTitle: { flex: 1, minWidth: 0, minHeight: touchTarget, paddingHorizontal: space[1] },
  boxText: { minHeight: 120, borderRadius: radius.sm, padding: space[2], textAlignVertical: 'top' },
  code: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  codeHead: { flexDirection: 'row', alignItems: 'center', paddingLeft: space[3], paddingRight: space[1], borderBottomWidth: 1 },
  dots: { flexDirection: 'row', gap: 6, marginRight: space[2] },
  dot: { width: 10, height: 10, borderRadius: 5 },
  codeTitle: { flex: 1, minWidth: 0, minHeight: touchTarget, paddingHorizontal: space[1] },
  lang: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32, paddingHorizontal: space[2], borderRadius: radius.sm, borderWidth: 1, marginHorizontal: space[1] },
  codeText: { fontSize: 14, lineHeight: 20, padding: space[3], textAlignVertical: 'top' },
  image: { width: '100%', borderRadius: radius.sm },
});
