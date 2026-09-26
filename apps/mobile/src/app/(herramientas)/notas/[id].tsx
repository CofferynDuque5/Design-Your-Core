import { applyFormat, NOTE_DEFAULT_SUBJECT, NOTE_DEFAULT_TITLE, noteBodyOf, noteColorOf, noteSubjectOf, noteTag, uniqueTexts, type FormatKind, type LegacyNote } from '@dyc/core';
import { radius, space } from '@dyc/tokens';
import { useIsMutating } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Bold, Code, Heading2, Italic, List, ListChecks, Quote, Trash2, type LucideIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Markdown } from '../../../components/markdown';
import { ConfirmDelete, IconButton, Suggestions, ToolScreen } from '../../../components/tools';
import { Button, Card, EmptyState, ErrorState, Field, Loading, Segmented, T, fonts, type as typo } from '../../../components/ui';
import { useCoreImages } from '../../../lib/images';
import { useLegacyData, useLegacyList, useModule } from '../../../lib/legacy';
import { useTheme } from '../../../lib/theme';
import { useToast } from '../../../lib/toast';
import { useAutosave } from '../../../lib/tools';

const BACK = { label: 'Notas', href: '/notas' } as const;

const TOOLBAR: Array<{ kind: FormatKind; label: string; icon: LucideIcon }> = [
  { kind: 'bold', label: 'Negrita', icon: Bold },
  { kind: 'italic', label: 'Cursiva', icon: Italic },
  { kind: 'heading', label: 'Encabezado', icon: Heading2 },
  { kind: 'list', label: 'Lista', icon: List },
  { kind: 'task', label: 'Casilla', icon: ListChecks },
  { kind: 'code', label: 'Código', icon: Code },
  { kind: 'quote', label: 'Cita', icon: Quote },
];

export default function NoteScreen() {
  const { id, nueva } = useLocalSearchParams<{ id: string; nueva?: string }>();
  const router = useRouter();
  const legacy = useLegacyData();
  const notes = useLegacyList(legacy.data?.data, 'notes');
  const note = notes.find((n) => n.id === id);

  if (legacy.isPending || legacy.isError || !note) {
    return (
      <ToolScreen title="Nota" eyebrow="Notas" back={BACK} refreshing={legacy.isRefetching} onRefresh={() => legacy.refetch()}>
        {legacy.isPending ? (
          <Loading label="Cargando la nota" />
        ) : legacy.isError ? (
          <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
        ) : (
          <EmptyState title="Esta nota ya no existe" action={<Button small variant="secondary" label="Ver tus notas" onPress={() => router.replace('/notas')} />}>
            Puede que la hayas borrado aquí o en la app anterior.
          </EmptyState>
        )}
      </ToolScreen>
    );
  }
  return <Editor key={note.id} note={note} fresh={nueva === '1'} subjects={uniqueTexts(notes.map(noteSubjectOf))} />;
}

function Editor({ note, fresh, subjects }: { note: LegacyNote; fresh: boolean; subjects: string[] }) {
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const actions = useModule('notes');
  const saving = useIsMutating({ mutationKey: ['legacy'] }) > 0;
  const [mode, setMode] = useState<'write' | 'preview'>(fresh || !noteBodyOf(note) ? 'write' : 'preview');
  const [asking, setAsking] = useState(false);
  const area = useRef<TextInput>(null);
  // Dónde está el cursor en el texto (sin tocarlo, al final) y la selección que deja la barra de formato.
  const caret = useRef<{ start: number; end: number } | null>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);

  // Como la web y la app anterior: se guarda con una espera de 500 ms. Un título vacío se guarda al salir del campo.
  const title = useAutosave(note.title ?? '', (v) => v.trim() && v !== note.title && actions.update(note.id, { title: v.slice(0, 200) }), 500);
  const body = useAutosave(noteBodyOf(note), (v) => v !== note.body && actions.update(note.id, { body: v }), 500);
  const tags = useAutosave(note.tags ?? '', (v) => v !== note.tags && actions.update(note.id, { tags: v.slice(0, 300) }), 1000);
  const [subject, setSubject] = useState(noteSubjectOf(note));
  // Solo cambia si otra pantalla o la web cambian la materia (aquí se guarda al salir del campo).
  const savedSubject = noteSubjectOf(note);
  useEffect(() => setSubject(savedSubject), [savedSubject]);
  const saveSubject = (value = subject) => {
    const s = value.trim().slice(0, 120) || NOTE_DEFAULT_SUBJECT;
    setSubject(s);
    if (s !== note.subject) actions.update(note.id, { subject: s });
  };
  const resolve = useCoreImages(body.draft);

  const format = (kind: FormatKind) => {
    const end = body.draft.length;
    const sel = caret.current ?? { start: end, end };
    const edit = applyFormat(body.draft, Math.min(sel.start, end), Math.min(sel.end, end), kind);
    caret.current = { start: edit.start, end: edit.end };
    body.change(edit.value);
    setSelection({ start: edit.start, end: edit.end });
    area.current?.focus();
  };

  const remove = () => {
    actions.remove(note.id);
    toast('Nota eliminada.');
    if (router.canGoBack()) router.back();
    else router.replace('/notas');
  };

  const name = title.draft.trim() || NOTE_DEFAULT_TITLE;
  return (
    <ToolScreen
      title={name}
      back={BACK}
      header={
        <View style={{ gap: space[1] }}>
          <View style={st.top}>
            <T v="eyebrow" tint="muted">
              Nota
            </T>
            <T v="small" tint="muted" accessibilityLiveRegion="polite">
              {saving ? 'Guardando…' : 'Guardado'}
            </T>
          </View>
          <TextInput
            accessibilityLabel="Título"
            value={title.draft}
            onChangeText={title.change}
            onBlur={() => {
              if (!title.draft.trim()) title.change(NOTE_DEFAULT_TITLE);
              title.flush();
            }}
            onSubmitEditing={() => area.current?.focus()}
            autoFocus={fresh}
            selectTextOnFocus={fresh}
            returnKeyType="next"
            maxLength={200}
            placeholder={NOTE_DEFAULT_TITLE}
            placeholderTextColor={colors.inkSubtle}
            style={[typo.title, st.title, { color: colors.ink, borderBottomColor: subject.trim() === savedSubject ? noteColorOf(note) : noteTag(subject.trim() || NOTE_DEFAULT_SUBJECT) }]}
          />
        </View>
      }
    >
      <View style={{ gap: space[4] }}>
        <Field label="Materia" value={subject} onChangeText={setSubject} onBlur={() => saveSubject()} onSubmitEditing={() => saveSubject()} returnKeyType="done" maxLength={120} placeholder={NOTE_DEFAULT_SUBJECT} />
        <Suggestions
          field="Materia"
          values={subjects}
          current={subject}
          onPick={(v) => {
            setSubject(v);
            saveSubject(v);
          }}
        />
        <Field
          label="Etiquetas"
          hint="Separadas por comas: examen, física"
          value={tags.draft}
          onChangeText={tags.change}
          onBlur={tags.flush}
          onSubmitEditing={tags.flush}
          returnKeyType="done"
          autoCapitalize="none"
          maxLength={300}
        />
      </View>

      <Card style={{ gap: space[3] }}>
        <Segmented
          label="Modo"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'write', label: 'Escribir' },
            { value: 'preview', label: 'Vista previa' },
          ]}
        />
        {mode === 'write' ? (
          <>
            <View accessibilityLabel="Formato" style={st.toolbar}>
              {TOOLBAR.map(({ kind, label, icon: Icon }) => (
                <IconButton key={kind} label={label} onPress={() => format(kind)} style={[st.tool, { borderColor: colors.line, backgroundColor: colors.surfaceSunken }]}>
                  <Icon size={18} color={colors.ink} />
                </IconButton>
              ))}
            </View>
            <TextInput
              ref={area}
              accessibilityLabel="Texto de la nota, en Markdown"
              value={body.draft}
              onChangeText={body.change}
              onBlur={body.flush}
              onSelectionChange={(e) => {
                caret.current = e.nativeEvent.selection;
                if (selection) setSelection(undefined);
              }}
              selection={selection}
              multiline
              scrollEnabled={false}
              placeholder={'# Tema\n\nEscribe tus apuntes. **Negrita**, *cursiva*, listas, - [ ] casillas, `código` y $fórmulas$.'}
              placeholderTextColor={colors.inkSubtle}
              style={[typo.body, st.body, { color: colors.ink, backgroundColor: colors.surface, borderColor: colors.lineStrong }]}
            />
          </>
        ) : body.draft.trim() ? (
          <Markdown text={body.draft} resolveImage={resolve} />
        ) : (
          <T tint="muted">Esta nota está vacía. Pulsa «Escribir» para empezar.</T>
        )}
      </Card>
      <T v="small" tint="muted" style={{ marginTop: -space[3] }}>
        Se guarda sola mientras escribes. Las fórmulas entre $ se muestran como texto, sin dibujarlas. Las imágenes se añaden desde la web; aquí se ven en la vista previa.
      </T>

      {asking ? (
        <ConfirmDelete onConfirm={remove} onCancel={() => setAsking(false)}>{`Se borrará «${name}». No se puede deshacer.`}</ConfirmDelete>
      ) : (
        <Button variant="ghost" label="Borrar nota" icon={<Trash2 size={16} color={colors.primary} />} onPress={() => setAsking(true)} style={{ alignSelf: 'flex-start' }} />
      )}
    </ToolScreen>
  );
}

const st = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space[2] },
  title: { borderBottomWidth: 3, paddingVertical: space[1], fontFamily: fonts.display },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space[2] },
  tool: { borderWidth: 1, borderRadius: radius.md },
  body: { minHeight: 320, borderWidth: 1, borderRadius: radius.md, padding: space[3], textAlignVertical: 'top' },
});
