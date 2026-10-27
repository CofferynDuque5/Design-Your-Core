import { plural, type LegacySubtask, type LegacyTodo } from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { Check, ChevronDown, ChevronUp, ListChecks, Pencil, Plus, Trash2, X } from 'lucide-react-native';
import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CheckRow, IconButton, ToolScreen } from '../../components/tools';
import { Button, Card, EmptyState, ErrorState, Field, Loading, T, fonts } from '../../components/ui';
import { newId, useLegacyData, useLegacyList, useModule } from '../../lib/legacy';
import { useTheme } from '../../lib/theme';
import { useToast } from '../../lib/toast';

export default function Todos() {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const todos = useLegacyList(legacy.data?.data, 'todos');
  const subtasks = useLegacyList(legacy.data?.data, 'subtasks');
  const actions = useModule('todos');
  const [title, setTitle] = useState('');
  const pending = todos.filter((t) => !t.done).length;

  const add = () => {
    if (!title.trim()) return;
    actions.add({ id: newId(), title: title.trim(), done: false });
    setTitle('');
  };

  const move = (index: number, delta: -1 | 1) => {
    const ids = todos.map((t) => t.id);
    const j = index + delta;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    actions.reorder(ids);
  };

  return (
    <ToolScreen title="Pendientes" refreshing={legacy.isRefetching} onRefresh={() => legacy.refetch()}>
      {legacy.isPending ? (
        <Loading label="Cargando tus pendientes" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[2] }}>
            <View style={{ flex: 1 }}>
              <Field label="Nuevo pendiente" value={title} onChangeText={setTitle} maxLength={300} placeholder="Algo que tengas que hacer" returnKeyType="done" onSubmitEditing={add} />
            </View>
            <Button label="Añadir" icon={<Plus size={18} color={colors.onPrimary} />} onPress={add} disabled={!title.trim()} />
          </View>

          {todos.length === 0 ? (
            <EmptyState title="Nada pendiente">Anota lo que tengas en la cabeza y divídelo en pasos pequeños.</EmptyState>
          ) : (
            <View style={{ gap: space[3] }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[2] }}>
                <T v="heading" accessibilityRole="header">
                  {pending === 0 ? 'Todo hecho' : `${pending} por hacer`}
                </T>
                <T v="small" tint="muted">
                  · {todos.length} en total
                </T>
              </View>
              <Card style={{ paddingVertical: space[1], gap: 0 }}>
                {todos.map((t, i) => (
                  <Fragment key={t.id}>
                    {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />}
                    <TodoRow todo={t} subtasks={subtasks.filter((s) => s.todoId === t.id)} first={i === 0} last={i === todos.length - 1} onMove={(d) => move(i, d)} />
                  </Fragment>
                ))}
              </Card>
              <T v="small" tint="muted">
                Toca el botón de la derecha de un pendiente para ver sus pasos, moverlo, renombrarlo o borrarlo.
              </T>
            </View>
          )}
        </>
      )}
    </ToolScreen>
  );
}

function TodoRow({ todo, subtasks, first, last, onMove }: { todo: LegacyTodo; subtasks: LegacySubtask[]; first: boolean; last: boolean; onMove: (d: -1 | 1) => void }) {
  const { colors } = useTheme();
  const actions = useModule('todos');
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(todo.title);
  const doneSubs = subtasks.filter((s) => s.done).length;

  const rename = () => {
    if (name.trim() && name.trim() !== todo.title) actions.update(todo.id, { title: name.trim() });
    setRenaming(false);
  };
  const cancelRename = () => {
    setName(todo.title);
    setRenaming(false);
  };

  return (
    <View>
      {renaming ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[1], paddingVertical: space[2] }}>
          <View style={{ flex: 1 }}>
            <Field label={`Nuevo nombre de «${todo.title}»`} value={name} onChangeText={setName} maxLength={300} autoFocus returnKeyType="done" onSubmitEditing={rename} />
          </View>
          <IconButton label="Guardar nombre" onPress={rename} disabled={!name.trim()}>
            <Check size={20} color={colors.primary} />
          </IconButton>
          <IconButton label="Cancelar" onPress={cancelRename}>
            <X size={20} color={colors.inkMuted} />
          </IconButton>
        </View>
      ) : (
        <CheckRow
          title={todo.title}
          done={!!todo.done}
          onToggle={() => actions.update(todo.id, { done: !todo.done })}
          trailing={
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={`Pasos y opciones de «${todo.title}»${subtasks.length ? `: ${doneSubs} de ${subtasks.length} hechos` : ''}`}
              onPress={() => setOpen((o) => !o)}
              style={({ pressed }) => [s.subsBtn, { borderColor: open ? colors.primary : colors.lineStrong, backgroundColor: open ? colors.primarySoft : 'transparent', opacity: pressed ? 0.7 : 1 }]}
            >
              <ListChecks size={16} color={open ? colors.primary : colors.inkMuted} />
              {subtasks.length > 0 && (
                <T v="small" style={{ fontFamily: fonts.medium, fontVariant: ['tabular-nums'], color: open ? colors.primary : colors.inkMuted }}>
                  {doneSubs}/{subtasks.length}
                </T>
              )}
              {open ? <ChevronUp size={16} color={colors.primary} /> : <ChevronDown size={16} color={colors.inkMuted} />}
            </Pressable>
          }
        />
      )}
      {open && !renaming && (
        <View style={[s.panel, { borderLeftColor: colors.line }]}>
          <Subtasks todo={todo} subtasks={subtasks} />
          <View style={s.tools}>
            <IconButton label={`Subir «${todo.title}»`} onPress={() => onMove(-1)} disabled={first}>
              <ChevronUp size={20} color={colors.inkMuted} />
            </IconButton>
            <IconButton label={`Bajar «${todo.title}»`} onPress={() => onMove(1)} disabled={last}>
              <ChevronDown size={20} color={colors.inkMuted} />
            </IconButton>
            <IconButton label={`Renombrar «${todo.title}»`} onPress={() => setRenaming(true)}>
              <Pencil size={18} color={colors.inkMuted} />
            </IconButton>
            <IconButton
              label={`Borrar «${todo.title}»`}
              onPress={() => {
                actions.remove(todo.id);
                toast(subtasks.length ? 'Pendiente y subtareas eliminados.' : 'Pendiente eliminado.');
              }}
            >
              <Trash2 size={18} color={colors.danger} />
            </IconButton>
          </View>
        </View>
      )}
    </View>
  );
}

function Subtasks({ todo, subtasks }: { todo: LegacyTodo; subtasks: LegacySubtask[] }) {
  const { colors } = useTheme();
  const actions = useModule('subtasks');
  const [title, setTitle] = useState('');
  const add = () => {
    if (!title.trim()) return;
    actions.add({ id: newId(), todoId: todo.id, title: title.trim(), done: false });
    setTitle('');
  };
  return (
    <View style={{ gap: space[1] }}>
      {subtasks.length > 0 && (
        <View accessibilityLabel={`Pasos de «${todo.title}»`}>
          {subtasks.map((st) => (
            <CheckRow
              key={st.id}
              title={st.title}
              done={!!st.done}
              onToggle={() => actions.update(st.id, { done: !st.done })}
              trailing={
                <IconButton label={`Borrar paso «${st.title}»`} onPress={() => actions.remove(st.id)}>
                  <Trash2 size={16} color={colors.inkMuted} />
                </IconButton>
              }
            />
          ))}
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[2] }}>
        <View style={{ flex: 1 }}>
          <Field label="Nuevo paso" accessibilityLabel={`Nuevo paso de «${todo.title}»`} value={title} onChangeText={setTitle} maxLength={300} placeholder="Añadir un paso" returnKeyType="done" onSubmitEditing={add} />
        </View>
        <Button small variant="secondary" label="Añadir paso" onPress={add} disabled={!title.trim()} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  subsBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: touchTarget, minWidth: touchTarget, paddingHorizontal: space[2], borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center' },
  panel: { marginLeft: 12, paddingLeft: space[4], borderLeftWidth: 2, paddingBottom: space[3], gap: space[2] },
  tools: { flexDirection: 'row', justifyContent: 'flex-end', gap: space[1] },
});
