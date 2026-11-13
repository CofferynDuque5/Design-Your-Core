import {
  formatBytes,
  safeColor,
  utcDayKey,
  VENTURE_COLORS,
  VENTURE_FILE_MAX_BYTES,
  VENTURE_STAGE_INFO,
  ventureItemName,
  ventureItemsOf,
  ventureSummary,
  type LegacyVenture,
  type LegacyVentureItem,
  type VentureItemKind,
} from '@dyc/core';
import { radius, space } from '@dyc/tokens';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ExternalLink, FileText, ImagePlus, Link2, NotebookPen, Paperclip, Pencil, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { FitImage, Markdown } from '../../../components/markdown';
import { Sheet } from '../../../components/Sheet';
import { ConfirmDelete, DotChoices, FormActions, IconButton, Pill, tint, ToolScreen } from '../../../components/tools';
import { Button, Card, EmptyState, ErrorState, Field, Loading, PageHeader, T, errorMessage, fonts } from '../../../components/ui';
import { stageOf, VentureForm } from '../../../components/ventures';
import { deleteFiles, openFile, pickDocuments, pickImages, readDocument, uploadFile, useFiles } from '../../../lib/files';
import { newId, useLegacyData, useLegacyList, useModule } from '../../../lib/legacy';
import { useTheme } from '../../../lib/theme';
import { useToast } from '../../../lib/toast';

const BACK = { label: 'Emprendimientos', href: '/emprendimientos' } as const;
type Filter = 'todo' | VentureItemKind;
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'todo', label: 'Todo' },
  { value: 'note', label: 'Notas' },
  { value: 'image', label: 'Imágenes' },
  { value: 'file', label: 'Archivos' },
  { value: 'link', label: 'Enlaces' },
];
const noImages = () => null;

export default function VentureDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const legacy = useLegacyData();
  const venture = useLegacyList(legacy.data?.data, 'ventures').find((v) => v.id === id);
  if (legacy.isPending || legacy.isError || !venture) {
    return (
      <ToolScreen title={venture?.name || 'Emprendimiento'} eyebrow="Emprendimientos" back={BACK} refreshing={legacy.isRefetching} onRefresh={() => legacy.refetch()}>
        {legacy.isPending ? (
          <Loading label="Cargando tu emprendimiento" />
        ) : legacy.isError ? (
          <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
        ) : (
          <EmptyState title="Este emprendimiento ya no existe" action={<Button small variant="secondary" label="Ver tus emprendimientos" onPress={() => router.replace('/emprendimientos')} />}>
            Puede que lo hayas borrado desde otro dispositivo.
          </EmptyState>
        )}
      </ToolScreen>
    );
  }
  return <VentureDetail venture={venture} />;
}

function VentureDetail({ venture: v }: { venture: LegacyVenture }) {
  const { colors, name } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const legacy = useLegacyData();
  const items = ventureItemsOf(legacy.data?.data, v.id);
  const itemActions = useModule('ventureItems');
  const [filter, setFilter] = useState<Filter>('todo');
  const [editingVenture, setEditingVenture] = useState(false);
  const [editing, setEditing] = useState<LegacyVentureItem | { kind: 'note' | 'link' } | null>(null);
  const [viewing, setViewing] = useState<LegacyVentureItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const color = safeColor(v.color, VENTURE_COLORS[0]);

  const shown = items.filter((i) => filter === 'todo' || i.kind === filter);
  const images = useFiles(items.filter((i) => i.kind === 'image' && i.ref).map((i) => i.ref));
  const imageSrc = (i: LegacyVentureItem) => images.data?.images[i.ref];

  const save = async (kind: 'image' | 'file', files: Array<{ name: string; mime: string; size: number; read: () => Promise<string> }>) => {
    setError(null);
    for (const [n, f] of files.entries()) {
      if (kind === 'file' && f.size > VENTURE_FILE_MAX_BYTES) {
        setError(`«${f.name}» pesa ${formatBytes(f.size)}; el máximo es ${formatBytes(VENTURE_FILE_MAX_BYTES)}.`);
        continue;
      }
      setBusy(files.length > 1 ? `Subiendo ${n + 1} de ${files.length}…` : `Subiendo «${f.name}»…`);
      try {
        const ref = await uploadFile(await f.read(), 'vf');
        itemActions.add({
          id: newId(),
          ventureId: v.id,
          kind,
          title: (kind === 'image' ? f.name.replace(/\.[^.]+$/, '') : f.name).slice(0, 200),
          text: '',
          url: '',
          ref,
          mime: f.mime.slice(0, 120),
          size: f.size,
          date: utcDayKey(),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : `No se pudo subir «${f.name}».`);
      }
    }
    setBusy(null);
  };
  const addImages = async () => {
    try {
      const picked = await pickImages(10, 2000);
      await save('image', picked.map((p) => ({ name: p.name, mime: p.mime, size: p.size, read: async () => p.data })));
    } catch (e) {
      setBusy(null);
      setError(errorMessage(e));
    }
  };
  const addFiles = async () => {
    try {
      const picked = (await pickDocuments()).slice(0, 10);
      await save('file', picked.map((a) => ({ name: a.name, mime: a.mimeType || 'application/octet-stream', size: a.size ?? 0, read: () => readDocument(a) })));
    } catch (e) {
      setBusy(null);
      setError(errorMessage(e));
    }
  };
  const remove = (i: LegacyVentureItem) => {
    itemActions.remove(i.id);
    if (i.ref) void deleteFiles([i.ref]);
  };
  const share = (i: LegacyVentureItem) => openFile(i.ref, i.kind === 'image' ? `${i.title || 'imagen'}.jpg` : i.title || 'archivo').catch((e) => toast(errorMessage(e)));

  const gallery = shown.filter((i) => i.kind === 'image');
  const rest = shown.filter((i) => i.kind !== 'image');

  return (
    <ToolScreen
      title={v.name}
      back={BACK}
      refreshing={legacy.isRefetching}
      onRefresh={() => legacy.refetch()}
      header={
        <View style={[st.hero, { backgroundColor: tint(color, colors.bg, name === 'dark' ? 0.18 : 0.1), borderColor: tint(color, colors.bg, 0.35) }]}>
          <PageHeader eyebrow="Emprendimiento" title={v.name} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
            <Pill color={color}>{VENTURE_STAGE_INFO[stageOf(v)].label}</Pill>
            <T v="small" tint="muted">
              {ventureSummary(items)}
            </T>
          </View>
          {v.description ? (
            <T v="body">{v.description}</T>
          ) : (
            <T v="small" tint="muted">
              Sin descripción. Pulsa «Editar» para contar de qué trata.
            </T>
          )}
          <Button small variant="secondary" label="Editar" accessibilityLabel="Editar emprendimiento" icon={<Pencil size={16} color={colors.primary} />} onPress={() => setEditingVenture(true)} style={{ alignSelf: 'flex-start' }} />
        </View>
      }
    >
      <View accessibilityLabel="Añadir" style={st.add}>
        <Button small variant="secondary" label="Nota" accessibilityLabel="Añadir nota" icon={<NotebookPen size={16} color={colors.primary} />} onPress={() => setEditing({ kind: 'note' })} />
        <Button small variant="secondary" label="Imagen" accessibilityLabel="Añadir imágenes" icon={<ImagePlus size={16} color={colors.primary} />} onPress={addImages} disabled={!!busy} />
        <Button small variant="secondary" label="Archivo" accessibilityLabel="Añadir archivos" icon={<Paperclip size={16} color={colors.primary} />} onPress={addFiles} disabled={!!busy} />
        <Button small variant="secondary" label="Enlace" accessibilityLabel="Añadir enlace" icon={<Link2 size={16} color={colors.primary} />} onPress={() => setEditing({ kind: 'link' })} />
      </View>
      {busy && (
        <T v="small" tint="muted" accessibilityLiveRegion="polite">
          {busy}
        </T>
      )}
      {error && (
        <T v="small" tint="danger" accessibilityRole="alert">
          {error}
        </T>
      )}
      {items.length > 0 && <DotChoices legend="Mostrar" options={FILTERS} value={filter} onChange={setFilter} />}
      {items.length === 0 ? (
        <EmptyState title="Todavía está vacío">Añade una nota con tu plan, fotos de productos o del local, archivos como presupuestos o presentaciones, y enlaces a tu tienda o redes.</EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState title={`Sin ${FILTERS.find((f) => f.value === filter)?.label.toLowerCase()}`}>Usa los botones de arriba para añadir.</EmptyState>
      ) : (
        <>
          {gallery.length > 0 && (
            <View style={st.gallery} accessibilityLabel="Imágenes">
              {gallery.map((i) => {
                const src = imageSrc(i);
                return (
                  <Pressable
                    key={i.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Ver «${ventureItemName(i)}»`}
                    onPress={() => setViewing(i)}
                    style={[st.thumb, { backgroundColor: colors.surfaceSunken, borderColor: colors.line }]}
                  >
                    {src ? (
                      <Image source={{ uri: src }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
                    ) : (
                      <T v="small" tint="muted">
                        {images.isPending ? 'Cargando…' : 'No disponible'}
                      </T>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
          {rest.map((i) => (
            <ItemRow key={i.id} item={i} onEdit={() => setEditing(i)} onShare={() => share(i)} />
          ))}
        </>
      )}

      <Sheet open={editingVenture} onClose={() => setEditingVenture(false)} title="Editar emprendimiento">
        {editingVenture && (
          <VentureForm
            venture={v}
            onDone={() => setEditingVenture(false)}
            onDeleted={() => {
              setEditingVenture(false);
              toast('Emprendimiento borrado con todo lo que guardaba.');
              router.replace('/emprendimientos');
            }}
          />
        )}
      </Sheet>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={itemSheetTitle(editing)}>
        {editing && (
          <ItemForm
            ventureId={v.id}
            item={'id' in editing ? editing : null}
            kind={editing.kind}
            onDone={() => setEditing(null)}
            onDelete={(i) => {
              remove(i);
              setEditing(null);
            }}
          />
        )}
      </Sheet>
      <Sheet open={viewing !== null} onClose={() => setViewing(null)} title={viewing ? ventureItemName(viewing) : 'Imagen'}>
        {viewing && (
          <ImageView
            item={viewing}
            src={imageSrc(viewing)}
            onShare={() => share(viewing)}
            onEdit={() => {
              setEditing(viewing);
              setViewing(null);
            }}
            onDelete={() => {
              remove(viewing);
              setViewing(null);
            }}
          />
        )}
      </Sheet>
    </ToolScreen>
  );
}

const itemSheetTitle = (e: LegacyVentureItem | { kind: string } | null) => {
  if (!e) return '';
  const isNew = !('id' in e);
  if (e.kind === 'note') return isNew ? 'Nueva nota' : 'Editar nota';
  if (e.kind === 'link') return isNew ? 'Nuevo enlace' : 'Editar enlace';
  return e.kind === 'image' ? 'Editar imagen' : 'Editar archivo';
};

function ItemRow({ item: i, onEdit, onShare }: { item: LegacyVentureItem; onEdit: () => void; onShare: () => void }) {
  const { colors } = useTheme();
  const name = ventureItemName(i);
  const Icon = i.kind === 'note' ? NotebookPen : i.kind === 'link' ? Link2 : FileText;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Icon size={18} color={colors.inkMuted} />
        {i.kind === 'link' ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${name} (se abre en el navegador)`}
            onPress={() => Linking.openURL(i.url).catch(() => undefined)}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[1], minHeight: 44 }}
          >
            <T v="label" numberOfLines={2} style={{ fontFamily: fonts.semibold, color: colors.primary, flexShrink: 1 }}>
              {name}
            </T>
            <ExternalLink size={14} color={colors.primary} />
          </Pressable>
        ) : (
          <View style={{ flex: 1 }}>
            <T v="label" numberOfLines={2} style={{ fontFamily: fonts.semibold }}>
              {name}
            </T>
            {i.kind === 'file' && (
              <T v="small" tint="muted">
                {formatBytes(i.size)}
              </T>
            )}
          </View>
        )}
        {i.kind === 'file' && !!i.ref && (
          <IconButton label={`Abrir o compartir «${name}»`} onPress={onShare}>
            <Share2 size={18} color={colors.inkMuted} />
          </IconButton>
        )}
        <IconButton label={`Editar «${name}»`} onPress={onEdit}>
          <Pencil size={18} color={colors.inkMuted} />
        </IconButton>
      </View>
      {!!i.text &&
        (i.kind === 'note' ? (
          <View style={{ marginTop: space[2] }}>
            <Markdown text={i.text} resolveImage={noImages} />
          </View>
        ) : (
          <T v="small" tint="muted" style={{ marginTop: space[2] }}>
            {i.text}
          </T>
        ))}
    </Card>
  );
}

function ImageView({ item, src, onShare, onEdit, onDelete }: { item: LegacyVentureItem; src: string | undefined; onShare: () => void; onEdit: () => void; onDelete: () => void }) {
  const { colors } = useTheme();
  const [asking, setAsking] = useState(false);
  return (
    <View style={{ gap: space[3] }}>
      {src ? <FitImage src={src} label={ventureItemName(item)} /> : <T tint="muted">La imagen no está disponible.</T>}
      {!!item.text && <T v="body">{item.text}</T>}
      {asking ? (
        <ConfirmDelete onConfirm={onDelete} onCancel={() => setAsking(false)}>
          Se borrará esta imagen.
        </ConfirmDelete>
      ) : (
        <View style={{ gap: space[2] }}>
          <Button label="Editar" icon={<Pencil size={16} color={colors.onPrimary} />} onPress={onEdit} />
          {!!src && <Button variant="secondary" label="Compartir o guardar" icon={<Share2 size={16} color={colors.primary} />} onPress={onShare} />}
          <Button variant="ghost" label="Borrar" onPress={() => setAsking(true)} />
        </View>
      )}
    </View>
  );
}

function ItemForm({ ventureId, item, kind, onDone, onDelete }: { ventureId: string; item: LegacyVentureItem | null; kind: VentureItemKind; onDone: () => void; onDelete: (i: LegacyVentureItem) => void }) {
  const actions = useModule('ventureItems');
  const [title, setTitle] = useState(item?.title ?? '');
  const [text, setText] = useState(item?.text ?? '');
  const [url, setUrl] = useState(item?.url ?? '');
  const link = /^https?:\/\//i.test(url.trim()) || !url.trim() ? url.trim() : `https://${url.trim()}`;
  const badUrl = kind === 'link' && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(link);
  const submit = () => {
    const fields = { title: title.trim(), text, ...(kind === 'link' ? { url: link } : {}) };
    if (item) actions.update(item.id, fields);
    else actions.add({ id: newId(), ventureId, kind, url: '', ref: '', mime: '', size: 0, date: utcDayKey(), ...fields });
    onDone();
  };
  const noun = kind === 'note' ? 'la nota' : kind === 'link' ? 'el enlace' : kind === 'image' ? 'la imagen' : 'el archivo';
  return (
    <View style={{ gap: space[4] }}>
      {kind === 'link' && (
        <Field
          label="Enlace"
          value={url}
          onChangeText={setUrl}
          onBlur={() => setUrl(link)}
          maxLength={2000}
          autoFocus={!item}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://tu-tienda.com"
          error={url.trim() && badUrl ? 'Pega un enlace completo, por ejemplo https://instagram.com/tu-marca' : null}
        />
      )}
      <Field label={kind === 'note' ? 'Título' : 'Nombre (opcional)'} value={title} onChangeText={setTitle} maxLength={200} autoFocus={kind === 'note' && !item} placeholder={kind === 'note' ? 'Plan de lanzamiento' : ''} />
      <Field
        label={kind === 'note' ? 'Texto' : 'Descripción (opcional)'}
        value={text}
        onChangeText={setText}
        maxLength={100_000}
        multiline
        hint={kind === 'note' ? 'Admite Markdown: **negrita**, listas con «-» y títulos con «#».' : undefined}
        style={{ minHeight: kind === 'note' ? 180 : 88, textAlignVertical: 'top' }}
      />
      <FormActions
        submitLabel={item ? 'Guardar' : kind === 'note' ? 'Guardar nota' : 'Guardar enlace'}
        onSubmit={submit}
        disabled={kind === 'note' ? !title.trim() && !text.trim() : kind === 'link' ? badUrl : false}
        onDelete={item ? () => onDelete(item) : undefined}
        confirm={item ? `Se borrará ${noun}.` : undefined}
      />
    </View>
  );
}

const st = StyleSheet.create({
  hero: { borderRadius: radius.lg, borderWidth: 1, padding: space[4], gap: space[3] },
  add: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  thumb: { width: '31.5%', aspectRatio: 1, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
