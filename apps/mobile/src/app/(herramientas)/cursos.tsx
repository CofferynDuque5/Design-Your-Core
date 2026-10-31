import {
  CLASS_COLORS,
  CLASS_DAY_NAMES,
  COURSE_STATUSES,
  COURSE_STATUS_INFO,
  courseClasses,
  courseName,
  courseProgress,
  courseResume,
  coursePlaybackPatch,
  coursesByTopic,
  courseSource,
  HHMM_RE,
  normalizeCourseUrl,
  normalizeHHMM,
  plural,
  validCourseUrl,
  youtubeRef,
  type CourseStatus,
  type LegacyCourse,
} from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarPlus, ExternalLink, Gauge, GraduationCap, Link2, MonitorPlay, Pencil, Play, Plus } from 'lucide-react-native';
import { Fragment, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { DotChoices, FormActions, IconButton, Pill, Suggestions, TimeField, ToolScreen, WeekdayPicker } from '../../components/tools';
import { Button, Card, EmptyState, ErrorState, Field, Loading, T, fonts } from '../../components/ui';
import { YouTubeView, type YouTubeViewHandle } from '../../components/YouTubeView';
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
  const [watching, setWatching] = useState<string | null>(null);
  const [logging, setLogging] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const router = useRouter();
  const { abrir } = useLocalSearchParams<{ abrir?: string }>();
  // Al volver a la app después de abrir un curso de Udemy, Coursera…: pregunta hasta dónde llegaste.
  const away = useRef<string | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && away.current) {
        setLogging(away.current);
        away.current = null;
      }
    });
    return () => sub.remove();
  }, []);
  // «/cursos?abrir=<id>» (desde el Horario o un aviso): abre el curso.
  useEffect(() => {
    if (!abrir || !legacy.data) return;
    const c = courses.find((x) => x.id === abrir);
    if (c) {
      if (canWatch(c)) setWatching(c.id);
      else setLogging(c.id);
    }
    router.setParams({ abrir: undefined });
  }, [abrir, legacy.data, courses, router]);
  const open = (c: LegacyCourse) => {
    if (canWatch(c)) return setWatching(c.id);
    if (!validCourseUrl(c.url) || !c.url) return;
    away.current = c.id;
    actions.update(c.id, { lastAt: new Date().toISOString(), ...(statusOf(c) === 'pendiente' ? { status: 'curso' as const } : {}) });
    Linking.openURL(c.url).catch(() => undefined);
  };
  const byId = (id: string | null) => (id ? courses.find((c) => c.id === id) : undefined);
  const watched = byId(watching);
  const logged = byId(logging);
  const scheduled = byId(scheduling);

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
                onOpen={open}
                onLog={(c) => setLogging(c.id)}
                onSchedule={(c) => setScheduling(c.id)}
                classes={(c) => courseClasses(legacy.data?.data, c.id)}
              />
            ))
          )}
        </>
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing && 'id' in editing ? 'Editar curso' : 'Nuevo curso'}>
        {editing && <CourseForm course={'id' in editing ? editing : null} topic={editing.topic} topics={topics} onDone={() => setEditing(null)} />}
      </Sheet>
      {watched && <Watch course={watched} onClose={() => setWatching(null)} />}
      <Sheet open={!!logged} onClose={() => setLogging(null)} title="¿Hasta dónde llegaste?">
        {logged && <ProgressForm course={logged} onDone={() => setLogging(null)} />}
      </Sheet>
      <Sheet open={!!scheduled} onClose={() => setScheduling(null)} title="Agregar al horario">
        {scheduled && <ScheduleForm course={scheduled} count={(legacy.data?.data.classes as unknown[] | undefined)?.length ?? 0} onDone={() => setScheduling(null)} />}
      </Sheet>
    </ToolScreen>
  );
}

// En la vista web (capturas) no hay WebView: el video se abre en YouTube.
const canWatch = (c: LegacyCourse) => Platform.OS !== 'web' && !!youtubeRef(c.url);

interface RowActions {
  onEdit: (c: LegacyCourse) => void;
  onStatus: (c: LegacyCourse) => void;
  onOpen: (c: LegacyCourse) => void;
  onLog: (c: LegacyCourse) => void;
  onSchedule: (c: LegacyCourse) => void;
  classes: (c: LegacyCourse) => Array<{ day: number; start: string }>;
}

function TopicCard({ topic, items, onAdd, ...row }: { topic: string; items: LegacyCourse[]; onAdd: () => void } & RowActions) {
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
            <CourseRow course={c} {...row} />
          </Fragment>
        ))}
      </View>
      <View style={{ alignItems: 'flex-start' }}>
        <Button small variant="ghost" label={`Añadir a ${topic}`} icon={<Plus size={16} color={colors.primary} />} onPress={onAdd} />
      </View>
    </Card>
  );
}

const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
/** «Lun y Mié 18:00» */
export function scheduleText(list: Array<{ day: number; start: string }>): string {
  if (!list.length) return '';
  const sorted = [...list].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
  const days = [...new Set(sorted.map((k) => DAY_SHORT[k.day - 1]))];
  const times = [...new Set(sorted.map((k) => k.start))];
  const d = days.length > 1 ? `${days.slice(0, -1).join(', ')} y ${days.at(-1)}` : days[0];
  return times.length === 1 ? `${d} ${times[0]}` : d;
}

function CourseRow({ course: c, onEdit, onStatus, onOpen, onLog, onSchedule, classes }: { course: LegacyCourse } & RowActions) {
  const { colors } = useTheme();
  const router = useRouter();
  const source = courseSource(c.url);
  const name = courseName(c);
  const status = statusOf(c);
  const watch = canWatch(c);
  const Icon = !source ? GraduationCap : source.video ? MonitorPlay : Link2;
  const meta = [source?.label, c.notes.split('\n')[0]].filter(Boolean).join(' · ');
  const pct = courseProgress(c);
  const resume = courseResume(c);
  const inSchedule = scheduleText(classes(c));
  const body = (
    <>
      <Icon size={18} color={colors.inkMuted} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <T v="label" style={[{ flexShrink: 1 }, status === 'hecho' && { color: colors.inkMuted, textDecorationLine: 'line-through' }]}>
            {name}
          </T>
          {c.url ? watch ? <Play size={14} color={colors.primary} /> : <ExternalLink size={14} color={colors.inkMuted} /> : null}
        </View>
        {meta ? (
          <T v="small" tint="muted" numberOfLines={1}>
            {meta}
          </T>
        ) : null}
        {(pct > 0 || !!resume) && status !== 'hecho' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }} accessibilityLabel={`Avance de «${name}»`} style={[st.bar, { backgroundColor: colors.surfaceSunken }]}>
              <View style={{ width: `${pct}%`, height: '100%', borderRadius: 3, backgroundColor: colors.primary }} />
            </View>
            <T v="small" tint="muted" style={{ flexShrink: 1 }}>
              {resume || `${pct} %`}
            </T>
          </View>
        )}
      </View>
    </>
  );
  const label = watch ? `${pct > 0 && status !== 'hecho' ? 'Continuar' : 'Ver'} «${name}» aquí` : `${name}${source ? `, en ${source.label}` : ''}. Abrir`;
  return (
    <View style={{ gap: 2, paddingBottom: inSchedule ? space[2] : 0 }}>
      <View style={st.row}>
        {c.url ? (
          <Pressable accessibilityRole={watch ? 'button' : 'link'} accessibilityLabel={label} onPress={() => onOpen(c)} style={({ pressed }) => [st.main, pressed && { opacity: 0.7 }]}>
            {body}
          </Pressable>
        ) : (
          <View style={st.main}>{body}</View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Estado de «${name}»: ${COURSE_STATUS_INFO[status].label}. Cambiar a ${COURSE_STATUS_INFO[NEXT_STATUS[status]].label}`}
          onPress={() => onStatus(c)}
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
        <IconButton label={`Editar «${name}»`} onPress={() => onEdit(c)} style={{ marginRight: -space[2] }}>
          <Pencil size={18} color={colors.inkMuted} />
        </IconButton>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[1], marginLeft: 30 }}>
        {!watch && !!c.url && <Button small variant="ghost" label="Anotar avance" accessibilityLabel={`Anotar avance de «${name}»`} icon={<Gauge size={16} color={colors.primary} />} onPress={() => onLog(c)} />}
        <Button small variant="ghost" label="Al horario" accessibilityLabel={`Agregar «${name}» al horario`} icon={<CalendarPlus size={16} color={colors.primary} />} onPress={() => onSchedule(c)} />
        {!!inSchedule && (
          <Pressable accessibilityRole="link" accessibilityLabel={`En tu horario: ${inSchedule}`} onPress={() => router.push('/horario')} hitSlop={8}>
            <T v="small" tint="primary">
              En tu horario: {inSchedule}
            </T>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** El video de YouTube dentro de la app: empieza donde lo dejaste y guarda al pausar o cerrar. */
function Watch({ course: c, onClose }: { course: LegacyCourse; onClose: () => void }) {
  const { colors } = useTheme();
  const actions = useModule('courses');
  const ref = youtubeRef(c.url)!;
  const video = c.video || ref.video;
  const start = c.position && (!c.video || c.video === video) && courseProgress(c) < 100 ? Math.max(0, c.position - 3) : ref.start;
  const latest = useRef(c);
  latest.current = c;
  const player = useRef<YouTubeViewHandle>(null);
  const closing = useRef(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const save = (s: { position: number; duration: number; video?: string; index?: number; count?: number }) => {
    const patch = coursePlaybackPatch(latest.current, s);
    actions.update(c.id, patch);
    setSaved(courseResume({ ...latest.current, ...patch } as LegacyCourse));
    if (closing.current) onClose();
  };
  // Al cerrar se pide la posición actual; si no llega enseguida, se cierra igual.
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    player.current?.snapshot();
    setTimeout(onClose, 700);
  };
  return (
    <Sheet open onClose={close} title={courseName(c)}>
      <View style={{ gap: space[3] }}>
        <YouTubeView ref={player} video={video} list={ref.list} start={start} title={courseName(c)} onProgress={save} onError={() => setFailed(true)} />
        <T v="small" tint={failed ? 'danger' : 'muted'} accessibilityLiveRegion="polite">
          {failed
            ? 'Este video no se puede ver aquí. Ábrelo en YouTube.'
            : saved
              ? `Guardado: ${saved}.`
              : c.position
                ? `${courseResume(c)}: sigue desde ahí. Se guarda cada vez que pausas.`
                : 'Se guarda dónde lo pausas, para seguir después desde aquí o desde la web.'}
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          <Button label="Cerrar" onPress={close} />
          <Button variant="ghost" label="Abrir en YouTube" icon={<ExternalLink size={16} color={colors.primary} />} onPress={() => Linking.openURL(c.url).catch(() => undefined)} />
        </View>
      </View>
    </Sheet>
  );
}

/** Udemy, Coursera…: no dicen cuánto viste, así que lo anotas tú al volver. */
const STEPS = [0, 10, 25, 40, 50, 60, 75, 90, 100];
function ProgressForm({ course: c, onDone }: { course: LegacyCourse; onDone: () => void }) {
  const actions = useModule('courses');
  const [spot, setSpot] = useState(c.spot ?? '');
  const now = courseProgress(c);
  const [pct, setPct] = useState(STEPS.reduce((a, b) => (Math.abs(b - now) < Math.abs(a - now) ? b : a), 0));
  const submit = () => {
    actions.update(c.id, { spot: spot.trim(), progress: pct, lastAt: new Date().toISOString(), status: pct >= 100 ? 'hecho' : 'curso' });
    onDone();
  };
  return (
    <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <T v="small" tint="muted">
        «{courseName(c)}» se abre en {courseSource(c.url)?.label ?? 'otra página'}, que no le cuenta a Design Your Core cuánto viste. Anótalo aquí y lo verás la próxima vez.
      </T>
      <Field label="Dónde lo dejaste (opcional)" value={spot} onChangeText={setSpot} maxLength={200} placeholder="Lección 12, módulo 3…" />
      <DotChoices legend="Avance" value={String(pct)} onChange={(v) => setPct(Number(v))} options={STEPS.map((n) => ({ value: String(n), label: `${n} %` }))} />
      <View style={{ gap: space[2] }}>
        <Button label="Guardar avance" onPress={submit} />
        <Button variant="ghost" label="Ahora no" onPress={onDone} />
      </View>
    </ScrollView>
  );
}

/** Crea clases del Horario para estudiar el curso cada semana. */
function ScheduleForm({ course: c, count, onDone }: { course: LegacyCourse; count: number; onDone: () => void }) {
  const actions = useModule('classes');
  const [days, setDays] = useState('');
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('19:00');
  const s = normalizeHHMM(start);
  const e = normalizeHHMM(end);
  const badTime = !HHMM_RE.test(s) || !HHMM_RE.test(e) || e <= s;
  const submit = () => {
    const color = CLASS_COLORS[count % CLASS_COLORS.length];
    for (const d of days.split('').map(Number)) {
      actions.add({ id: newId(), day: d, start: s, end: e, title: courseName(c).slice(0, 120), room: (courseSource(c.url)?.label ?? '').slice(0, 60), color, subject: '', course: c.id });
    }
    onDone();
  };
  return (
    <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <T v="small" tint="muted">
        Se añade a tu Horario los días que elijas. Desde ahí lo abres con un toque y, si activas los avisos en Perfil, te avisamos antes de empezar.
      </T>
      <WeekdayPicker legend="Días" value={days} onChange={setDays} hint={days ? days.split('').map((d) => CLASS_DAY_NAMES[Number(d) - 1]).join(', ') : 'Elige uno o más días.'} />
      <TimeField label="Empieza" value={start} onChange={setStart} />
      <TimeField label="Termina" value={end} onChange={setEnd} hint={HHMM_RE.test(s) && HHMM_RE.test(e) && e <= s ? 'Debe ser después de la hora de inicio.' : undefined} />
      <Button label="Agregar al horario" onPress={submit} disabled={!days || badTime} />
    </ScrollView>
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
  bar: { width: 64, height: 6, borderRadius: 3, overflow: 'hidden' },
  status: { minWidth: 64, minHeight: 32, paddingHorizontal: space[3], borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
