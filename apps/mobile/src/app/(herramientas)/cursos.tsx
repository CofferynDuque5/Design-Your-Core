import {
  CLASS_COLORS,
  CLASS_DAY_NAMES,
  COURSE_STATUSES,
  COURSE_STATUS_INFO,
  courseClasses,
  courseName,
  courseProgress,
  courseRemaining,
  formatLength,
  courseLevel,
  courseRoute,
  COURSE_LEVEL_LABEL,
  handoffClasses,
  planTopics,
  STUDY_SESSIONS,
  STUDY_WEEKLY,
  courseResume,
  coursePlaybackPatch,
  coursesBySubtopic,
  coursesByTopic,
  courseOrigin,
  courseSource,
  HHMM_RE,
  normalizeCourseUrl,
  normalizeHHMM,
  plural,
  validCourseUrl,
  youtubeRef,
  type CourseLength,
  type CourseLengthFrom,
  type CourseStatus,
  type LegacyCourse,
} from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarClock, CalendarPlus, ExternalLink, Gauge, GraduationCap, Link2, MonitorPlay, Pencil, Play, Plus } from 'lucide-react-native';
import { Fragment, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { DotChoices, FormActions, IconButton, Pill, Suggestions, TimeField, Toggle, ToolScreen, WeekdayPicker } from '../../components/tools';
import { Button, Card, EmptyState, ErrorState, Field, Loading, T, fonts } from '../../components/ui';
import { YouTubeLengthReader, YouTubeView, type LengthFound, type YouTubeViewHandle } from '../../components/YouTubeView';
import { api } from '../../lib/api';
import { newId, useLegacyData, useLegacyList, useModule } from '../../lib/legacy';
import { useToast } from '../../lib/toast';
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
  const update = useCourseUpdate();
  const [filter, setFilter] = useState<Filter>('todos');
  // `topic` sin curso: añadir uno nuevo a ese tema.
  const [editing, setEditing] = useState<LegacyCourse | { topic: string } | null>(null);
  const groups = coursesByTopic(courses.filter((c) => filter === 'todos' || statusOf(c) === filter));
  const topics = coursesByTopic(courses).map((g) => g.topic);
  const pending = courses.filter((c) => statusOf(c) !== 'hecho').length;
  const [watching, setWatching] = useState<string | null>(null);
  const [logging, setLogging] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
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
    update(c, { lastAt: new Date().toISOString(), ...(statusOf(c) === 'pendiente' ? { status: 'curso' as const } : {}) });
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
            {pending > 0 && <Button small variant="secondary" label="Crear horario" icon={<CalendarClock size={16} color={colors.primary} />} onPress={() => setPlanning(true)} />}
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
                all={coursesByTopic(courses).find((x) => x.topic.toLocaleLowerCase('es') === g.topic.toLocaleLowerCase('es'))?.items ?? g.items}
                onEdit={setEditing}
                onAdd={() => setEditing({ topic: g.topic })}
                onStatus={(c) => update(c, { status: NEXT_STATUS[statusOf(c)] })}
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
        {editing && <CourseForm course={'id' in editing ? editing : null} topic={editing.topic} topics={topics} courses={courses} onDone={() => setEditing(null)} />}
      </Sheet>
      {watched && <Watch course={watched} onClose={() => setWatching(null)} />}
      <Sheet open={!!logged} onClose={() => setLogging(null)} title="¿Hasta dónde llegaste?">
        {logged && <ProgressForm course={logged} onDone={() => setLogging(null)} />}
      </Sheet>
      <Sheet open={planning} onClose={() => setPlanning(false)} title="Crear horario">
        {planning && <StudyPlanner courses={courses} onDone={() => setPlanning(false)} />}
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

function TopicCard({ topic, items, all, onAdd, ...row }: { topic: string; items: LegacyCourse[]; all: LegacyCourse[]; onAdd: () => void } & RowActions) {
  const { colors } = useTheme();
  // Ruta del tema con todos sus cursos (aunque el filtro oculte algunos).
  const route = courseRoute(all);
  const next = route.find((c) => statusOf(c) !== 'hecho');
  const shown = route.filter((c) => items.includes(c));
  const done = all.filter((c) => statusOf(c) === 'hecho').length;
  return (
    <Card style={[st.card, { borderLeftColor: colors.primary }]}>
      <View style={st.head}>
        <T v="heading" accessibilityRole="header" style={{ flex: 1 }}>
          {topic}
        </T>
        <T v="small" tint="muted" style={{ fontVariant: ['tabular-nums'] }}>
          {done} de {all.length}
        </T>
      </View>
      {all.length > 2 && (
        <T v="small" tint="muted">
          En orden: lo que empezaste y de lo básico a lo avanzado.
        </T>
      )}
      {coursesBySubtopic(shown).map((g) => (
        <View key={g.subtopic || '-'}>
          {!!g.subtopic && (
            <T v="small" tint="primary" accessibilityRole="header" style={[st.sub, { borderBottomColor: colors.line }]}>
              {g.subtopic.toLocaleUpperCase('es')}
            </T>
          )}
          {g.items.map((c, k) => (
            <Fragment key={c.id}>
              {k > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />}
              <CourseRow course={c} next={all.length > 1 && c === next} {...row} />
            </Fragment>
          ))}
        </View>
      ))}
      <View style={{ alignItems: 'flex-start' }}>
        <Button small variant="ghost" label={`Añadir a ${topic}`} icon={<Plus size={16} color={colors.primary} />} onPress={onAdd} />
      </View>
    </Card>
  );
}

/** «4 h 30 min» o, si la página solo da una cifra aproximada, «unas 20 h». */
const lengthLabel = (c: LegacyCourse): string => (c.length ? `${c.lengthFrom === 'aprox' ? 'unas ' : ''}${formatLength(c.length)}` : '');
const levelLabel = (c: LegacyCourse) => COURSE_LEVEL_LABEL[courseLevel(c).level];

/**
 * Guarda cambios de un curso. Si acaba de quedar «hecho», sus clases del
 * Horario pasan al siguiente curso del tema.
 */
function useCourseUpdate() {
  const legacy = useLegacyData();
  const courses = useModule('courses');
  const classes = useModule('classes');
  const toast = useToast();
  return (c: LegacyCourse, patch: Partial<LegacyCourse>) => {
    courses.update(c.id, patch);
    if (patch.status !== 'hecho' || c.status === 'hecho') return;
    const { next, patches } = handoffClasses(legacy.data?.data, c.id);
    if (!next || !patches.length) return;
    for (const k of patches) classes.update(k.id, k.patch);
    toast(`Terminaste «${courseName(c)}». Tus clases siguen con «${courseName(next)}».`);
  };
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

function CourseRow({ course: c, next, onEdit, onStatus, onOpen, onLog, onSchedule, classes }: { course: LegacyCourse; next?: boolean } & RowActions) {
  const { colors } = useTheme();
  const router = useRouter();
  const source = courseSource(c.url);
  const name = courseName(c);
  const status = statusOf(c);
  const watch = canWatch(c);
  const Icon = !source ? GraduationCap : source.video ? MonitorPlay : Link2;
  const meta = [levelLabel(c), c.source?.trim(), source?.label, lengthLabel(c), c.notes.split('\n')[0]].filter(Boolean).join(' · ');
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          {next && (
            <View style={[st.next, { backgroundColor: colors.primary }]}>
              <T v="small" style={{ color: colors.onPrimary, fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14 }}>
                Sigue
              </T>
            </View>
          )}
          <T v="small" tint="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
            {meta}
          </T>
        </View>
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
  const update = useCourseUpdate();
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
    update(latest.current, patch);
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
  const update = useCourseUpdate();
  const [spot, setSpot] = useState(c.spot ?? '');
  const now = courseProgress(c);
  const [pct, setPct] = useState(STEPS.reduce((a, b) => (Math.abs(b - now) < Math.abs(a - now) ? b : a), 0));
  const submit = () => {
    update(c, { spot: spot.trim(), progress: pct, lastAt: new Date().toISOString(), status: pct >= 100 ? 'hecho' : 'curso' });
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
      actions.add({ id: newId(), day: d, start: s, end: e, title: courseName(c).slice(0, 120), room: courseOrigin(c).slice(0, 60), color, subject: '', course: c.id });
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

function CourseForm({ course, topic: initialTopic, topics, courses, onDone }: { course: LegacyCourse | null; topic: string; topics: string[]; courses: LegacyCourse[]; onDone: () => void }) {
  const actions = useModule('courses');
  const [topic, setTopic] = useState(course?.topic ?? initialTopic);
  const [subtopic, setSubtopic] = useState(course?.subtopic ?? '');
  const [origin, setOrigin] = useState(course?.source ?? '');
  // Sugerencias: subcategorías de este tema y canales o academias ya usados.
  const subtopics = uniq(courses.filter((c) => c.topic.trim().toLocaleLowerCase('es') === topic.trim().toLocaleLowerCase('es')).map((c) => c.subtopic ?? ''));
  const origins = uniq(courses.map((c) => c.source ?? ''));
  const [url, setUrl] = useState(course?.url ?? '');
  const [title, setTitle] = useState(course?.title ?? '');
  const [status, setStatus] = useState<CourseStatus>(course ? statusOf(course) : 'pendiente');
  const [notes, setNotes] = useState(course?.notes ?? '');
  const link = normalizeCourseUrl(url);
  const badUrl = !validCourseUrl(link);
  const source = !badUrl ? courseSource(link) : null;
  const length = useCourseLength(course, (r) => {
    // Lo que diga YouTube solo llena lo que está vacío.
    if (r.author) setOrigin((v) => v || r.author!.slice(0, 120));
    if (r.title && !r.videos) setTitle((v) => v || r.title!.slice(0, 200));
  });

  const submit = () => {
    const fields = { topic: topic.trim(), subtopic: subtopic.trim(), source: origin.trim(), url: link, title: title.trim(), status, notes, ...length.fields() };
    const id = course?.id ?? newId();
    if (course) actions.update(id, fields);
    else actions.add({ id, ...fields });
    if (link && !badUrl) length.later(id, link, actions.update, { source: !fields.source });
    onDone();
  };

  return (
    <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <Field label="Tema" value={topic} onChangeText={setTopic} maxLength={120} placeholder="Inglés, React, Finanzas…" autoFocus={!initialTopic && !course} />
      <Suggestions field="Tema" values={topics} current={topic} onPick={setTopic} />
      <Field label="Subcategoría (opcional)" value={subtopic} onChangeText={setSubtopic} maxLength={120} placeholder="Hooks, Gramática, Ahorro…" hint="Agrupa los cursos dentro del tema." />
      <Suggestions field="Subcategoría" values={subtopics} current={subtopic} onPick={setSubtopic} />
      <Field
        label="Enlace (opcional)"
        value={url}
        onChangeText={setUrl}
        onBlur={() => {
          setUrl(link);
          // Con solo pegar el enlace se busca cuánto dura.
          if (link && !badUrl) length.lookup(link, false);
        }}
        maxLength={2000}
        placeholder="https://youtube.com/…"
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        hint={source ? `Se abrirá en ${source.label}.` : 'De YouTube, Udemy, Coursera, Platzi o cualquier página.'}
        error={url.trim() && badUrl ? 'Pega un enlace completo, por ejemplo https://youtube.com/watch?v=…' : null}
      />
      <Field
        label="Duración total en horas (opcional)"
        value={length.hours}
        onChangeText={length.type}
        keyboardType="decimal-pad"
        maxLength={7}
        placeholder="12.5"
        hint={length.message}
        error={length.bad ? 'Escribe un número de horas, por ejemplo 12.5.' : null}
      />
      <Button small variant="secondary" label={length.busy ? 'Buscando…' : 'Leer del enlace'} onPress={() => length.lookup(link, true)} disabled={!link || badUrl || length.busy} />
      {length.reader}
      <Field label="Nombre (opcional)" value={title} onChangeText={setTitle} maxLength={200} placeholder="Curso completo de inglés básico" />
      <Field label="Canal de YouTube o academia (opcional)" value={origin} onChangeText={setOrigin} maxLength={120} placeholder="midudev, Platzi, EDteam…" hint="En YouTube se llena solo al leer el enlace." />
      <Suggestions field="Canal o academia" values={origins} current={origin} onPick={setOrigin} />
      <DotChoices legend="Estado" value={status} onChange={setStatus} options={COURSE_STATUSES.map((s) => ({ value: s, label: COURSE_STATUS_INFO[s].label }))} />
      <Field label="Notas (opcional)" value={notes} onChangeText={setNotes} maxLength={5000} multiline placeholder="Voy en la lección 4…" />
      <FormActions
        submitLabel={course ? 'Guardar' : 'Añadir curso'}
        onSubmit={submit}
        disabled={!topic.trim() || (!!url.trim() && badUrl) || length.bad}
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

/**
 * Duración del curso en el formulario: se escribe a mano o se lee del enlace
 * (lo hace el servidor). Si ya se escribió, el enlace no la pisa salvo con
 * «Leer del enlace».
 */
function useCourseLength(course: LegacyCourse | null, onFound?: (r: CourseLength) => void) {
  const initial = course?.length ? String(Math.round((course.length / 3600) * 100) / 100) : '';
  const [hours, setHours] = useState(initial);
  const [from, setFrom] = useState<CourseLengthFrom | undefined>(course?.lengthFrom);
  const [message, setMessage] = useState<string | undefined>(course?.length ? undefined : 'Se busca sola al pegar el enlace, si la página la dice.');
  const [busy, setBusy] = useState(false);
  // Una consulta por enlace: si se guarda antes de que responda, se aprovecha la misma.
  const asked = useRef(new Map<string, Promise<CourseLength | null>>());
  const found = useRef(onFound);
  found.current = onFound;
  // YouTube se lee en el teléfono con un reproductor invisible; si no se puede, lo intenta el servidor.
  const [reading, setReading] = useState<{ video: string; list: string; key: number; alive: () => void; finish: (r: LengthFound | null) => void } | null>(null);
  const readHere = (url: string) =>
    new Promise<LengthFound | null>((resolve) => {
      const ref = youtubeRef(url);
      if (!ref || Platform.OS === 'web') return resolve(null);
      let timer: ReturnType<typeof setTimeout>;
      const finish = (r: LengthFound | null) => {
        clearTimeout(timer);
        setReading(null);
        resolve(r);
      };
      // Si en 20 s no dice nada (ni un video de la lista), se rinde.
      const wait = () => {
        clearTimeout(timer);
        timer = setTimeout(() => finish(null), 20_000);
      };
      wait();
      setReading({ video: ref.video, list: ref.list, key: Date.now(), alive: wait, finish });
    });
  const ask = (url: string) => {
    let p = asked.current.get(url);
    if (!p) {
      const server = () =>
        api.courses.length(url).catch((e: unknown) => {
          setMessage(e instanceof Error && e.message ? e.message : 'No pude leerla. Escríbela a mano.');
          return null;
        });
      p = readHere(url).then((r) => r ?? server());
      asked.current.set(url, p);
    }
    return p;
  };
  const value = hours.trim() === '' ? 0 : Number(hours.replace(',', '.'));
  const bad = hours.trim() !== '' && !(Number.isFinite(value) && value >= 0 && value <= 2000);
  const lookup = async (url: string, force: boolean) => {
    if (busy || (!force && (hours.trim() || asked.current.has(url)))) return;
    if (force) asked.current.delete(url);
    setBusy(true);
    setMessage('Buscando cuánto dura…');
    const r = await ask(url);
    setBusy(false);
    if (!r) return;
    setHours(String(Math.round((r.seconds / 3600) * 100) / 100));
    setFrom(r.exact ? 'enlace' : 'aprox');
    setMessage(`${r.exact ? 'Dura' : 'Dura unas'} ${formatLength(r.seconds)}${r.videos ? ` (${r.videos} videos)` : ''}${r.author ? `, de ${r.author}` : ''}, según la página.`);
    found.current?.(r);
  };
  return {
    hours,
    busy,
    bad,
    message,
    lookup,
    reader: reading ? (
      <YouTubeLengthReader
        key={reading.key}
        video={reading.video}
        list={reading.list}
        onStep={(done, total) => {
          reading.alive();
          if (total > 1) setMessage(`Midiendo los videos de la lista: ${done} de ${total}…`);
        }}
        onDone={reading.finish}
      />
    ) : null,
    type: (v: string) => {
      setHours(v);
      setFrom('manual');
      setMessage(undefined);
    },
    fields: (): Partial<LegacyCourse> => {
      if (bad) return {};
      if (!value) return course?.length ? { length: 0 } : {};
      return { length: Math.round(value * 3600), lengthFrom: from ?? 'manual' };
    },
    /** Guardado sin duración pero con enlace: se busca después y se completa sola. */
    later: (id: string, url: string, save: (id: string, patch: Partial<LegacyCourse>) => void, empty: { source: boolean }) => {
      if (value || bad || !url || (course?.length && course.url === url)) return;
      void ask(url).then((r) => r && save(id, { length: r.seconds, lengthFrom: r.exact ? 'enlace' : 'aprox', ...(empty.source && r.author ? { source: r.author.slice(0, 120) } : {}) }));
    },
  };
}

/** Valores distintos y no vacíos, sin repetir mayúsculas. */
const uniq = (list: string[]) => {
  const seen = new Map<string, string>();
  for (const v of list.map((x) => x.trim()).filter(Boolean)) if (!seen.has(v.toLocaleLowerCase('es'))) seen.set(v.toLocaleLowerCase('es'), v);
  return [...seen.values()];
};

const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('es', { day: 'numeric', month: 'long', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' as const } : {}) });
};

/** Reparte los cursos en las horas libres de la semana y los pone en el Horario. */
function StudyPlanner({ courses, onDone }: { courses: LegacyCourse[]; onDone: () => void }) {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const classes = useModule('classes');
  const toast = useToast();
  const router = useRouter();
  // Por temas: cada tema estudia un curso a la vez, en el orden de su ruta.
  const topics = coursesByTopic(courses)
    .map((g) => ({ topic: g.topic, route: courseRoute(g.items).filter((c) => statusOf(c) !== 'hecho') }))
    .filter((g) => g.route.length);
  // Todos los temas de entrada: un curso de cada uno va al horario.
  const [chosen, setChosen] = useState<string[]>(() => topics.map((g) => g.topic));
  const [days, setDays] = useState('12345');
  const [from, setFrom] = useState('18:00');
  const [to, setTo] = useState('21:00');
  const [session, setSession] = useState('60');
  const [weekly, setWeekly] = useState('5');
  const f = normalizeHHMM(from);
  const t = normalizeHHMM(to);
  const badTime = !HHMM_RE.test(f) || !HHMM_RE.test(t) || t <= f;
  const plan = badTime ? null : planTopics(legacy.data?.data, chosen, { days, from: f, to: t, session: Number(session), weekly: Number(weekly) });
  const name = (id: string) => courseName(courses.find((c) => c.id === id) ?? ({ title: '', url: '' } as LegacyCourse));
  const short = plan && plan.fits < Number(weekly) && plan.sessions.length > 0;

  const submit = () => {
    if (!plan?.sessions.length) return;
    const inTopics = new Set(topics.filter((g) => chosen.includes(g.topic)).flatMap((g) => g.route.map((c) => c.id)));
    const old = legacy.data?.data.classes as Array<{ id: string; course?: string }> | undefined;
    for (const k of old ?? []) if (k.course && inTopics.has(k.course)) classes.remove(k.id);
    plan.sessions.forEach((s) => {
      const c = courses.find((x) => x.id === s.courseId)!;
      const color = CLASS_COLORS[Math.max(0, chosen.findIndex((t) => t.toLocaleLowerCase('es') === c.topic.trim().toLocaleLowerCase('es'))) % CLASS_COLORS.length];
      classes.add({ id: newId(), day: s.day, start: s.start, end: s.end, title: courseName(c).slice(0, 120), room: courseOrigin(c).slice(0, 60), color, subject: '', course: c.id });
    });
    toast(`Listo: ${plural(plan.sessions.length, 'sesión', 'sesiones')} de estudio en tu horario.`, { action: { label: 'Ver horario', run: () => router.push('/horario') } });
    onDone();
  };

  return (
    <ScrollView style={{ maxHeight: 620 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <T v="small" tint="muted">
        Pone en tu horario un curso de cada tema, el que sigue en su orden. Elige cuándo tienes tiempo y listo. Cuando terminas un curso, sus clases pasan solas al siguiente del tema.
      </T>
      <View style={{ gap: space[1] }}>
        <T v="label">Temas</T>
        {topics.map((g) => {
          const known = g.route.map(courseRemaining).filter((r): r is number => r !== null);
          const left = known.reduce((a, b) => a + b, 0);
          const label = `${g.topic} · ${plural(g.route.length, 'curso', 'cursos')} · empieza por «${courseName(g.route[0])}»${known.length ? ` · faltan ${formatLength(left)}` : ''}`;
          const on = chosen.includes(g.topic);
          return (
            <View key={g.topic} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: touchTarget }}>
              <T v="body" style={{ flex: 1 }}>
                {label}
              </T>
              <Toggle label={label} value={on} onChange={() => setChosen((l) => (on ? l.filter((x) => x !== g.topic) : [...l, g.topic]))} />
            </View>
          );
        })}
      </View>
      <WeekdayPicker legend="Días que puedes estudiar" value={days} onChange={setDays} />
      <TimeField label="Desde" value={from} onChange={setFrom} />
      <TimeField label="Hasta" value={to} onChange={setTo} hint={HHMM_RE.test(f) && HHMM_RE.test(t) && t <= f ? 'Debe ser después de «Desde».' : undefined} />
      <DotChoices legend="Horas a la semana" value={weekly} onChange={setWeekly} options={STUDY_WEEKLY.map((h) => ({ value: String(h), label: `${h} h` }))} />
      <DotChoices legend="Cada sesión" value={session} onChange={setSession} options={STUDY_SESSIONS.map((m) => ({ value: String(m), label: m < 60 ? `${m} min` : formatLength(m * 60) }))} />
      <View accessibilityLiveRegion="polite" style={{ gap: space[2], padding: space[4], borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceSunken }}>
        <T v="label" accessibilityRole="header">
          Así quedaría
        </T>
        {!chosen.length ? (
          <T v="small" tint="muted">
            Elige al menos un tema.
          </T>
        ) : !plan?.sessions.length ? (
          <T v="small" tint="muted">
            No hay huecos libres con esos días y horas. Prueba otros días o amplía el horario.
          </T>
        ) : (
          <>
            {short && <T v="small">En esos días y horas caben {String(plan.fits).replace('.', ',')} h a la semana, así que usamos esas.</T>}
            {plan.sessions.map((s) => (
              <T key={`${s.day}-${s.start}`} v="small">
                <T v="small" tint="primary">
                  {DAY_SHORT[s.day - 1]} {s.start}–{s.end}
                </T>{' '}
                {name(s.courseId)}
              </T>
            ))}
            {plan.topics.map((p) => (
              <T key={p.topic} v="small" tint="muted">
                {p.topic}: {plural(p.perWeek, 'sesión', 'sesiones')} a la semana
                {!p.perWeek
                  ? ' · no cupo esta semana'
                  : p.finish
                    ? ` · ${p.count > 1 ? `los ${p.count} cursos` : 'lo terminas'} hacia el ${fmtDate(p.finish)} (${plural(p.weeks ?? 0, 'semana', 'semanas')})`
                    : ' · agrega la duración de sus cursos para saber cuándo terminas'}
                {p.unknown > 0 && p.finish ? ` · ${plural(p.unknown, 'curso sin duración no cuenta', 'cursos sin duración no cuentan')}` : ''}
              </T>
            ))}
          </>
        )}
      </View>
      <T v="small" tint="muted">
        Las clases que ya tenían estos temas en tu horario se cambian por estas.
      </T>
      <Button label="Poner en mi horario" onPress={submit} disabled={!plan?.sessions.length} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  card: { borderLeftWidth: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: touchTarget + 8 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2] },
  bar: { width: 64, height: 6, borderRadius: 3, overflow: 'hidden' },
  sub: { fontFamily: fonts.semibold, letterSpacing: 1, paddingTop: space[3], paddingBottom: space[1], borderBottomWidth: StyleSheet.hairlineWidth },
  next: { paddingHorizontal: 8, paddingVertical: 1, borderRadius: radius.pill },
  status: { minWidth: 64, minHeight: 32, paddingHorizontal: space[3], borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
