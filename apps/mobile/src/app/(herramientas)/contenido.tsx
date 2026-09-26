import {
  CONTENT_PLATFORM_INFO,
  CONTENT_PLATFORMS,
  CONTENT_STAGE_INFO,
  CONTENT_STAGES,
  contentPlatformOf,
  contentStageOf,
  plural,
  type ContentPlatform,
  type ContentStage,
  type LegacyContent,
} from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { CalendarClock, Check, Pencil, Plus } from 'lucide-react-native';
import { Fragment, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { Dot, DotChoices, FormActions, IconButton, Pill, Stats, ToolScreen } from '../../components/tools';
import { Button, Card, EmptyState, ErrorState, Field, Loading, T, fonts } from '../../components/ui';
import { newId, useLegacyData, useLegacyList, useModule } from '../../lib/legacy';
import { useTheme } from '../../lib/theme';

const PLATFORM_OPTIONS = CONTENT_PLATFORMS.map((p) => ({ value: p, label: CONTENT_PLATFORM_INFO[p].label, color: CONTENT_PLATFORM_INFO[p].color }));
const STAGE_OPTIONS = CONTENT_STAGES.map((s) => ({ value: s, label: CONTENT_STAGE_INFO[s].label }));

export default function Content() {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const items = useLegacyList(legacy.data?.data, 'content');
  const actions = useModule('content');
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState<ContentPlatform>('youtube');
  const [editing, setEditing] = useState<LegacyContent | null>(null);
  const published = items.filter((c) => contentStageOf(c) === 'publicado');
  const inProgress = items.filter((c) => contentStageOf(c) !== 'publicado');

  const add = () => {
    if (!title.trim()) return;
    actions.add({ id: newId(), title: title.trim(), stage: 'idea', platform, notes: '', script: '', due: '' });
    setTitle('');
  };

  return (
    <ToolScreen title="Contenido" refreshing={legacy.isRefetching} onRefresh={() => legacy.refetch()}>
      {legacy.isPending ? (
        <Loading label="Cargando tu contenido" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : (
        <>
          <Card>
            <Field label="Nuevo video" value={title} onChangeText={setTitle} maxLength={200} placeholder="Probé 100 apps de IA" returnKeyType="done" onSubmitEditing={add} />
            <DotChoices legend="Plataforma" value={platform} onChange={setPlatform} options={PLATFORM_OPTIONS} />
            <Button label="Añadir" icon={<Plus size={18} color={colors.onPrimary} />} onPress={add} disabled={!title.trim()} />
          </Card>

          {items.length === 0 ? (
            <EmptyState title="Aún no tienes contenido">Apunta tus ideas de video y llévalas del guion a la publicación.</EmptyState>
          ) : (
            <>
              <Stats
                items={[
                  { value: String(items.length), label: 'En total' },
                  { value: String(published.length), label: published.length === 1 ? 'Publicado' : 'Publicados' },
                ]}
              />
              <Card>
                <T v="heading" accessibilityRole="header">
                  Por etapa
                </T>
                <View style={st.pipeline}>
                  {CONTENT_STAGES.map((s, i) => {
                    const n = items.filter((c) => contentStageOf(c) === s).length;
                    return (
                      <View
                        key={s}
                        style={[st.stage, { backgroundColor: i === CONTENT_STAGES.length - 1 ? colors.successSoft : colors.surfaceSunken }]}
                        accessible
                        accessibilityLabel={`${CONTENT_STAGE_INFO[s].label}: ${plural(n, 'video', 'videos')}`}
                      >
                        <T v="heading" style={{ fontVariant: ['tabular-nums'], color: n ? colors.ink : colors.inkSubtle }}>
                          {n}
                        </T>
                        <T v="small" tint="muted" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ fontSize: 12, lineHeight: 16 }}>
                          {CONTENT_STAGE_INFO[s].label}
                        </T>
                      </View>
                    );
                  })}
                </View>
              </Card>
              {[
                { id: 'produccion', label: 'En producción', list: inProgress },
                { id: 'publicados', label: 'Publicados', list: published },
              ].map(
                (g) =>
                  g.list.length > 0 && (
                    <View key={g.id} style={{ gap: space[2] }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                        <T v="heading" accessibilityRole="header">
                          {g.label}
                        </T>
                        <Pill a11yLabel={`${g.list.length} videos`}>{g.list.length}</Pill>
                      </View>
                      <Card style={{ paddingVertical: space[1], gap: 0 }}>
                        {g.list.map((c, i) => (
                          <Fragment key={c.id}>
                            {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />}
                            <ContentRow item={c} onEdit={() => setEditing(c)} />
                          </Fragment>
                        ))}
                      </Card>
                    </View>
                  ),
              )}
            </>
          )}
        </>
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Editar video">
        {editing && <ContentForm item={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </ToolScreen>
  );
}

function ContentRow({ item: c, onEdit }: { item: LegacyContent; onEdit: () => void }) {
  const { colors } = useTheme();
  const actions = useModule('content');
  const platform = CONTENT_PLATFORM_INFO[contentPlatformOf(c)];
  const stage = contentStageOf(c);
  const done = stage === 'publicado';
  const title = c.title || 'Sin título';
  const tone = colors.success;
  return (
    <View style={st.row}>
      {/* Como la app anterior: publicar y despublicar alterna entre «Publicado» y «Guion». */}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`Publicado: «${title}»`}
        onPress={() => actions.update(c.id, { stage: done ? 'guion' : 'publicado' })}
        style={({ pressed }) => [st.checkHit, pressed && { opacity: 0.7 }]}
      >
        <View style={[st.box, { borderColor: done ? tone : colors.lineStrong, backgroundColor: done ? tone : 'transparent' }]}>{done && <Check size={16} strokeWidth={2.5} color={colors.surface} />}</View>
      </Pressable>
      <View style={{ flex: 1, gap: 4, paddingVertical: space[3] }}>
        <View style={st.meta}>
          <View style={st.platform} accessible accessibilityLabel={`Plataforma: ${platform.label}`}>
            <Dot color={platform.color} size={8} />
            <T v="small" tint="muted" style={{ fontFamily: fonts.medium }}>
              {platform.label}
            </T>
          </View>
          <Pill color={done ? colors.success : undefined} a11yLabel={`Etapa: ${CONTENT_STAGE_INFO[stage].label}`}>
            {CONTENT_STAGE_INFO[stage].label}
          </Pill>
          {c.due?.trim() ? (
            <View style={st.platform} accessible accessibilityLabel={`Fecha: ${c.due}`}>
              <CalendarClock size={14} color={colors.inkSubtle} />
              <T v="small" tint="subtle">
                {c.due}
              </T>
            </View>
          ) : null}
        </View>
        <T v="label" tint={done ? 'muted' : 'ink'}>
          {title}
        </T>
        {c.script?.trim() ? (
          <T v="small" tint="muted" numberOfLines={2}>
            {c.script}
          </T>
        ) : null}
      </View>
      <IconButton label={`Editar «${title}»`} onPress={onEdit}>
        <Pencil size={18} color={colors.inkMuted} />
      </IconButton>
    </View>
  );
}

function ContentForm({ item, onDone }: { item: LegacyContent; onDone: () => void }) {
  const actions = useModule('content');
  const [title, setTitle] = useState(item.title ?? '');
  const [platform, setPlatform] = useState<ContentPlatform>(contentPlatformOf(item));
  const [due, setDue] = useState(item.due ?? '');
  const [stage, setStage] = useState<ContentStage>(contentStageOf(item));
  const [script, setScript] = useState(item.script ?? '');
  const [notes, setNotes] = useState(item.notes ?? '');

  const submit = () => {
    actions.update(item.id, { title: title.trim(), platform, due: due.trim(), stage, script, notes });
    onDone();
  };

  return (
    <ScrollView style={{ maxHeight: 620 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <Field label="Título" value={title} onChangeText={setTitle} maxLength={200} />
      <DotChoices legend="Plataforma" value={platform} onChange={setPlatform} options={PLATFORM_OPTIONS} />
      <Field label="Fecha (opcional)" value={due} onChangeText={setDue} maxLength={60} placeholder="12 sep" />
      <DotChoices legend="Etapa" value={stage} onChange={setStage} options={STAGE_OPTIONS} />
      <Field label="Guion" value={script} onChangeText={setScript} multiline maxLength={50_000} placeholder="Gancho, puntos clave y cierre con llamada a la acción." hint="Admite Markdown." style={{ minHeight: 160 }} />
      <Field label="Notas" value={notes} onChangeText={setNotes} multiline maxLength={50_000} placeholder="Ideas de edición, música, tomas…" />
      <FormActions
        submitLabel="Guardar"
        onSubmit={submit}
        disabled={!title.trim()}
        onDelete={() => {
          actions.remove(item.id);
          onDone();
        }}
        confirm={`Se borrará «${item.title || 'este video'}» con su guion y sus notas.`}
      />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  pipeline: { flexDirection: 'row', gap: space[1] },
  stage: { flex: 1, alignItems: 'center', borderRadius: radius.md, paddingVertical: space[2], paddingHorizontal: 2, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  checkHit: { width: touchTarget, minHeight: touchTarget + 16, alignItems: 'flex-start', justifyContent: 'center', paddingTop: space[1] },
  box: { width: 26, height: 26, borderRadius: radius.sm, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] },
  platform: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
