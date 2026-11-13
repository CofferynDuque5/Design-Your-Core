import { ACTIVITY_KINDS, ACTIVITY_KIND_LABEL, activityCount, type ActivityKind, type LessonActivity, unitWord, addUnitPatch, courseUnits, nextUnitNumber, numberedUnit, formatLength, lessonsByUnit, removeUnitPatch, renameUnitPatch, lessonsFromPlaylist, lessonsPatch, nextLesson, normalizeCourseUrl, validCourseUrl, youtubeRef, type CourseLesson, type LegacyCourse } from '@dyc/core';
import { space } from '@dyc/tokens';
import { useIsMutating } from '@tanstack/react-query';
import { Check, ExternalLink, FolderPlus, ListVideo, Pencil, Play, Plus, Trash2, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Linking, Platform, ScrollView, View, type TextInput } from 'react-native';
import { newId, useLegacyData, useLegacyList, type ChangeOpts } from '../lib/legacy';
import { useTheme } from '../lib/theme';
import { CheckRow, DotChoices, IconButton, Suggestions } from './tools';
import { Button, Field, T } from './ui';
import { YouTubeLengthReader, YouTubeView, type LengthFound } from './YouTubeView';

/**
 * Unidades y lecciones de un curso: se marcan como vistas, se añaden a mano o
 * se traen de la lista de YouTube del curso. El avance del curso sale de aquí.
 */
export function CourseLessons({ course, update }: { course: LegacyCourse; update: (c: LegacyCourse, patch: Partial<LegacyCourse>, opts?: ChangeOpts) => void }) {
  const { colors } = useTheme();
  // Siempre la copia más reciente del curso (la ventana puede conservar la que se abrió).
  const legacy = useLegacyData();
  const c = useLegacyList(legacy.data?.data, 'courses').find((x) => x.id === course.id) ?? course;
  // Lo último guardado desde aquí: dos cambios seguidos no se pisan aunque el curso aún no se haya recargado.
  const mine = useRef<CourseLesson[] | null>(null);
  const mineUnits = useRef<string[] | null>(null);
  // Sin cambios en camino manda lo guardado (otro dispositivo, «Deshacer»…).
  const busy = useIsMutating({ mutationKey: ['legacy'] }) > 0;
  if (!busy) {
    mine.current = null;
    mineUnits.current = null;
  }
  const lessons = mine.current ?? c.lessons ?? [];
  const created = mineUnits.current ?? c.units ?? [];
  const titleRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [newUnit, setNewUnit] = useState('');
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const [title, setTitle] = useState('');
  const [unit, setUnit] = useState(() => lessons.at(-1)?.unit ?? '');
  const [url, setUrl] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const [editingLesson, setEditingLesson] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const latest = useRef(c);
  latest.current = c;
  const current = () => mine.current ?? latest.current.lessons ?? [];
  const now = (): LegacyCourse => ({ ...latest.current, lessons: current(), units: mineUnits.current ?? latest.current.units ?? [] });
  const apply = (patch: Partial<LegacyCourse>, opts?: ChangeOpts) => {
    if (patch.lessons) mine.current = patch.lessons;
    if (patch.units) mineUnits.current = patch.units;
    update(latest.current, patch, opts);
  };
  const save = (next: CourseLesson[], opts?: ChangeOpts) => apply(lessonsPatch(now(), next), opts);
  const addUnit = () => {
    const name = numberedUnit(nextUnitNumber(courseUnits(now())), newUnit, now().language);
    const patch = addUnitPatch(now(), name);
    if (!patch) return setStatus(`Ya tienes una unidad llamada «${name}».`);
    apply(patch);
    setUnit(name);
    setStatus(`Añadida «${name}». Ahora añádele lecciones.`);
    setNewUnit('');
  };
  const rename = () => {
    if (!renaming) return;
    const patch = renameUnitPatch(now(), renaming.from, renaming.to);
    if (!patch) return setStatus(`Ya tienes una unidad llamada «${renaming.to.trim()}».`);
    apply(patch);
    if (unit.trim() === renaming.from) setUnit(renaming.to.trim());
    setRenaming(null);
  };
  const toggle = (id: string, done?: boolean, opts?: ChangeOpts) =>
    save(
      current().map((l) => (l.id === id ? { ...l, done: done ?? !l.done } : l)),
      opts,
    );
  const link = normalizeCourseUrl(url);
  const badUrl = !!url.trim() && !validCourseUrl(link);
  const units = courseUnits({ lessons, units: created });
  const nextNumber = nextUnitNumber(units);
  const done = lessons.filter((l) => l.done).length;
  const ref = youtubeRef(c.url);
  const list = ref?.list;
  const next = nextLesson(c);
  const played = lessons.find((l) => l.id === playing);
  const playedRef = played?.url ? youtubeRef(played.url) : null;
  const canPlay = Platform.OS !== 'web';

  const add = () => {
    if (!title.trim() || badUrl) return;
    save([...lessons, { id: newId(), title: title.trim(), ...(unit.trim() ? { unit: unit.trim() } : {}), ...(link ? { url: link } : {}) }]);
    setStatus(`Añadida «${title.trim()}».`);
    setTitle('');
    setUrl('');
  };

  const imported = (r: LengthFound | null) => {
    setReading(false);
    if (!r?.items?.length || !list) return setStatus('No pude leer la lista de YouTube. Añade las lecciones a mano.');
    const have = new Set(current().map((l) => l.url));
    const fresh = lessonsFromPlaylist(r.items, list, newId).filter((l) => !have.has(l.url));
    if (!fresh.length) return setStatus('Ya tenías todos los videos de la lista.');
    save([...current(), ...fresh]);
    setStatus(`Listo: ${fresh.length} ${fresh.length === 1 ? 'lección nueva' : 'lecciones nuevas'} de la lista.`);
  };

  return (
    <ScrollView ref={scrollRef} style={{ maxHeight: 620 }} contentContainerStyle={{ gap: space[3] }} keyboardShouldPersistTaps="handled">
      {played && playedRef && (
        <View style={{ gap: space[1] }}>
          <YouTubeView
            key={played.id}
            video={playedRef.video}
            list=""
            start={playedRef.start}
            title={played.title}
            onProgress={(s) => {
              // Al terminar el video, la lección queda vista sola.
              const l = current().find((x) => x.id === played.id);
              if (l && !l.done && s.duration && s.position / s.duration >= 0.97) toggle(played.id, true, { undo: false });
            }}
            onError={() => setStatus('Este video no se puede ver aquí. Ábrelo en YouTube.')}
          />
          <T v="small" tint="muted">
            Al terminar el video, la lección se marca como vista.
          </T>
        </View>
      )}
      <T v="small" tint="muted" accessibilityLiveRegion="polite">
        {status ??
          (lessons.length
            ? `${done} de ${lessons.length} vistas${next ? `. Sigue «${next.title}».` : '. Terminaste todas.'}`
            : 'Divide el curso en unidades y lecciones (o videos) y márcalas al verlas. El avance del curso se calcula solo.')}
      </T>
      {!!list && canPlay && (
        <View style={{ alignItems: 'flex-start' }}>
          <Button
            small
            variant="secondary"
            label={reading ? 'Leyendo…' : lessons.length ? 'Traer los videos nuevos de la lista' : 'Traer los videos de la lista de YouTube'}
            icon={<ListVideo size={16} color={colors.primary} />}
            disabled={reading}
            onPress={() => {
              setReading(true);
              setStatus('Leyendo los videos de la lista…');
            }}
          />
        </View>
      )}
      {reading && ref && <YouTubeLengthReader video={ref.video} list={ref.list} onStep={(n, total) => setStatus(`Leyendo los videos de la lista: ${n} de ${total}…`)} onDone={imported} />}
      <View style={{ gap: space[2] }}>
        <Field
          label="Nueva unidad"
          value={newUnit}
          onChangeText={setNewUnit}
          maxLength={110}
          placeholder={`${unitWord(c.language)} ${nextNumber}: nombre (opcional)`}
          hint={`Se guarda como «${numberedUnit(nextNumber, newUnit, c.language)}».`}
          onSubmitEditing={addUnit}
          returnKeyType="done"
        />
        <Button small variant="secondary" label={`Añadir unidad ${nextNumber}`} icon={<FolderPlus size={16} color={colors.primary} />} onPress={addUnit} disabled={units.length >= 100} style={{ alignSelf: 'flex-start' }} />
      </View>
      {lessonsByUnit(lessons, created).map((g) => (
        <View key={g.unit || '-'}>
          {!!g.unit &&
            (renaming?.from === g.unit ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[1], paddingTop: space[2] }}>
                <View style={{ flex: 1 }}>
                  <Field label={`Nuevo nombre de «${g.unit}»`} value={renaming.to} onChangeText={(to) => setRenaming({ ...renaming, to })} maxLength={120} autoFocus onSubmitEditing={rename} />
                </View>
                <IconButton label="Guardar el nombre" onPress={rename}>
                  <Check size={18} color={colors.primary} />
                </IconButton>
                <IconButton label="Cancelar" onPress={() => setRenaming(null)}>
                  <X size={18} color={colors.inkMuted} />
                </IconButton>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingTop: space[2] }}>
                <T v="small" tint="primary" accessibilityRole="header" style={{ flexGrow: 1, flexShrink: 1, flexBasis: 160, paddingBottom: space[1] }}>
                  {`${g.unit.toLocaleUpperCase('es')} · ${g.items.filter((l) => l.done).length}/${g.items.length}`}
                </T>
                <IconButton
                  label={`Añadir lección a «${g.unit}»`}
                  onPress={() => {
                    setUnit(g.unit);
                    scrollRef.current?.scrollToEnd({ animated: true });
                    titleRef.current?.focus();
                  }}
                >
                  <Plus size={18} color={colors.primary} />
                </IconButton>
                <IconButton label={`Cambiar el nombre de «${g.unit}»`} onPress={() => setRenaming({ from: g.unit, to: g.unit })}>
                  <Pencil size={18} color={colors.inkMuted} />
                </IconButton>
                <IconButton
                  label={`Quitar la unidad «${g.unit}»${g.items.length ? ' y sus lecciones' : ''}`}
                  onPress={() => {
                    apply(removeUnitPatch(now(), g.unit));
                    if (unit.trim() === g.unit) setUnit('');
                    setStatus(g.items.length ? `Quitaste «${g.unit}» y sus ${g.items.length} ${g.items.length === 1 ? 'lección' : 'lecciones'}.` : `Quitaste «${g.unit}».`);
                  }}
                >
                  <Trash2 size={18} color={colors.inkMuted} />
                </IconButton>
              </View>
            ))}
          {g.items.length === 0 && (
            <T v="small" tint="muted">
              Sin lecciones todavía.
            </T>
          )}
          {g.items.map((l) => {
            const yt = l.url ? youtubeRef(l.url) : null;
            const acts = activityCount(l);
            return (
              <View key={l.id}>
              <CheckRow
                title={l.title}
                done={!!l.done}
                meta={[l.seconds ? formatLength(l.seconds) : '', acts.total ? `${acts.done}/${acts.total} ${acts.total === 1 ? 'actividad' : 'actividades'}` : ''].filter(Boolean).join(' · ') || undefined}
                onToggle={() => toggle(l.id)}
                trailing={
                  <View style={{ flexDirection: 'row' }}>
                    {yt && canPlay ? (
                      <IconButton label={`Ver «${l.title}» aquí`} onPress={() => setPlaying(l.id)}>
                        <Play size={18} color={colors.primary} />
                      </IconButton>
                    ) : l.url ? (
                      <IconButton label={`Abrir «${l.title}»`} onPress={() => Linking.openURL(l.url!).catch(() => undefined)}>
                        <ExternalLink size={18} color={colors.inkMuted} />
                      </IconButton>
                    ) : null}
                    <IconButton label={`Editar «${l.title}» y sus actividades`} onPress={() => setEditingLesson(editingLesson === l.id ? null : l.id)}>
                      <Pencil size={18} color={editingLesson === l.id ? colors.primary : colors.inkMuted} />
                    </IconButton>
                    <IconButton
                      label={`Quitar «${l.title}»`}
                      onPress={() => {
                        if (playing === l.id) setPlaying(null);
                        save(current().filter((x) => x.id !== l.id));
                      }}
                    >
                      <Trash2 size={18} color={colors.inkMuted} />
                    </IconButton>
                  </View>
                }
              />
              {editingLesson === l.id && (
                <LessonEditor lesson={l} units={units} onSave={(patch) => save(current().map((x) => (x.id === l.id ? { ...x, ...patch } : x)))} onClose={() => setEditingLesson(null)} />
              )}
              </View>
            );
          })}
        </View>
      ))}
      <View style={{ gap: space[3], paddingTop: space[3], borderTopWidth: 1, borderTopColor: colors.line }}>
        <T v="label" accessibilityRole="header">
          Añadir lección
        </T>
        <Field label="En la unidad (opcional)" value={unit} onChangeText={setUnit} maxLength={120} placeholder={`${unitWord(c.language)} 1, ${c.language === 'en' ? 'Module' : 'Módulo'} 2…`} />
        <Suggestions field="Unidad" values={units} current={unit} onPick={setUnit} />
        <Field ref={titleRef} label="Lección o video" value={title} onChangeText={setTitle} maxLength={200} placeholder="Introducción, Clase 3…" />
        <Field
          label="Enlace de la lección (opcional)"
          value={url}
          onChangeText={setUrl}
          onBlur={() => setUrl(link)}
          maxLength={2000}
          placeholder="https://youtube.com/watch?v=…"
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          error={badUrl ? 'Pega un enlace completo, por ejemplo https://youtube.com/watch?v=…' : null}
        />
        <Button label="Añadir lección" icon={<Plus size={16} color={colors.onPrimary} />} onPress={add} disabled={!title.trim() || badUrl || lessons.length >= 500} />
      </View>
    </ScrollView>
  );
}

const ACTIVITY_PLACEHOLDER: Record<ActivityKind, string> = {
  video: 'Ver el video de la clase',
  lectura: 'Leer el capítulo 2',
  cuestionario: 'Cuestionario de repaso',
  examen: 'Examen de la unidad',
  tarea: 'Entregar el ejercicio 3',
  practica: 'Practicar con el ejemplo',
  proyecto: 'Proyecto final',
  otro: 'Otra cosa por hacer',
};

/** Editar una lección (nombre, unidad, enlace) y lo que hay que hacer dentro. Al marcar todo, queda vista. */
function LessonEditor({ lesson, units, onSave, onClose }: { lesson: CourseLesson; units: string[]; onSave: (patch: Partial<CourseLesson>) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const [name, setName] = useState(lesson.title);
  const [unit, setUnit] = useState(lesson.unit ?? '');
  const [url, setUrl] = useState(lesson.url ?? '');
  const [kind, setKind] = useState<ActivityKind>('video');
  const [what, setWhat] = useState('');
  const link = normalizeCourseUrl(url);
  const badUrl = !!url.trim() && !validCourseUrl(link);
  const acts = lesson.activities ?? [];
  const changed = name.trim() !== lesson.title || unit.trim() !== (lesson.unit ?? '') || link !== (lesson.url ?? '');
  const saveActs = (next: LessonActivity[]) => onSave({ activities: next, ...(next.length ? { done: next.every((a) => a.done) } : {}) });
  const add = () => {
    if (!what.trim() || acts.length >= 60) return;
    saveActs([...acts, { id: newId(), kind, title: what.trim() }]);
    setWhat('');
  };
  return (
    <View style={{ gap: space[3], padding: space[3], marginBottom: space[2], borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceSunken }}>
      <Field label="Nombre de la lección" value={name} onChangeText={setName} maxLength={200} />
      <Field label="Unidad" value={unit} onChangeText={setUnit} maxLength={120} placeholder="Sin unidad" />
      <Suggestions field="Unidad" values={units} current={unit} onPick={setUnit} />
      <Field
        label="Enlace (opcional)"
        value={url}
        onChangeText={setUrl}
        onBlur={() => setUrl(link)}
        maxLength={2000}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        error={badUrl ? 'Pega un enlace completo, por ejemplo https://youtube.com/watch?v=…' : null}
      />
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <Button small label="Guardar cambios" disabled={!changed || !name.trim() || badUrl} onPress={() => onSave({ title: name.trim(), unit: unit.trim() || undefined, url: link || undefined })} />
        <Button small variant="ghost" label="Cerrar" onPress={onClose} />
      </View>
      <T v="label" accessibilityRole="header">
        Actividades de la lección
      </T>
      {acts.length === 0 ? (
        <T v="small" tint="muted">
          Anota todo lo que hay que hacer: ver el video, leer, responder el cuestionario, presentar el examen…
        </T>
      ) : (
        acts.map((a) => (
          <CheckRow
            key={a.id}
            title={a.title}
            meta={ACTIVITY_KIND_LABEL[a.kind]}
            done={!!a.done}
            onToggle={() => saveActs(acts.map((x) => (x.id === a.id ? { ...x, done: !x.done } : x)))}
            trailing={
              <IconButton label={`Quitar la actividad «${a.title}»`} onPress={() => saveActs(acts.filter((x) => x.id !== a.id))}>
                <Trash2 size={18} color={colors.inkMuted} />
              </IconButton>
            }
          />
        ))
      )}
      <DotChoices legend="Tipo de actividad" value={kind} onChange={setKind} options={ACTIVITY_KINDS.map((k) => ({ value: k, label: ACTIVITY_KIND_LABEL[k] }))} />
      <Field label="Qué hay que hacer" value={what} onChangeText={setWhat} maxLength={200} placeholder={ACTIVITY_PLACEHOLDER[kind]} onSubmitEditing={add} returnKeyType="done" />
      <Button small variant="secondary" label={`Añadir ${ACTIVITY_KIND_LABEL[kind].toLowerCase()}`} icon={<Plus size={16} color={colors.primary} />} onPress={add} disabled={!what.trim() || acts.length >= 60} />
    </View>
  );
}
