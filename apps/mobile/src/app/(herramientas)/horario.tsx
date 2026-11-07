import {
  CLASS_COLORS,
  CLASS_DAY_NAMES,
  CLASS_DAYS,
  classDescription,
  classWhenLabel,
  HHMM_RE,
  hhmmToHours,
  isoDay,
  layoutLanes,
  nextClass,
  normalizeHHMM,
  scheduleHours,
  showableClasses,
  type LegacyClass,
  type LegacyData,
} from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { Clock, MapPin, Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Fragment, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { Suggestions, ColorSwatches, DotChoices, ToolScreen } from '../../components/tools';
import { Button, Card, EmptyState, ErrorState, Field, Loading, T, fonts } from '../../components/ui';
import { newId, useLegacyData, useLegacyList, useModule } from '../../lib/legacy';
import { useTheme } from '../../lib/theme';
import { useNow } from '../../lib/tools';

interface Subject {
  id: string;
  name: string;
  color?: string;
  room?: string;
}

const byStart = (a: LegacyClass, b: LegacyClass) => a.start.localeCompare(b.start);

function subjectsOf(data: LegacyData | undefined): Subject[] {
  const list: unknown = data?.subjects;
  return Array.isArray(list) ? list.filter((s): s is Subject => !!s && typeof s.id === 'string' && typeof s.name === 'string') : [];
}

export default function Schedule() {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const all = useLegacyList(legacy.data?.data, 'classes');
  // Datos antiguos con «8:00» o el día como texto también se dibujan.
  const classes = showableClasses(all);
  const [editing, setEditing] = useState<LegacyClass | 'new' | null>(null);
  const now = useNow();
  const today = isoDay(now);
  const next = nextClass(classes, now);

  return (
    <ToolScreen
      title="Horario"
      refreshing={legacy.isRefetching}
      onRefresh={() => legacy.refetch()}
      right={<Button small label="Nueva clase" icon={<Plus size={16} color={colors.onPrimary} />} onPress={() => setEditing('new')} disabled={!legacy.data} />}
    >
      {legacy.isPending ? (
        <Loading label="Cargando tu horario" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : (
        <>
          {classes.length === 0 && <EmptyState title="Tu horario está vacío">Añade tus clases con «Nueva clase»: se repiten cada semana en el mismo día y hora.</EmptyState>}
          {next && (
            <Card tone="accent" style={{ borderLeftWidth: 4, borderLeftColor: next.c.color }}>
              <T v="eyebrow" tint="muted">
                {next.ongoing ? 'Clase en curso' : 'Próxima clase'}
              </T>
              <View style={{ gap: space[1] }}>
                <T v="title">{next.c.title}</T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space[4], rowGap: space[1] }}>
                  <View style={s.meta}>
                    <Clock size={14} color={colors.inkMuted} />
                    <T v="small" tint="muted">
                      {classWhenLabel(next.c, next.wait, next.ongoing, now)}
                    </T>
                  </View>
                  {next.c.room ? (
                    <View style={s.meta}>
                      <MapPin size={14} color={colors.inkMuted} />
                      <T v="small" tint="muted">
                        {next.c.room}
                      </T>
                    </View>
                  ) : null}
                </View>
              </View>
            </Card>
          )}

          <WeekGrid classes={classes} today={today} now={now} onOpen={setEditing} />

          {CLASS_DAY_NAMES.map((name, i) => {
            const list = classes.filter((c) => c.day === i + 1).sort(byStart);
            if (!list.length) return null;
            return (
              <View key={name} style={{ gap: space[2] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                  <T v="heading" accessibilityRole="header">
                    {name}
                  </T>
                  {i + 1 === today && (
                    <View style={[s.today, { backgroundColor: colors.primarySoft }]}>
                      <T v="small" tint="primary" style={{ fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 }}>
                        Hoy
                      </T>
                    </View>
                  )}
                </View>
                <Card style={{ paddingVertical: space[1], gap: 0 }}>
                  {list.map((c, k) => (
                    <Fragment key={c.id}>
                      {k > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />}
                      <Pressable accessibilityRole="button" accessibilityLabel={`${classDescription(c)}. Editar`} onPress={() => setEditing(c)} style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}>
                        <View style={s.time}>
                          <T v="label" style={{ fontVariant: ['tabular-nums'] }}>
                            {c.start}
                          </T>
                          <T v="small" tint="subtle" style={{ fontVariant: ['tabular-nums'] }}>
                            {c.end}
                          </T>
                        </View>
                        <View style={[s.bar, { backgroundColor: c.color }]} />
                        <View style={{ flex: 1, gap: 2 }}>
                          <T v="label">{c.title}</T>
                          {c.room ? (
                            <T v="small" tint="muted">
                              {c.room}
                            </T>
                          ) : null}
                        </View>
                      </Pressable>
                    </Fragment>
                  ))}
                </Card>
              </View>
            );
          })}
        </>
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nueva clase' : 'Editar clase'}>
        {editing !== null && <ClassForm cls={editing === 'new' ? null : editing} count={all.length} subjects={subjectsOf(legacy.data?.data)} onDone={() => setEditing(null)} />}
      </Sheet>
    </ToolScreen>
  );
}

const HOUR = 44; // alto de cada cuadro (una hora)

/** Cuadrícula semanal: una columna por día y un cuadro por hora. Se ve también vacía. */
function WeekGrid({ classes, today, now, onOpen }: { classes: LegacyClass[]; today: number; now: Date; onOpen: (c: LegacyClass) => void }) {
  const { colors } = useTheme();
  const { from, to } = scheduleHours(classes);
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  const nowH = now.getHours() + now.getMinutes() / 60;
  const line = colors.lineStrong;
  return (
    <Card style={{ padding: space[2], gap: 0 }}>
      <View style={{ flexDirection: 'row' }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={s.hourCol} />
        {CLASS_DAYS.map((d, i) => (
          <T key={d} v="small" tint={i + 1 === today ? 'primary' : 'muted'} style={[s.gridHead, { fontFamily: fonts.semibold }]}>
            {d}
          </T>
        ))}
      </View>
      <View style={{ flexDirection: 'row' }}>
        <View style={s.hourCol} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {hours.map((h) => (
            <T key={h} v="small" tint="subtle" style={[s.hourLabel, { top: (h - from) * HOUR }]}>
              {h}
            </T>
          ))}
        </View>
        {CLASS_DAY_NAMES.map((name, i) => {
          const day = i + 1;
          const placed = layoutLanes(classes.filter((c) => c.day === day).map((c) => ({ item: c, start: hhmmToHours(c.start), end: hhmmToHours(c.end) })));
          return (
            <View
              key={name}
              style={[
                s.gridCol,
                { height: (to - from) * HOUR, borderColor: line, borderRightWidth: day === 7 ? StyleSheet.hairlineWidth : 0 },
                day === today && { backgroundColor: colors.primarySoft },
              ]}
            >
              {hours.map((h) => (
                <View key={h} style={[s.gridCell, { top: (h - from) * HOUR, borderColor: line }]} />
              ))}
              {placed.map(({ item: c, start, end, lane, lanes }) => (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${name}: ${classDescription(c)}. Editar`}
                  onPress={() => onOpen(c)}
                  style={[
                    s.gridBlock,
                    {
                      top: (start - from) * HOUR + 1,
                      height: Math.max(18, (end - start) * HOUR - 2),
                      left: `${(lane / lanes) * 100}%`,
                      width: `${100 / lanes}%`,
                      // Como en la web: fondo suave del color de la clase y borde izquierdo lleno.
                      backgroundColor: `${c.color}33`,
                      borderLeftColor: c.color,
                    },
                  ]}
                >
                  <T v="small" numberOfLines={end - start >= 1 ? 3 : 1} android_hyphenationFrequency="full" style={{ fontFamily: fonts.semibold, fontSize: 10, lineHeight: 12 }}>
                    {c.title}
                  </T>
                </Pressable>
              ))}
              {day === today && nowH >= from && nowH <= to && <View style={[s.nowLine, { top: (nowH - from) * HOUR, backgroundColor: colors.primary }]} />}
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function ClassForm({ cls, count, subjects, onDone }: { cls: LegacyClass | null; count: number; subjects: Subject[]; onDone: () => void }) {
  const saved = useLegacyData().data?.data;
  const rooms = [...useLegacyList(saved, 'classes').map((c) => c.room ?? ''), ...subjects.map((x) => x.room ?? '')];
  const { colors } = useTheme();
  const actions = useModule('classes');
  const router = useRouter();
  const [subject, setSubject] = useState(cls?.subject && subjects.some((x) => x.id === cls.subject) ? cls.subject : '');
  const [title, setTitle] = useState(cls?.title ?? '');
  const [day, setDay] = useState(cls?.day ?? 1);
  const [start, setStart] = useState(cls?.start ?? '08:00');
  const [end, setEnd] = useState(cls?.end ?? '09:30');
  const [room, setRoom] = useState(cls?.room ?? '');
  // Color cíclico de la paleta para clases nuevas, como la app anterior.
  const [color, setColor] = useState(cls?.color ?? CLASS_COLORS[count % CLASS_COLORS.length]);
  const palette = CLASS_COLORS.some((c) => c.toLowerCase() === color.toLowerCase()) ? [...CLASS_COLORS] : [...CLASS_COLORS, color];
  const startOk = HHMM_RE.test(start);
  const endOk = HHMM_RE.test(end);
  const badTime = !startOk || !endOk || end <= start;

  const pickSubject = (id: string) => {
    setSubject(id);
    const x = subjects.find((s) => s.id === id);
    if (!x) return;
    // Como la app anterior: copia nombre, color y aula de la materia.
    setTitle(x.name);
    if (x.color && /^#[0-9A-Fa-f]{6}$/.test(x.color)) setColor(x.color);
    if (x.room) setRoom(x.room);
  };

  const submit = () => {
    const fields = { title: title.trim(), day, start, end, room: room.trim(), color, subject, ...(cls?.course ? { course: cls.course } : {}) };
    if (cls) actions.update(cls.id, fields);
    else actions.add({ id: newId(), ...fields });
    onDone();
  };

  return (
    <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      {subjects.length > 0 && (
        <DotChoices
          legend="Materia"
          value={subject}
          onChange={(id) => (id ? pickSubject(id) : setSubject(''))}
          options={[{ value: '', label: 'Clase suelta', color: colors.inkSubtle }, ...subjects.map((x) => ({ value: x.id, label: x.name, color: x.color && /^#[0-9A-Fa-f]{6}$/.test(x.color) ? x.color : colors.inkSubtle }))]}
        />
      )}
      <Field label="Nombre" value={title} onChangeText={setTitle} maxLength={120} placeholder="Cálculo" autoFocus={!cls && !subjects.length} />
      <View style={{ gap: space[2] }}>
        <T v="label">Día</T>
        <View accessibilityRole="radiogroup" accessibilityLabel="Día" style={{ flexDirection: 'row', gap: space[1] }}>
          {CLASS_DAYS.map((d, i) => (
            <DayOption key={d} label={d} name={CLASS_DAY_NAMES[i]} selected={day === i + 1} onPress={() => setDay(i + 1)} />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <View style={{ flex: 1 }}>
          <Field
            label="Empieza"
            value={start}
            onChangeText={setStart}
            onBlur={() => setStart(normalizeHHMM)}
            maxLength={5}
            placeholder="08:00"
            keyboardType="numbers-and-punctuation"
            error={!startOk ? 'Usa HH:MM, por ejemplo 08:30.' : null}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="Termina"
            value={end}
            onChangeText={setEnd}
            onBlur={() => setEnd(normalizeHHMM)}
            maxLength={5}
            placeholder="09:30"
            keyboardType="numbers-and-punctuation"
            error={!endOk ? 'Usa HH:MM, por ejemplo 09:30.' : startOk && end <= start ? 'Debe ser después de la hora de inicio.' : null}
          />
        </View>
      </View>
      <Field label="Aula (opcional)" value={room} onChangeText={setRoom} maxLength={60} placeholder="A-201" />
      <Suggestions field="Aula" values={rooms} current={room} onPick={setRoom} />
      <ColorSwatches legend="Color" colors={palette} value={color} onChange={setColor} />
      <View style={{ gap: space[2] }}>
        {cls?.course && (
          <Button
            variant="secondary"
            label="Abrir el curso"
            onPress={() => {
              onDone();
              router.push(`/cursos?abrir=${cls.course}`);
            }}
          />
        )}
        <Button label={cls ? 'Guardar' : 'Añadir clase'} onPress={submit} disabled={!title.trim() || badTime} />
        {cls && (
          <Button
            variant="ghost"
            label="Borrar clase"
            onPress={() => {
              actions.remove(cls.id);
              onDone();
            }}
          />
        )}
      </View>
    </ScrollView>
  );
}

function DayOption({ label, name, selected, onPress }: { label: string; name: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={name}
      onPress={onPress}
      style={[s.dayOpt, { borderColor: selected ? colors.primary : colors.lineStrong, backgroundColor: selected ? colors.primary : colors.surface }]}
    >
      <T v="small" style={{ fontFamily: fonts.semibold, color: selected ? colors.onPrimary : colors.ink }}>
        {label}
      </T>
    </Pressable>
  );
}

const s = StyleSheet.create({
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  today: { borderRadius: radius.pill, paddingHorizontal: space[2], paddingVertical: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: touchTarget + 12, paddingVertical: space[2] },
  time: { width: 48, alignItems: 'flex-end' },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  hourCol: { width: 26 },
  hourLabel: { position: 'absolute', right: 4, marginTop: -7, fontSize: 10, lineHeight: 14, fontVariant: ['tabular-nums'] },
  gridHead: { flex: 1, textAlign: 'center', paddingBottom: space[1] },
  gridCol: { flex: 1, position: 'relative', borderLeftWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth },
  gridCell: { position: 'absolute', left: 0, right: 0, height: HOUR, borderBottomWidth: StyleSheet.hairlineWidth },
  gridBlock: { position: 'absolute', borderRadius: 4, paddingLeft: 3, paddingRight: 1, paddingVertical: 2, overflow: 'hidden', borderLeftWidth: 3 },
  nowLine: { position: 'absolute', left: 0, right: 0, height: 2 },
  dayOpt: { flex: 1, minHeight: touchTarget, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
