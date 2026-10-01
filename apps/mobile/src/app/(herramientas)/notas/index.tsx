import {
  filterNotes,
  groupNotesBySubject,
  NOTE_DEFAULT_SUBJECT,
  NOTE_DEFAULT_TITLE,
  noteColorOf,
  noteDateLabel,
  notePreview,
  noteTag,
  noteTagList,
  noteTitleOf,
  plural,
  splitTags,
  type LegacyNote,
} from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { useRouter } from 'expo-router';
import { Plus, Search, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Dot, DotChoices, IconButton, Pill, ToolScreen } from '../../../components/tools';
import { Button, Card, EmptyState, ErrorState, Loading, T, fonts, type as typo } from '../../../components/ui';
import { newId, useLegacyData, useLegacyList, useModule } from '../../../lib/legacy';
import { useTheme } from '../../../lib/theme';

export default function Notes() {
  const { colors } = useTheme();
  const router = useRouter();
  const legacy = useLegacyData();
  const notes = useLegacyList(legacy.data?.data, 'notes');
  const actions = useModule('notes');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  // La nota nueva se abre cuando ya está en la lista (el cambio optimista tarda un instante).
  const [opening, setOpening] = useState<string | null>(null);
  useEffect(() => {
    if (!opening || !notes.some((n) => n.id === opening)) return;
    setOpening(null);
    router.push({ pathname: '/notas/[id]', params: { id: opening, nueva: '1' } });
  }, [opening, notes, router]);

  const tags = useMemo(() => noteTagList(notes), [notes]);
  const shown = useMemo(() => filterNotes(notes, query, tag), [notes, query, tag]);
  const groups = useMemo(() => groupNotesBySubject(shown), [shown]);
  // Una etiqueta que ya no existe (se borró su nota) deja de filtrar.
  useEffect(() => {
    if (tag && !tags.includes(tag)) setTag('');
  }, [tag, tags]);

  const create = () => {
    const subject = NOTE_DEFAULT_SUBJECT;
    // Como la web: la nota nueva lleva la etiqueta del filtro.
    const note: LegacyNote = { id: newId(), title: NOTE_DEFAULT_TITLE, subject, date: noteDateLabel(), tag: noteTag(subject), excerpt: '', body: '', commit: false, tags: tag, shareId: null };
    actions.add(note);
    setOpening(note.id);
  };

  return (
    <ToolScreen
      title="Notas"
      eyebrow="Conocimiento"
      refreshing={legacy.isRefetching}
      onRefresh={() => legacy.refetch()}
      right={<Button small label="Nueva nota" icon={<Plus size={16} color={colors.onPrimary} />} onPress={create} disabled={!legacy.data} />}
    >
      {legacy.isPending ? (
        <Loading label="Cargando tus notas" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : notes.length === 0 ? (
        <EmptyState title="Aún no tienes notas" action={<Button small variant="secondary" label="Escribir la primera" onPress={create} />}>
          Guarda apuntes en Markdown con títulos, listas, casillas y código, agrupados por materia.
        </EmptyState>
      ) : (
        <>
          <View style={{ gap: space[3] }}>
            <View style={[st.search, { borderColor: colors.lineStrong, backgroundColor: colors.surface }]}>
              <Search size={18} color={colors.inkMuted} />
              <TextInput
                accessibilityLabel="Buscar en tus notas"
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar por título, materia o texto…"
                placeholderTextColor={colors.inkSubtle}
                returnKeyType="search"
                autoCorrect={false}
                maxLength={200}
                style={[typo.body, { flex: 1, color: colors.ink, minHeight: touchTarget }]}
              />
              {query ? (
                <IconButton label="Borrar la búsqueda" onPress={() => setQuery('')} style={{ marginRight: -space[2] }}>
                  <X size={18} color={colors.inkMuted} />
                </IconButton>
              ) : null}
            </View>
            {tags.length > 0 && (
              <DotChoices
                legend="Etiqueta"
                hideLegend
                value={tag}
                onChange={(t) => setTag(t === tag ? '' : t)}
                options={[{ value: '', label: 'Todas', a11yLabel: 'Todas las etiquetas' }, ...tags.map((t) => ({ value: t, label: `#${t}` }))]}
              />
            )}
            {(query.trim() || tag) && (
              <T v="small" tint="muted" accessibilityLiveRegion="polite">
                {plural(shown.length, 'nota encontrada', 'notas encontradas')}
              </T>
            )}
          </View>
          {groups.length === 0 ? (
            <EmptyState title="Ninguna nota coincide">Prueba con otra palabra o quita el filtro de etiqueta.</EmptyState>
          ) : (
            groups.map(([subject, list]) => (
              <View key={subject} style={{ gap: space[3] }}>
                <View style={st.group}>
                  <Dot color={noteColorOf(list[0])} />
                  <T v="heading" accessibilityRole="header" style={{ flexShrink: 1 }}>
                    {subject}
                  </T>
                  <Pill a11yLabel={plural(list.length, 'nota', 'notas')}>{String(list.length)}</Pill>
                </View>
                {list.map((n) => (
                  <NoteCard key={n.id} note={n} onOpen={() => router.push({ pathname: '/notas/[id]', params: { id: n.id } })} />
                ))}
              </View>
            ))
          )}
        </>
      )}
    </ToolScreen>
  );
}

function NoteCard({ note: n, onOpen }: { note: LegacyNote; onOpen: () => void }) {
  const { colors } = useTheme();
  const title = noteTitleOf(n);
  const preview = notePreview(n);
  const tags = splitTags(n.tags).slice(0, 4);
  const date = typeof n.date === 'string' ? n.date : '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${preview || 'Nota vacía'}`}
      accessibilityHint={[date, tags.map((t) => `#${t}`).join(' ')].filter(Boolean).join(' · ') || undefined}
      onPress={onOpen}
      style={({ pressed }) => [pressed && { opacity: 0.75 }]}
    >
      <Card style={[st.card, { borderLeftColor: noteColorOf(n) }]}>
        <T v="heading" numberOfLines={2}>
          {title}
        </T>
        <T v="small" tint="muted" numberOfLines={3}>
          {preview || 'Nota vacía'}
        </T>
        {(date || tags.length > 0) && (
          <View style={st.meta}>
            {date ? (
              <T v="small" tint="subtle">
                {date}
              </T>
            ) : null}
            {tags.map((t) => (
              <T key={t} v="small" tint="primary" style={{ fontFamily: fonts.medium }}>
                #{t}
              </T>
            ))}
          </View>
        )}
      </Card>
    </Pressable>
  );
}

const st = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: space[2], borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space[3] },
  group: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  card: { borderLeftWidth: 4, gap: space[1] },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[3], rowGap: 2, marginTop: space[1] },
});
