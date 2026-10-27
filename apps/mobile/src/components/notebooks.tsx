import { NOTEBOOK_COLORS, NOTEBOOK_EMOJIS, notebookIconOptions, paletteWith, plural, safeColor, sameEmoji, uniqueTexts, type LegacyNotebook } from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTheme } from '../lib/theme';
import { newId, useModule } from '../lib/legacy';
import { ColorSwatches, FormActions, Pill, Suggestions } from './tools';
import { Field, T } from './ui';
import { UiIcon } from './UiIcon';

// Piezas de Cuadernos que comparten la lista y la pantalla de cada cuaderno.

/** Categoría (o «General»), materia y tema de un cuaderno. */
export function NotebookTags({ notebook: n }: { notebook: LegacyNotebook }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[1] }}>
      <Pill a11yLabel={`Categoría: ${n.category || 'General'}`}>{n.category || 'General'}</Pill>
      {n.subject ? <Pill a11yLabel={`Materia: ${n.subject}`}>{n.subject}</Pill> : null}
      {n.topic ? <Pill a11yLabel={`Tema: ${n.topic}`}>{n.topic}</Pill> : null}
    </View>
  );
}

/** Crear, decorar o borrar un cuaderno. Borrarlo borra también sus cajitas (lo hace el servidor). */
export function NotebookForm({
  notebook,
  all,
  subjects,
  boxCount = 0,
  onDone,
  onDeleted,
}: {
  notebook: LegacyNotebook | null;
  all: LegacyNotebook[];
  subjects: string[];
  boxCount?: number;
  onDone: () => void;
  onDeleted?: () => void;
}) {
  const actions = useModule('notebooks');
  const [title, setTitle] = useState(notebook?.title ?? '');
  const [category, setCategory] = useState(notebook?.category ?? 'General');
  const [subject, setSubject] = useState(notebook?.subject ?? '');
  const [topic, setTopic] = useState(notebook?.topic ?? '');
  const [color, setColor] = useState(safeColor(notebook?.color, NOTEBOOK_COLORS[0]));
  const [emoji, setEmoji] = useState(notebook?.emoji || NOTEBOOK_EMOJIS[0]);

  const submit = () => {
    // Como la app anterior: sin título es «Cuaderno» y sin categoría, «General». La materia es texto libre.
    const fields = { title: title.trim() || 'Cuaderno', category: category.trim() || 'General', subject: subject.trim(), topic: topic.trim(), color, emoji };
    if (notebook) actions.update(notebook.id, fields);
    else actions.add({ id: newId(), ...fields });
    onDone();
  };

  return (
    <ScrollView style={{ maxHeight: 620 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <Field label="Título" value={title} onChangeText={setTitle} maxLength={120} placeholder="Cuaderno" autoFocus={!notebook} />
      <Field label="Categoría" value={category} onChangeText={setCategory} maxLength={60} placeholder="General" />
      <Suggestions field="Categoría" values={uniqueTexts(['General', 'Universidad', ...all.map((n) => n.category)])} current={category} onPick={setCategory} />
      <Field label="Materia (opcional)" value={subject} onChangeText={setSubject} maxLength={120} placeholder="Cálculo" />
      <Suggestions field="Materia" values={uniqueTexts([...subjects, ...all.map((n) => n.subject)])} current={subject} onPick={setSubject} />
      <Field label="Tema (opcional)" value={topic} onChangeText={setTopic} maxLength={120} placeholder="Derivadas" />
      <Suggestions field="Tema" values={uniqueTexts(all.map((n) => n.topic))} current={topic} onPick={setTopic} />
      <ColorSwatches legend="Color" colors={paletteWith(NOTEBOOK_COLORS, color)} value={color} onChange={setColor} />
      <IconPicker value={emoji} onChange={setEmoji} />
      <FormActions
        submitLabel={notebook ? 'Guardar' : 'Crear cuaderno'}
        onSubmit={submit}
        onDelete={
          notebook
            ? () => {
                actions.remove(notebook.id);
                onDone();
                onDeleted?.();
              }
            : undefined
        }
        confirm={`Se borrará «${notebook?.title || 'Cuaderno'}»${boxCount ? ` con ${plural(boxCount, 'cajita', 'cajitas')}` : ''}.`}
      />
    </ScrollView>
  );
}

/** Icono del cuaderno: se guarda el emoji de siempre (lo lee la app anterior) y se dibuja su icono. */
function IconPicker({ value, onChange }: { value: string; onChange: (emoji: string) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space[2] }}>
      <T v="label">Icono</T>
      <View accessibilityRole="radiogroup" accessibilityLabel="Icono" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {notebookIconOptions(value).map((o) => {
          const on = sameEmoji(o.value, value);
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={o.label}
              onPress={() => onChange(o.value)}
              style={({ pressed }) => ({
                width: touchTarget,
                height: touchTarget,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.md,
                borderWidth: on ? 2 : 1,
                borderColor: on ? colors.ink : colors.lineStrong,
                backgroundColor: on ? colors.surfaceSunken : colors.surface,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <UiIcon name={o.icon} size={20} color={on ? colors.ink : colors.inkMuted} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
