import { formatLength, lessonsByUnit, lessonsFromPlaylist, lessonsPatch, nextLesson, normalizeCourseUrl, validCourseUrl, youtubeRef, type CourseLesson, type LegacyCourse } from '@dyc/core';
import { space } from '@dyc/tokens';
import { ExternalLink, ListVideo, Play, Plus, Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Linking, Platform, ScrollView, View } from 'react-native';
import { newId } from '../lib/legacy';
import { useTheme } from '../lib/theme';
import { CheckRow, IconButton, Suggestions } from './tools';
import { Button, Field, T } from './ui';
import { YouTubeLengthReader, YouTubeView, type LengthFound } from './YouTubeView';

/**
 * Unidades y lecciones de un curso: se marcan como vistas, se añaden a mano o
 * se traen de la lista de YouTube del curso. El avance del curso sale de aquí.
 */
export function CourseLessons({ course: c, update }: { course: LegacyCourse; update: (c: LegacyCourse, patch: Partial<LegacyCourse>) => void }) {
  const { colors } = useTheme();
  // Lo último guardado desde aquí: dos cambios seguidos no se pisan aunque el curso aún no se haya recargado.
  const mine = useRef<CourseLesson[] | null>(null);
  const lessons = mine.current ?? c.lessons ?? [];
  const [title, setTitle] = useState('');
  const [unit, setUnit] = useState(() => lessons.at(-1)?.unit ?? '');
  const [url, setUrl] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const latest = useRef(c);
  latest.current = c;
  const current = () => mine.current ?? latest.current.lessons ?? [];
  const save = (next: CourseLesson[]) => {
    const patch = lessonsPatch({ ...latest.current, lessons: current() }, next);
    mine.current = next;
    update(latest.current, patch);
  };
  const toggle = (id: string, done?: boolean) => save(current().map((l) => (l.id === id ? { ...l, done: done ?? !l.done } : l)));
  const link = normalizeCourseUrl(url);
  const badUrl = !!url.trim() && !validCourseUrl(link);
  const units = [...new Set(lessons.map((l) => (l.unit ?? '').trim()).filter(Boolean))];
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
    <ScrollView style={{ maxHeight: 620 }} contentContainerStyle={{ gap: space[3] }} keyboardShouldPersistTaps="handled">
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
              if (l && !l.done && s.duration && s.position / s.duration >= 0.97) toggle(played.id, true);
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
      {lessonsByUnit(lessons).map((g) => (
        <View key={g.unit || '-'}>
          {!!g.unit && (
            <T v="small" tint="primary" accessibilityRole="header" style={{ paddingTop: space[2], paddingBottom: space[1] }}>
              {`${g.unit.toLocaleUpperCase('es')} · ${g.items.filter((l) => l.done).length}/${g.items.length}`}
            </T>
          )}
          {g.items.map((l) => {
            const yt = l.url ? youtubeRef(l.url) : null;
            return (
              <CheckRow
                key={l.id}
                title={l.title}
                done={!!l.done}
                meta={l.seconds ? formatLength(l.seconds) : undefined}
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
            );
          })}
        </View>
      ))}
      <View style={{ gap: space[3], paddingTop: space[3], borderTopWidth: 1, borderTopColor: colors.line }}>
        <T v="label" accessibilityRole="header">
          Añadir lección
        </T>
        <Field label="Unidad (opcional)" value={unit} onChangeText={setUnit} maxLength={120} placeholder="Unidad 1, Módulo 2…" />
        <Suggestions field="Unidad" values={units} current={unit} onPick={setUnit} />
        <Field label="Lección o video" value={title} onChangeText={setTitle} maxLength={200} placeholder="Introducción, Clase 3…" />
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
