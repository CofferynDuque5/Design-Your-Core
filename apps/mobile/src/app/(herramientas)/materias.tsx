import {
  byWeekday,
  CLASS_DAYS,
  checkItems,
  checkItemsPayload,
  donePercent,
  legacyList,
  newLegacySubId,
  paletteWith,
  plural,
  safeColor,
  SUBJECT_COLORS,
  type LegacyCheckItem,
  type LegacyClass,
  type LegacyData,
  type LegacySubject,
} from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { useRouter } from 'expo-router';
import { CalendarPlus, Clock, MapPin, Pencil, Plus, User } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { CheckList, ColorSwatches, Disclosure, FormActions, IconButton, Meter, Stats, ToolScreen } from '../../components/tools';
import { Button, Card, EmptyState, ErrorState, Field, Loading, T, fonts } from '../../components/ui';
import { newId, useLegacyData, useLegacyList, useModule } from '../../lib/legacy';
import { useTheme } from '../../lib/theme';
import { useToast } from '../../lib/toast';

type Subject = LegacySubject & { topics: LegacyCheckItem[] };

export default function Subjects() {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const raw = useLegacyList(legacy.data?.data, 'subjects');
  const classes = useLegacyList(legacy.data?.data, 'classes');
  // Temas con la defensa de la app anterior (lista, id y done garantizados).
  const subjects = useMemo<Subject[]>(() => raw.map((s) => ({ ...s, topics: checkItems(s.topics, newLegacySubId) })), [raw]);
  const [editing, setEditing] = useState<Subject | 'new' | null>(null);

  const topics = subjects.flatMap((s) => s.topics);
  const linked = classes.filter((c) => subjects.some((s) => s.id === c.subject));

  return (
    <ToolScreen
      title="Materias"
      refreshing={legacy.isRefetching}
      onRefresh={() => legacy.refetch()}
      right={<Button small label="Nueva materia" icon={<Plus size={16} color={colors.onPrimary} />} onPress={() => setEditing('new')} disabled={!legacy.data} />}
    >
      {legacy.isPending ? (
        <Loading label="Cargando tus materias" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : subjects.length === 0 ? (
        <EmptyState title="Aún no tienes materias">Añade tus asignaturas con su profesor y aula, divide cada una en temas y lleva la cuenta de tu avance.</EmptyState>
      ) : (
        <>
          <Stats
            items={[
              { value: String(subjects.length), label: subjects.length === 1 ? 'Materia' : 'Materias' },
              { value: `${topics.filter((t) => t.done).length}/${topics.length}`, label: 'Temas vistos' },
              { value: String(linked.length), label: linked.length === 1 ? 'Clase a la semana' : 'Clases a la semana' },
            ]}
          />
          {subjects.map((s) => (
            <SubjectCard key={s.id} subject={s} classes={classes.filter((c) => c.subject === s.id)} onEdit={() => setEditing(s)} />
          ))}
        </>
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nueva materia' : 'Editar materia'}>
        {editing !== null && <SubjectForm subject={editing === 'new' ? null : editing} count={subjects.length} data={legacy.data?.data} onDone={() => setEditing(null)} />}
      </Sheet>
    </ToolScreen>
  );
}

function Meta({ icon, label, children }: { icon: ReactNode; label: string; children: string }) {
  return (
    <View style={st.meta} accessible accessibilityLabel={`${label}: ${children}`}>
      {icon}
      <T v="small" tint="muted" style={{ flexShrink: 1 }}>
        {children}
      </T>
    </View>
  );
}

function SubjectCard({ subject: s, classes, onEdit }: { subject: Subject; classes: LegacyClass[]; onEdit: () => void }) {
  const { colors } = useTheme();
  const subjects = useModule('subjects');
  const classActions = useModule('classes');
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const color = safeColor(s.color, SUBJECT_COLORS[0]);
  const name = s.name || 'Sin nombre';
  const done = s.topics.filter((t) => t.done).length;
  const pct = donePercent(s.topics);

  // Como el botón «Horario» de la app anterior: una clase el lunes de 8:00 a 9:30 con los datos de la materia.
  const addClass = () => {
    classActions.add({ id: newId(), day: 1, start: '08:00', end: '09:30', title: name.slice(0, 120), room: (s.room ?? '').trim().slice(0, 60), color, subject: s.id });
    toast(`Clase de ${name} añadida al Horario el lunes de 8:00 a 9:30. Ajústala allí.`, { action: { label: 'Ver horario', run: () => router.push('/horario') } });
  };

  return (
    <Card style={[st.card, { borderLeftColor: color }]}>
      <View style={st.head}>
        <T v="heading" accessibilityRole="header" style={{ flex: 1, fontSize: 19, lineHeight: 24 }}>
          {name}
        </T>
        <IconButton label={`Editar «${name}»`} onPress={onEdit} style={{ marginRight: -space[2], marginTop: -space[2] }}>
          <Pencil size={18} color={colors.inkMuted} />
        </IconButton>
      </View>
      {(s.teacher || s.room || s.nextClass) && (
        <View style={{ gap: space[1], marginTop: -space[2] }}>
          {s.teacher ? (
            <Meta icon={<User size={15} color={colors.inkSubtle} />} label="Profesor">
              {s.teacher}
            </Meta>
          ) : null}
          {s.room ? (
            <Meta icon={<MapPin size={15} color={colors.inkSubtle} />} label="Aula">
              {s.room}
            </Meta>
          ) : null}
          {s.nextClass ? (
            <Meta icon={<Clock size={15} color={colors.inkSubtle} />} label="Próxima clase">
              {s.nextClass}
            </Meta>
          ) : null}
        </View>
      )}
      <View style={st.chips}>
        {[...classes].sort(byWeekday).map((c) => {
          const text = `${CLASS_DAYS[c.day - 1] ?? '—'} ${c.start}${c.room ? ` · ${c.room}` : ''}`;
          return (
            <View key={c.id} style={[st.chip, { backgroundColor: colors.surfaceSunken }]} accessible accessibilityLabel={`Clase: ${text}`}>
              <T v="small" tint="muted" style={{ fontVariant: ['tabular-nums'] }}>
                {text}
              </T>
            </View>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Añadir «${name}» al horario`}
          onPress={addClass}
          hitSlop={4}
          style={({ pressed }) => [st.chipBtn, { borderColor: colors.lineStrong, opacity: pressed ? 0.7 : 1 }]}
        >
          <CalendarPlus size={15} color={colors.primary} />
          <T v="small" tint="primary" style={{ fontFamily: fonts.medium }}>
            Horario
          </T>
        </Pressable>
      </View>
      <View style={{ gap: space[2] }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[2] }}>
          <T v="small" tint="muted">
            Avance del curso
          </T>
          <T v="small" style={{ fontFamily: fonts.semibold, fontVariant: ['tabular-nums'] }}>
            {s.topics.length ? `${pct} %` : 'Sin temas aún'}
          </T>
        </View>
        {s.topics.length > 0 && <Meter value={pct} color={color} label={`Avance de ${name}`} />}
      </View>
      <Disclosure
        label="Temas"
        count={s.topics.length ? `${done}/${s.topics.length}` : undefined}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        a11yLabel={`Temas de «${name}»${s.topics.length ? `: ${done} de ${s.topics.length} vistos` : ''}`}
      />
      {open && (
        <CheckList
          items={s.topics}
          onChange={(topics) => subjects.update(s.id, { topics: checkItemsPayload(topics) })}
          owner={name}
          noun="tema"
          listLabel="Temas"
          placeholder="Añadir tema"
          color={color}
          make={(n) => ({ id: newLegacySubId(), name: n, done: false })}
        />
      )}
    </Card>
  );
}

function SubjectForm({ subject, count, data, onDone }: { subject: Subject | null; count: number; data: LegacyData | undefined; onDone: () => void }) {
  const actions = useModule('subjects');
  const projectActions = useModule('projects');
  const toast = useToast();
  const [name, setName] = useState(subject?.name ?? '');
  const [teacher, setTeacher] = useState(subject?.teacher ?? '');
  const [room, setRoom] = useState(subject?.room ?? '');
  const [nextClass, setNextClass] = useState(subject?.nextClass ?? '');
  // Color cíclico para las nuevas, como la app anterior.
  const [color, setColor] = useState(safeColor(subject?.color, SUBJECT_COLORS[count % SUBJECT_COLORS.length]));
  // Los proyectos guardan el NOMBRE de la materia: al renombrarla se actualizan con ella.
  const projects = subject ? legacyList(data, 'projects').filter((p) => p.subject && p.subject === subject.name) : [];
  const classCount = subject ? legacyList(data, 'classes').filter((c) => c.subject === subject.id).length : 0;
  const renaming = !!subject && projects.length > 0 && !!name.trim() && name.trim() !== subject.name;

  const submit = () => {
    const fields = { name: name.trim(), teacher: teacher.trim(), room: room.trim(), nextClass: nextClass.trim(), color };
    if (subject) {
      actions.update(subject.id, fields);
      if (fields.name !== subject.name) projects.forEach((p) => projectActions.update(p.id, { subject: fields.name }));
    } else actions.add({ id: newId(), ...fields, topics: [] });
    onDone();
  };

  const remove = () => {
    if (!subject) return;
    actions.remove(subject.id);
    toast('Materia eliminada. Sus clases y proyectos se conservan.');
    onDone();
  };

  const topicCount = subject?.topics.length ?? 0;
  const keeps = classCount || projects.length ? ' Sus clases del Horario y sus proyectos no se borran.' : '';

  return (
    <ScrollView style={{ maxHeight: 600 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <Field
        label="Nombre"
        value={name}
        onChangeText={setName}
        maxLength={120}
        placeholder="Física"
        autoFocus={!subject}
        hint={renaming ? (projects.length === 1 ? 'Su proyecto se actualizará con el nuevo nombre.' : `Sus ${projects.length} proyectos se actualizarán con el nuevo nombre.`) : undefined}
      />
      <Field label="Profesor o profesora (opcional)" value={teacher} onChangeText={setTeacher} maxLength={120} placeholder="Prof. Ruiz" />
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <View style={{ flex: 1 }}>
          <Field label="Aula (opcional)" value={room} onChangeText={setRoom} maxLength={60} placeholder="B-3" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Próxima clase (opcional)" value={nextClass} onChangeText={setNextClass} maxLength={60} placeholder="Lunes 8:00" />
        </View>
      </View>
      <ColorSwatches legend="Color" colors={paletteWith(SUBJECT_COLORS, color)} value={color} onChange={setColor} />
      <FormActions
        submitLabel={subject ? 'Guardar' : 'Añadir materia'}
        onSubmit={submit}
        disabled={!name.trim()}
        onDelete={subject ? remove : undefined}
        confirm={`Se borrará «${subject?.name || 'la materia'}»${topicCount ? ` con ${plural(topicCount, 'tema', 'temas')}` : ''}.${keeps}`}
      />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  card: { borderLeftWidth: 4 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], alignItems: 'center' },
  chip: { borderRadius: radius.pill, paddingHorizontal: space[3], paddingVertical: 4 },
  chipBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: touchTarget - 8, paddingHorizontal: space[3], borderRadius: radius.pill, borderWidth: 1 },
});
