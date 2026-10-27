import { IDEA_CATEGORIES, IDEA_CATEGORY_INFO, ideaCategoryOf, plural, splitTags, type IdeaCategory, type LegacyIdea } from '@dyc/core';
import { radius, space } from '@dyc/tokens';
import { Lightbulb, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { Dot, DotChoices, FormActions, IconButton, Pill, ToolScreen } from '../../components/tools';
import { Button, Card, EmptyState, ErrorState, Field, Loading, T, fonts, type as typo } from '../../components/ui';
import { newId, useLegacyData, useLegacyList, useModule } from '../../lib/legacy';
import { useTheme } from '../../lib/theme';
import { useToast } from '../../lib/toast';
import { useAutosave } from '../../lib/tools';

type Filter = 'todas' | IdeaCategory;
const EXAMPLES = ['App de hábitos', 'Landing para portfolio', 'Reel para Instagram'];
const FILTER_OPTIONS: Array<{ value: Filter; label: string; color?: string }> = [
  { value: 'todas', label: 'Todas' },
  ...IDEA_CATEGORIES.map((c) => ({ value: c, label: IDEA_CATEGORY_INFO[c].label, color: IDEA_CATEGORY_INFO[c].color })),
];

export default function Ideas() {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const ideas = useLegacyList(legacy.data?.data, 'ideas');
  const actions = useModule('ideas');
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('todas');
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState<LegacyIdea | null>(null);
  const input = useRef<TextInput>(null);
  // Como la app anterior: una idea nueva toma la categoría del filtro (o App con «Todas»).
  const category: IdeaCategory = filter === 'todas' ? 'app' : filter;
  const shown = ideas.filter((i) => filter === 'todas' || ideaCategoryOf(i) === filter);

  const add = () => {
    if (!title.trim()) return;
    actions.add({ id: newId(), title: title.trim(), body: '', category, tags: '' });
    setTitle('');
  };

  const remove = (idea: LegacyIdea) => {
    const order = ideas.map((i) => i.id);
    actions.remove(idea.id);
    toast('Idea eliminada.', {
      action: {
        label: 'Deshacer',
        run: () => {
          actions.add(idea);
          actions.reorder(order);
        },
      },
    });
  };

  return (
    <ToolScreen
      title="Ideas"
      refreshing={legacy.isRefetching}
      onRefresh={() => legacy.refetch()}
      right={ideas.length > 0 ? <Pill a11yLabel={`${plural(ideas.length, 'idea guardada', 'ideas guardadas')}`}>{plural(ideas.length, 'guardada', 'guardadas')}</Pill> : undefined}
    >
      {legacy.isPending ? (
        <Loading label="Cargando tus ideas" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : (
        <>
          <DotChoices legend="Categoría" hideLegend value={filter} onChange={setFilter} options={FILTER_OPTIONS} />
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[2] }}>
            <View style={{ flex: 1 }}>
              <Field
                ref={input}
                label={`Nueva idea de ${IDEA_CATEGORY_INFO[category].label}`}
                value={title}
                onChangeText={setTitle}
                maxLength={200}
                placeholder="Escribe la idea…"
                returnKeyType="done"
                onSubmitEditing={add}
              />
            </View>
            <Button label="Añadir" icon={<Plus size={18} color={colors.onPrimary} />} onPress={add} disabled={!title.trim()} />
          </View>

          {ideas.length === 0 ? (
            <EmptyState
              title="Tu primera idea empieza aquí"
              action={
                <View accessibilityLabel="Ejemplos" style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space[2] }}>
                  {EXAMPLES.map((ex) => (
                    <Pressable
                      key={ex}
                      accessibilityRole="button"
                      accessibilityLabel={`Usar el ejemplo «${ex}»`}
                      onPress={() => {
                        setTitle(ex);
                        input.current?.focus();
                      }}
                      style={({ pressed }) => [st.example, { borderColor: colors.lineStrong, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
                    >
                      <Lightbulb size={15} color={colors.primary} />
                      <T v="small" tint="primary" style={{ fontFamily: fonts.medium }}>
                        {ex}
                      </T>
                    </Pressable>
                  ))}
                </View>
              }
            >
              Anota lo que se te ocurra: apps, webs o estrategias de marketing. ¿Sin inspiración? Prueba con un ejemplo:
            </EmptyState>
          ) : shown.length === 0 ? (
            <EmptyState title={`Aún no hay ideas de ${IDEA_CATEGORY_INFO[category].label}`}>Escribe la primera arriba.</EmptyState>
          ) : (
            shown.map((i) => <IdeaCard key={i.id} idea={i} onEdit={() => setEditing(i)} onRemove={() => remove(i)} />)
          )}
        </>
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Editar idea">
        {editing && <IdeaForm idea={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </ToolScreen>
  );
}

function IdeaCard({ idea: i, onEdit, onRemove }: { idea: LegacyIdea; onEdit: () => void; onRemove: () => void }) {
  const { colors } = useTheme();
  const actions = useModule('ideas');
  const cat = IDEA_CATEGORY_INFO[ideaCategoryOf(i)];
  const title = i.title || 'Sin título';
  const body = useAutosave(i.body ?? '', (v) => v !== i.body && actions.update(i.id, { body: v }));
  const tags = useAutosave(i.tags ?? '', (v) => v !== i.tags && actions.update(i.id, { tags: v.slice(0, 300) }), 1000);
  const tagList = splitTags(tags.draft);
  return (
    <Card style={[st.card, { borderLeftColor: cat.color }]}>
      <View style={st.head}>
        <View style={st.cat} accessible accessibilityLabel={`Categoría: ${cat.label}`}>
          <Dot color={cat.color} size={8} />
          <T v="eyebrow" tint="muted">
            {cat.label}
          </T>
        </View>
        <IconButton label={`Editar «${title}»`} onPress={onEdit}>
          <Pencil size={18} color={colors.inkMuted} />
        </IconButton>
        <IconButton label={`Borrar «${title}»`} onPress={onRemove} style={{ marginRight: -space[2] }}>
          <Trash2 size={18} color={colors.inkMuted} />
        </IconButton>
      </View>
      <T v="heading" accessibilityRole="header" style={{ fontSize: 19, lineHeight: 24, marginTop: -space[2] }}>
        {title}
      </T>
      <TextInput
        accessibilityLabel={`Desarrollo de «${title}»`}
        value={body.draft}
        onChangeText={body.change}
        onBlur={body.flush}
        multiline
        maxLength={50_000}
        placeholder="Desarrolla la idea…"
        placeholderTextColor={colors.inkSubtle}
        style={[typo.body, st.body, { color: colors.ink, backgroundColor: colors.surfaceSunken }]}
      />
      {tagList.length > 0 && (
        <View accessibilityLabel="Etiquetas" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {tagList.map((t) => (
            <T key={t} v="small" tint="primary" style={{ fontFamily: fonts.medium }}>
              #{t}
            </T>
          ))}
        </View>
      )}
      <TextInput
        accessibilityLabel={`Etiquetas de «${title}», separadas por comas`}
        value={tags.draft}
        onChangeText={tags.change}
        onBlur={tags.flush}
        onSubmitEditing={tags.flush}
        returnKeyType="done"
        maxLength={300}
        autoCapitalize="none"
        placeholder="Etiquetas (coma): urgente, saas"
        placeholderTextColor={colors.inkSubtle}
        style={[typo.small, st.tags, { color: colors.ink, borderColor: colors.line }]}
      />
    </Card>
  );
}

function IdeaForm({ idea, onDone }: { idea: LegacyIdea; onDone: () => void }) {
  const actions = useModule('ideas');
  const [title, setTitle] = useState(idea.title ?? '');
  const [category, setCategory] = useState<IdeaCategory>(ideaCategoryOf(idea));
  const submit = () => {
    actions.update(idea.id, { title: title.trim(), category });
    onDone();
  };
  return (
    <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <Field label="Idea" value={title} onChangeText={setTitle} maxLength={200} />
      <DotChoices
        legend="Categoría"
        value={category}
        onChange={setCategory}
        options={IDEA_CATEGORIES.map((c) => ({ value: c, label: IDEA_CATEGORY_INFO[c].label, color: IDEA_CATEGORY_INFO[c].color }))}
      />
      <FormActions
        submitLabel="Guardar"
        onSubmit={submit}
        disabled={!title.trim()}
        onDelete={() => {
          actions.remove(idea.id);
          onDone();
        }}
        confirm={`Se borrará «${idea.title || 'esta idea'}» con su desarrollo y etiquetas.`}
      />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  card: { borderLeftWidth: 4 },
  head: { flexDirection: 'row', alignItems: 'center', marginTop: -space[2] },
  cat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2] },
  body: { minHeight: 88, borderRadius: radius.md, paddingHorizontal: space[3], paddingTop: space[2], paddingBottom: space[2], textAlignVertical: 'top' },
  tags: { minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space[2] },
  example: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: space[3], borderRadius: radius.pill, borderWidth: 1 },
});
