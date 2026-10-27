import { WORK_BUCKETS, WORK_PROJECT_INFO, WORK_PROJECTS, WORK_STATUS_INFO, WORK_STATUSES, workBucketOf, workProjectOf, workStatusOf, type LegacyWorkItem, type WorkProject, type WorkStatus } from '@dyc/core';
import { space } from '@dyc/tokens';
import { Info, Pencil, Plus } from 'lucide-react-native';
import { Fragment, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { CheckRow, DotChoices, FormActions, IconButton, Pill, ToolScreen } from '../../components/tools';
import { Button, Card, EmptyState, ErrorState, Field, Loading, Segmented, SectionHeader, T } from '../../components/ui';
import { newId, useLegacyData, useLegacyList, useModule } from '../../lib/legacy';
import { useTheme } from '../../lib/theme';

const PROJECT_OPTIONS = WORK_PROJECTS.map((p) => ({ value: p, label: WORK_PROJECT_INFO[p].label, color: WORK_PROJECT_INFO[p].color }));

export default function Work() {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const items = useLegacyList(legacy.data?.data, 'workItems');
  const actions = useModule('workItems');
  const [title, setTitle] = useState('');
  const [project, setProject] = useState<WorkProject>('p1');
  const [editing, setEditing] = useState<LegacyWorkItem | null>(null);
  const done = items.filter((w) => w.done).length;

  const add = () => {
    if (!title.trim()) return;
    actions.add({ id: newId(), title: title.trim(), project, status: 'todo', done: false, due: '' });
    setTitle('');
  };

  return (
    <ToolScreen
      title="Trabajo"
      eyebrow="Estudio y trabajo"
      refreshing={legacy.isRefetching}
      onRefresh={() => legacy.refetch()}
      right={items.length > 0 ? <Pill a11yLabel={`${done} de ${items.length} completadas`}>{`${done}/${items.length} completadas`}</Pill> : undefined}
    >
      {legacy.isPending ? (
        <Loading label="Cargando tus tareas de trabajo" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : (
        <>
          <Card style={{ gap: space[3] }}>
            <Field label="Nueva tarea de trabajo" value={title} onChangeText={setTitle} maxLength={200} placeholder="Preparar la reunión del lunes…" returnKeyType="done" onSubmitEditing={add} />
            <DotChoices legend="Proyecto de la tarea nueva" value={project} onChange={setProject} options={PROJECT_OPTIONS} />
            <Button label="Añadir" icon={<Plus size={18} color={colors.onPrimary} />} onPress={add} disabled={!title.trim()} />
          </Card>
          {items.length === 0 ? (
            <EmptyState title="Sin tareas de trabajo">Anota lo que tienes pendiente en tus proyectos y márcalo al terminar.</EmptyState>
          ) : (
            WORK_BUCKETS.map((b) => {
              const list = items.filter((w) => workBucketOf(w) === b.id);
              if (!list.length) return null;
              return (
                <View key={b.id} style={{ gap: space[3] }}>
                  <SectionHeader title={b.label} right={<Pill a11yLabel={`${list.length} ${list.length === 1 ? 'tarea' : 'tareas'}`}>{String(list.length)}</Pill>} />
                  <Card style={{ paddingVertical: space[1], gap: 0 }}>
                    {list.map((w, i) => (
                      <Fragment key={w.id}>
                        {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 38 }} />}
                        <WorkRow item={w} onEdit={() => setEditing(w)} />
                      </Fragment>
                    ))}
                  </Card>
                </View>
              );
            })
          )}
          <Card tone="sunken" style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
            <Info size={18} color={colors.inkMuted} style={{ marginTop: 2 }} />
            <T v="small" tint="muted" style={{ flex: 1 }}>
              Proyecto 1, 2 y 3 son los tres proyectos fijos de la app anterior. No están unidos a la sección Proyectos.
            </T>
          </Card>
        </>
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Editar tarea de trabajo">
        {editing && <WorkForm item={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </ToolScreen>
  );
}

function WorkRow({ item: w, onEdit }: { item: LegacyWorkItem; onEdit: () => void }) {
  const { colors } = useTheme();
  const actions = useModule('workItems');
  const p = WORK_PROJECT_INFO[workProjectOf(w)];
  const title = w.title || 'Sin título';
  return (
    <CheckRow
      title={title}
      done={!!w.done}
      color={p.color}
      meta={[p.label, !w.done && w.due ? w.due : ''].filter(Boolean).join(' · ')}
      onToggle={() => actions.update(w.id, { done: !w.done })}
      trailing={
        <IconButton label={`Editar «${title}»`} onPress={onEdit} style={{ marginRight: -space[2] }}>
          <Pencil size={18} color={colors.inkMuted} />
        </IconButton>
      }
    />
  );
}

function WorkForm({ item, onDone }: { item: LegacyWorkItem; onDone: () => void }) {
  const actions = useModule('workItems');
  const [title, setTitle] = useState(item.title ?? '');
  const [project, setProject] = useState<WorkProject>(workProjectOf(item));
  const [status, setStatus] = useState<WorkStatus>(workStatusOf(item));
  const [due, setDue] = useState(item.due ?? '');
  const submit = () => {
    if (!title.trim()) return;
    actions.update(item.id, { title: title.trim(), project, status, due: due.trim() });
    onDone();
  };
  return (
    <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <Field label="Tarea" value={title} onChangeText={setTitle} maxLength={200} />
      <DotChoices legend="Proyecto" value={project} onChange={setProject} options={PROJECT_OPTIONS} />
      <View style={{ gap: space[2] }}>
        <T v="label">Estado</T>
        <Segmented label="Estado" value={status} onChange={setStatus} options={WORK_STATUSES.map((s) => ({ value: s, label: WORK_STATUS_INFO[s].label }))} />
      </View>
      <Field label="Para cuándo (opcional)" value={due} onChangeText={setDue} maxLength={60} placeholder="Hoy, viernes, 30 sep…" />
      <FormActions
        submitLabel="Guardar"
        onSubmit={submit}
        disabled={!title.trim()}
        onDelete={() => {
          actions.remove(item.id);
          onDone();
        }}
        confirm={`Se borrará «${item.title || 'esta tarea'}».`}
      />
    </ScrollView>
  );
}
