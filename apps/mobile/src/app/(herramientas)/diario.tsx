import { byDateDesc, isDay, JOURNAL_MOODS, journalStats, longDay, shortDay, utcDayKey, type Day, type LegacyJournal } from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { Trash2 } from 'lucide-react-native';
import { Fragment, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type ScrollView } from 'react-native';
import { CheckInNote, DayStepper, IconButton, MoodPicker, Pill, Stats, ToolScreen } from '../../components/tools';
import { Card, ErrorState, Field, Loading, SectionHeader, T } from '../../components/ui';
import { newId, useLegacyData, useLegacyList, useModule } from '../../lib/legacy';
import { useTheme } from '../../lib/theme';
import { useToast } from '../../lib/toast';
import { useAutosave } from '../../lib/tools';

const HISTORY_MAX = 60;
type Fields = Partial<Pick<LegacyJournal, 'mood' | 'gratitude' | 'note'>>;

export default function Journal() {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const journal = useLegacyList(legacy.data?.data, 'journal');
  const actions = useModule('journal');
  const toast = useToast();
  const scroll = useRef<ScrollView>(null);
  // Una entrada por fecha, con el día en UTC como la app anterior.
  const today = utcDayKey();
  const [date, setDate] = useState<Day>(today);
  const entries = useMemo(() => journal.filter((j) => isDay(j.date)).sort(byDateDesc), [journal]);
  const entry = entries.find((j) => j.date === date);
  // La app anterior creaba la entrada al abrir la sección; aquí se crea con lo primero que escribes.
  const created = useRef(new Map<string, string>());
  const stats = useMemo(() => journalStats(entries, today), [entries, today]);

  const save = (fields: Fields) => {
    const id = entry?.id ?? created.current.get(date);
    if (id) return actions.update(id, fields);
    const fresh = newId();
    created.current.set(date, fresh);
    actions.add({ id: fresh, date, mood: '', gratitude: '', note: '', ...fields });
  };

  const remove = (j: LegacyJournal) => {
    const order = journal.map((x) => x.id);
    created.current.delete(j.date);
    actions.remove(j.id);
    toast(`Entrada del ${shortDay(j.date)} eliminada.`, {
      action: {
        label: 'Deshacer',
        run: () => {
          actions.add(j);
          actions.reorder(order);
        },
      },
    });
  };

  const open = (d: Day) => {
    setDate(d);
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

  return (
    <ToolScreen title="Diario" eyebrow="Salud" refreshing={legacy.isRefetching} onRefresh={() => legacy.refetch()} scrollRef={scroll}>
      {legacy.isPending ? (
        <Loading label="Cargando tu diario" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : (
        <>
          <Stats
            items={[
              { value: String(stats.month), label: stats.month === 1 ? 'Entrada este mes' : 'Entradas este mes' },
              { value: String(stats.streak), label: stats.streak === 1 ? 'Día seguido' : 'Días seguidos' },
              { value: stats.top ?? '—', label: stats.topLabel ? `Ánimo más frecuente: ${stats.topLabel.toLowerCase()}` : 'Ánimo más frecuente' },
            ]}
          />
          <Editor key={date} date={date} today={today} entry={entry} onSave={save} onDate={setDate} />
          <View style={{ gap: space[3] }}>
            <SectionHeader title="Entradas" right={<Pill a11yLabel={`${entries.length} entradas`}>{String(entries.length)}</Pill>} />
            {entries.length === 0 ? (
              <T v="small" tint="muted">
                Tus entradas aparecerán aquí. Empieza con cómo te sientes hoy.
              </T>
            ) : (
              <Card style={{ paddingVertical: space[1], gap: 0 }}>
                {entries.slice(0, HISTORY_MAX).map((j, i) => {
                  const mood = JOURNAL_MOODS.find((m) => m.emoji === j.mood);
                  const text = j.note?.trim() || j.gratitude?.trim() || 'Sin texto';
                  const on = j.date === date;
                  return (
                    <Fragment key={j.id}>
                      {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 48 }} />}
                      <View style={[st.row, on && { backgroundColor: colors.primarySoft, marginHorizontal: -space[2], paddingHorizontal: space[2], borderRadius: radius.md }]}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={`${shortDay(j.date)}${j.date === today ? ' · hoy' : ''}${mood ? `, ánimo ${mood.label.toLowerCase()}` : ''}. ${text}`}
                          onPress={() => open(j.date)}
                          style={({ pressed }) => [st.rowHit, pressed && { opacity: 0.7 }]}
                        >
                          <View style={[st.mood, { backgroundColor: colors.surfaceSunken }]}>
                            <T v="body" style={{ fontSize: 20 }}>
                              {j.mood || '·'}
                            </T>
                          </View>
                          <View style={{ flex: 1 }}>
                            <T v="label">
                              {shortDay(j.date)}
                              {j.date === today ? ' · hoy' : ''}
                            </T>
                            <T v="small" tint="muted" numberOfLines={2}>
                              {text}
                            </T>
                          </View>
                        </Pressable>
                        <IconButton label={`Borrar la entrada del ${shortDay(j.date)}`} onPress={() => remove(j)} style={{ marginRight: -space[2] }}>
                          <Trash2 size={18} color={colors.inkMuted} />
                        </IconButton>
                      </View>
                    </Fragment>
                  );
                })}
              </Card>
            )}
          </View>
          <CheckInNote>El check-in diario guarda aparte su propia reflexión y gratitud; tu diario no cambia aún tus pilares.</CheckInNote>
        </>
      )}
    </ToolScreen>
  );
}

function Editor({ date, today, entry, onSave, onDate }: { date: Day; today: Day; entry: LegacyJournal | undefined; onSave: (f: Fields) => void; onDate: (d: Day) => void }) {
  // Como la app anterior, se guarda solo mientras escribes (espera corta de 400 ms).
  const gratitude = useAutosave(entry?.gratitude ?? '', (v) => v !== (entry?.gratitude ?? '') && onSave({ gratitude: v }), 400);
  const note = useAutosave(entry?.note ?? '', (v) => v !== (entry?.note ?? '') && onSave({ note: v }), 400);
  return (
    <Card style={{ gap: space[4] }}>
      <View style={{ gap: 2 }}>
        <T v="title" accessibilityRole="header" style={{ fontSize: 24, lineHeight: 30 }}>
          {date === today ? 'Hoy' : longDay(date)}
        </T>
        {date === today && (
          <T v="small" tint="muted">
            {longDay(date)}
          </T>
        )}
      </View>
      <DayStepper label="Ir a otro día" value={date} onChange={(d) => d && onDate(d)} today={today} max={today} />
      <MoodPicker legend="¿Cómo te sientes?" moods={JOURNAL_MOODS} value={entry?.mood ?? ''} onChange={(mood) => onSave({ mood })} />
      <Field label="Hoy agradezco…" multiline maxLength={5000} value={gratitude.draft} onChangeText={gratitude.change} onBlur={gratitude.flush} placeholder="Una persona, un momento, algo pequeño" />
      <Field
        label="Notas del día"
        multiline
        maxLength={50_000}
        value={note.draft}
        onChangeText={note.change}
        onBlur={note.flush}
        placeholder="¿Qué pasó hoy? ¿Qué aprendiste?"
        style={{ minHeight: 160 }}
      />
      <T v="small" tint="muted">
        {entry ? 'Se guarda solo mientras escribes.' : 'Aún no hay entrada de este día: se crea con lo primero que escribas.'}
      </T>
    </Card>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  rowHit: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: touchTarget + 12, paddingVertical: space[2] },
  mood: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
