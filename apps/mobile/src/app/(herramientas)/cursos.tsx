import { COURSE_STATUSES, COURSE_STATUS_INFO, courseName, coursesByTopic, courseSource, normalizeCourseUrl, plural, validCourseUrl, type CourseStatus, type LegacyCourse } from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { ExternalLink, GraduationCap, Link2, MonitorPlay, Pencil, Plus } from 'lucide-react-native';
import { Fragment, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { DotChoices, FormActions, IconButton, Pill, Suggestions, ToolScreen } from '../../components/tools';
import { Button, Card, EmptyState, ErrorState, Field, Loading, T, fonts } from '../../components/ui';
import { newId, useLegacyData, useLegacyList, useModule } from '../../lib/legacy';
import { useTheme } from '../../lib/theme';

type Filter = 'todos' | CourseStatus;
const NEXT_STATUS: Record<CourseStatus, CourseStatus> = { pendiente: 'curso', curso: 'hecho', hecho: 'pendiente' };
const statusOf = (c: LegacyCourse): CourseStatus => (COURSE_STATUSES.includes(c.status) ? c.status : 'pendiente');
const FILTER_OPTIONS: Array<{ value: Filter; label: string }> = [{ value: 'todos', label: 'Todos' }, ...COURSE_STATUSES.map((s) => ({ value: s, label: COURSE_STATUS_INFO[s].label }))];

export default function Cursos() {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const courses = useLegacyList(legacy.data?.data, 'courses');
  const actions = useModule('courses');
  const [filter, setFilter] = useState<Filter>('todos');
  // `topic` sin curso: añadir uno nuevo a ese tema.
  const [editing, setEditing] = useState<LegacyCourse | { topic: string } | null>(null);
  const groups = coursesByTopic(courses.filter((c) => filter === 'todos' || statusOf(c) === filter));
  const topics = coursesByTopic(courses).map((g) => g.topic);
  const pending = courses.filter((c) => statusOf(c) !== 'hecho').length;

  return (
    <ToolScreen
      title="Cursos"
      refreshing={legacy.isRefetching}
      onRefresh={() => legacy.refetch()}
      right={<Button small label="Nuevo curso" icon={<Plus size={16} color={colors.onPrimary} />} onPress={() => setEditing({ topic: '' })} disabled={!legacy.data} />}
    >
      {legacy.isPending ? (
        <Loading label="Cargando tus cursos" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : courses.length === 0 ? (
        <EmptyState title="Anota lo que quieres aprender" action={<Button label="Añadir el primero" icon={<Plus size={18} color={colors.onPrimary} />} onPress={() => setEditing({ topic: '' })} />}>
          Escribe un tema y pega el enlace del curso o del video: YouTube, Udemy, Coursera, Platzi o cualquier página. Lo abres desde aquí cuando quieras estudiar.
        </EmptyState>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
            <Pill a11yLabel={plural(pending, 'curso por ver', 'cursos por ver')}>{plural(pending, 'por ver', 'por ver')}</Pill>
          </View>
          <DotChoices legend="Estado" hideLegend value={filter} onChange={setFilter} options={FILTER_OPTIONS} />
          {groups.length === 0 ? (
            <EmptyState title={`Nada en «${COURSE_STATUS_INFO[filter as CourseStatus].label}»`}>Cambia el estado de un curso con el botón que tiene al lado.</EmptyState>
          ) : (
            groups.map((g) => (
              <TopicCard
                key={g.topic}
                topic={g.topic}
                items={g.items}
                onEdit={setEditing}
                onAdd={() => setEditing({ topic: g.topic })}
                onStatus={(c) => actions.update(c.id, { status: NEXT_STATUS[statusOf(c)] })}
              />
            ))
          )}
        </>
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing && 'id' in editing ? 'Editar curso' : 'Nuevo curso'}>
        {editing && <CourseForm course={'id' in editing ? editing : null} topic={editing.topic} topics={topics} onDone={() => setEditing(null)} />}
      </Sheet>
    </ToolScreen>
  );
}

function TopicCard({ topic, items, onEdit, onAdd, onStatus }: { topic: string; items: LegacyCourse[]; onEdit: (c: LegacyCourse) => void; onAdd: () => void; onStatus: (c: LegacyCourse) => void }) {
  const { colors } = useTheme();
  const done = items.filter((c) => statusOf(c) === 'hecho').length;
  return (
    <Card style={[st.card, { borderLeftColor: colors.primary }]}>
      <View style={st.head}>
        <T v="heading" accessibilityRole="header" style={{ flex: 1 }}>
          {topic}
        </T>
        <T v="small" tint="muted" style={{ fontVariant: ['tabular-nums'] }}>
          {done} de {items.length}
        </T>
      </View>
      <View>
        {items.map((c, k) => (
          <Fragment key={c.id}>
            {k > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />}
            <CourseRow course={c} onEdit={() => onEdit(c)} onStatus={() => onStatus(c)} />
          </Fragment>
        ))}
      </View>
      <View style={{ alignItems: 'flex-start' }}>
        <Button small variant="ghost" label={`Añadir a ${topic}`} icon={<Plus size={16} color={colors.primary} />} onPress={onAdd} />
      </View>
    </Card>
  );
}

function CourseRow({ course: c, onEdit, onStatus }: { course: LegacyCourse; onEdit: () => void; onStatus: () => void }) {
  const { colors } = useTheme();
  const source = courseSource(c.url);
  const name = courseName(c);
  const status = statusOf(c);
  const Icon = !source ? GraduationCap : source.video ? MonitorPlay : Link2;
  const meta = [source?.label, c.notes.split('\n')[0]].filter(Boolean).join(' · ');
  const open = () => {
    if (validCourseUrl(c.url)) Linking.openURL(c.url).catch(() => undefined);
  };
  const body = (
    <>
      <Icon size={18} color={colors.inkMuted} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <T v="label" style={[{ flexShrink: 1 }, status === 'hecho' && { color: colors.inkMuted, textDecorationLine: 'line-through' }]}>
            {name}
          </T>
          {c.url ? <ExternalLink size={14} color={colors.inkMuted} /> : null}
        </View>
        {meta ? (
          <T v="small" tint="muted" numberOfLines={1}>
            {meta}
          </T>
        ) : null}
      </View>
    </>
  );
  return (
    <View style={st.row}>
      {c.url ? (
        <Pressable accessibilityRole="link" accessibilityLabel={`${name}${source ? `, en ${source.label}` : ''}. Abrir`} onPress={open} style={({ pressed }) => [st.main, pressed && { opacity: 0.7 }]}>
          {body}
        </Pressable>
      ) : (
        <View style={st.main}>{body}</View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Estado de «${name}»: ${COURSE_STATUS_INFO[status].label}. Cambiar a ${COURSE_STATUS_INFO[NEXT_STATUS[status]].label}`}
        onPress={onStatus}
        hitSlop={6}
        style={({ pressed }) => [
          st.status,
          status === 'curso'
            ? { borderColor: colors.primary, backgroundColor: colors.primarySoft }
            : status === 'hecho'
              ? { borderColor: 'transparent', backgroundColor: colors.surfaceSunken }
              : { borderColor: colors.lineStrong },
          pressed && { opacity: 0.7 },
        ]}
      >
        <T v="small" tint={status === 'curso' ? 'primary' : status === 'hecho' ? 'ink' : 'muted'} style={{ fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 }}>
          {COURSE_STATUS_INFO[status].short}
        </T>
      </Pressable>
      <IconButton label={`Editar «${name}»`} onPress={onEdit} style={{ marginRight: -space[2] }}>
        <Pencil size={18} color={colors.inkMuted} />
      </IconButton>
    </View>
  );
}

function CourseForm({ course, topic: initialTopic, topics, onDone }: { course: LegacyCourse | null; topic: string; topics: string[]; onDone: () => void }) {
  const actions = useModule('courses');
  const [topic, setTopic] = useState(course?.topic ?? initialTopic);
  const [url, setUrl] = useState(course?.url ?? '');
  const [title, setTitle] = useState(course?.title ?? '');
  const [status, setStatus] = useState<CourseStatus>(course ? statusOf(course) : 'pendiente');
  const [notes, setNotes] = useState(course?.notes ?? '');
  const link = normalizeCourseUrl(url);
  const badUrl = !validCourseUrl(link);
  const source = !badUrl ? courseSource(link) : null;

  const submit = () => {
    const fields = { topic: topic.trim(), url: link, title: title.trim(), status, notes };
    if (course) actions.update(course.id, fields);
    else actions.add({ id: newId(), ...fields });
    onDone();
  };

  return (
    <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <Field label="Tema" value={topic} onChangeText={setTopic} maxLength={120} placeholder="Inglés, React, Finanzas…" autoFocus={!initialTopic && !course} />
      <Suggestions field="Tema" values={topics} current={topic} onPick={setTopic} />
      <Field
        label="Enlace (opcional)"
        value={url}
        onChangeText={setUrl}
        onBlur={() => setUrl(link)}
        maxLength={2000}
        placeholder="https://youtube.com/…"
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        hint={source ? `Se abrirá en ${source.label}.` : 'De YouTube, Udemy, Coursera, Platzi o cualquier página.'}
        error={url.trim() && badUrl ? 'Pega un enlace completo, por ejemplo https://youtube.com/watch?v=…' : null}
      />
      <Field label="Nombre (opcional)" value={title} onChangeText={setTitle} maxLength={200} placeholder="Curso completo de inglés básico" />
      <DotChoices legend="Estado" value={status} onChange={setStatus} options={COURSE_STATUSES.map((s) => ({ value: s, label: COURSE_STATUS_INFO[s].label }))} />
      <Field label="Notas (opcional)" value={notes} onChangeText={setNotes} maxLength={5000} multiline placeholder="Voy en la lección 4…" />
      <FormActions
        submitLabel={course ? 'Guardar' : 'Añadir curso'}
        onSubmit={submit}
        disabled={!topic.trim() || (!!url.trim() && badUrl)}
        onDelete={
          course
            ? () => {
                actions.remove(course.id);
                onDone();
              }
            : undefined
        }
        confirm={course ? `Se borrará «${courseName(course)}».` : undefined}
      />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  card: { borderLeftWidth: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: touchTarget + 8 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2] },
  status: { minWidth: 64, minHeight: 32, paddingHorizontal: space[3], borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
