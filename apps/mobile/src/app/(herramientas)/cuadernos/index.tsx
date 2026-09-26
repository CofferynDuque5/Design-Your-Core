import { legacySubjectNames, NOTEBOOK_COLORS, plural, safeColor, uniqueTexts, type LegacyNotebook } from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { useRouter, type Href } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { NotebookForm, NotebookTags } from '../../../components/notebooks';
import { Sheet } from '../../../components/Sheet';
import { tint, ToolScreen } from '../../../components/tools';
import { Button, EmptyState, ErrorState, Loading, T, fonts } from '../../../components/ui';
import { useLegacyData, useLegacyList } from '../../../lib/legacy';
import { useTheme } from '../../../lib/theme';

export default function Notebooks() {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const notebooks = useLegacyList(legacy.data?.data, 'notebooks');
  const boxes = useLegacyList(legacy.data?.data, 'noteBoxes');
  const [creating, setCreating] = useState(false);
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');

  // Filtros en cascada Categoría → Materia → Tema, con los valores que existen (como la app anterior).
  const inCategory = notebooks.filter((n) => !category || n.category === category);
  const inSubject = inCategory.filter((n) => !subject || n.subject === subject);
  const shown = inSubject.filter((n) => !topic || n.topic === topic);
  const filtering = !!(category || subject || topic);
  const subjects = uniqueTexts(inCategory.map((n) => n.subject));
  const topics = uniqueTexts(inSubject.map((n) => n.topic));

  return (
    <ToolScreen
      title="Cuadernos"
      refreshing={legacy.isRefetching}
      onRefresh={() => legacy.refetch()}
      right={<Button small label="Nuevo cuaderno" icon={<Plus size={16} color={colors.onPrimary} />} onPress={() => setCreating(true)} disabled={!legacy.data} />}
    >
      {legacy.isPending ? (
        <Loading label="Cargando tus cuadernos" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : notebooks.length === 0 ? (
        <EmptyState title="Aún no tienes cuadernos">Organiza tus apuntes por categoría, materia y tema, y guárdalos en cajitas de texto o de código fáciles de copiar.</EmptyState>
      ) : (
        <>
          <View style={{ gap: space[3] }} accessibilityLabel="Filtrar cuadernos">
            <FilterRow
              legend="Categoría"
              all="Todas"
              values={uniqueTexts(notebooks.map((n) => n.category))}
              value={category}
              onChange={(v) => {
                setCategory(v);
                setSubject('');
                setTopic('');
              }}
            />
            {(subjects.length > 0 || subject) && (
              <FilterRow
                legend="Materia"
                all="Todas"
                values={subjects}
                value={subject}
                onChange={(v) => {
                  setSubject(v);
                  setTopic('');
                }}
              />
            )}
            {(topics.length > 0 || topic) && <FilterRow legend="Tema" all="Todos" values={topics} value={topic} onChange={setTopic} />}
            {filtering && (
              <Button
                small
                variant="link"
                label="Limpiar filtros"
                onPress={() => {
                  setCategory('');
                  setSubject('');
                  setTopic('');
                }}
                style={{ alignSelf: 'flex-start', marginTop: -space[2] }}
              />
            )}
          </View>
          {shown.length === 0 ? (
            <EmptyState title="Ningún cuaderno con estos filtros" />
          ) : (
            // De dos en dos; si quedan impares, el último conserva el ancho de media columna.
            <View style={{ gap: space[3] }}>
              {Array.from({ length: Math.ceil(shown.length / 2) }, (_, r) => shown.slice(r * 2, r * 2 + 2)).map((row) => (
                <View key={row[0].id} style={st.row}>
                  {row.map((n) => (
                    <NotebookCard key={n.id} notebook={n} count={boxes.filter((b) => b.notebookId === n.id).length} />
                  ))}
                  {row.length === 1 && <View style={{ flex: 1 }} />}
                </View>
              ))}
            </View>
          )}
        </>
      )}
      <Sheet open={creating} onClose={() => setCreating(false)} title="Nuevo cuaderno">
        {creating && <NotebookForm notebook={null} all={notebooks} subjects={legacySubjectNames(legacy.data?.data)} onDone={() => setCreating(false)} />}
      </Sheet>
    </ToolScreen>
  );
}

/** Una fila de fichas deslizable por filtro (sin selectores nativos). */
function FilterRow({ legend, all, values, value, onChange }: { legend: string; all: string; values: string[]; value: string; onChange: (v: string) => void }) {
  const { colors } = useTheme();
  const options = ['', ...values, ...(value && !values.includes(value) ? [value] : [])];
  return (
    <View style={{ gap: space[1] }}>
      <T v="eyebrow" tint="muted">
        {legend}
      </T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }} style={{ marginHorizontal: -space[5] }}>
        <View accessibilityRole="radiogroup" accessibilityLabel={legend} style={{ flexDirection: 'row', gap: space[2], paddingHorizontal: space[5] }}>
          {options.map((v) => {
            const on = v === value;
            return (
              <Pressable
                key={v || '·'}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${legend}: ${v || all}`}
                onPress={() => onChange(v)}
                style={[st.filter, { borderColor: on ? colors.primary : colors.lineStrong, backgroundColor: on ? colors.primarySoft : colors.surface }]}
              >
                <T v="small" style={{ fontFamily: fonts.medium, color: on ? colors.primary : colors.inkMuted }}>
                  {v || all}
                </T>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function NotebookCard({ notebook: n, count }: { notebook: LegacyNotebook; count: number }) {
  const router = useRouter();
  const { colors, name } = useTheme();
  const color = safeColor(n.color, NOTEBOOK_COLORS[0]);
  const title = n.title || 'Cuaderno';
  const tags = [n.category || 'General', n.subject, n.topic].filter(Boolean).join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${tags}. ${plural(count, 'cajita', 'cajitas')}`}
      accessibilityHint="Abre el cuaderno"
      onPress={() => router.push(`/cuadernos/${encodeURIComponent(n.id)}` as Href)}
      style={({ pressed }) => [st.card, { backgroundColor: colors.surface, borderColor: colors.line, opacity: pressed ? 0.8 : 1 }]}
    >
      <View style={[st.cover, { backgroundColor: tint(color, colors.surface, name === 'dark' ? 0.32 : 0.2), borderBottomColor: color }]}>
        <T v="title" style={{ fontSize: 34, lineHeight: 42 }}>
          {n.emoji || '📓'}
        </T>
      </View>
      <View style={{ padding: space[3], gap: space[2], flex: 1 }}>
        <T v="label" numberOfLines={2} style={{ fontFamily: fonts.semibold }}>
          {title}
        </T>
        <NotebookTags notebook={n} />
        <T v="small" tint="muted" style={{ marginTop: 'auto' }}>
          {plural(count, 'cajita', 'cajitas')}
        </T>
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  filter: { minHeight: touchTarget - 4, justifyContent: 'center', paddingHorizontal: space[3], borderRadius: radius.pill, borderWidth: 1 },
  row: { flexDirection: 'row', gap: space[3] },
  card: { flex: 1, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  cover: { height: 84, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3 },
});
