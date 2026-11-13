import {
  COUPLE_KIND_LABEL,
  COUPLE_VENTURE_STAGES,
  COUPLE_VENTURE_STAGE_LABEL,
  coupleProgress,
  localDayKey,
  shortDay,
  type CoupleData,
  type CoupleItem,
  type CoupleKind,
  type CoupleSpace,
  type CoupleVentureStage,
  type Day,
} from '@dyc/core';
import { radius, space } from '@dyc/tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Camera, Check, Pencil, Plus, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { DayStepper, FormActions, IconButton, Meter, ToolScreen } from '../../components/tools';
import { Button, Card, Chip, EmptyState, ErrorState, errorMessage, Field, Loading, Segmented, T, fonts } from '../../components/ui';
import { api } from '../../lib/api';
import { pickImages } from '../../lib/files';
import { newId } from '../../lib/legacy';
import { useTheme } from '../../lib/theme';
import { useToast } from '../../lib/toast';

/**
 * En pareja: lo que compartes con tu pareja vinculada. Galería de fotos, metas
 * y emprendimientos en común; las dos personas ven y editan lo mismo.
 */

const COUPLE_KEY = ['couple'] as const;
const PARTNER_KEY = ['partner'] as const;
type Item<K extends CoupleKind> = CoupleItem<K>;
type Step = { id: string; name: string; done: boolean };

function useCouple() {
  return useQuery({ queryKey: COUPLE_KEY, queryFn: api.couple.get });
}

function useCoupleActions() {
  const qc = useQueryClient();
  const toast = useToast();
  const set = (fn: (s: CoupleSpace) => CoupleSpace) => qc.setQueryData<CoupleSpace>(COUPLE_KEY, (s) => (s ? fn(s) : s));
  const fail = (e: unknown) => toast(errorMessage(e), { tone: 'error' });
  return {
    add: async (input: Parameters<typeof api.couple.add>[0]) => {
      try {
        const item = await api.couple.add(input);
        set((s) => ({ ...s, items: [item, ...s.items] }));
        return item;
      } catch (e) {
        fail(e);
        return null;
      }
    },
    update: async <K extends CoupleKind>(item: Item<K>, data: Partial<CoupleData[K]>) => {
      // Al instante en pantalla; si falla, vuelve a lo que había.
      const before = qc.getQueryData<CoupleSpace>(COUPLE_KEY);
      set((s) => ({ ...s, items: s.items.map((it) => (it.id === item.id ? ({ ...it, data: { ...it.data, ...data } } as CoupleItem) : it)) }));
      try {
        const saved = await api.couple.update<K>(item.id, data);
        set((s) => ({ ...s, items: s.items.map((it) => (it.id === saved.id ? saved : it)) }));
      } catch (e) {
        if (before) qc.setQueryData(COUPLE_KEY, before);
        fail(e);
      }
    },
    remove: async (item: CoupleItem, what: string) => {
      try {
        await api.couple.remove(item.id);
        set((s) => ({ ...s, items: s.items.filter((it) => it.id !== item.id) }));
        toast(`${what} eliminada.`);
      } catch (e) {
        fail(e);
      }
    },
  };
}

export default function Couple() {
  const { colors } = useTheme();
  const couple = useCouple();
  const [tab, setTab] = useState<CoupleKind>('foto');
  const items = couple.data?.items ?? [];
  const of = <K extends CoupleKind>(k: K) => items.filter((i): i is Item<K> => i.kind === k);
  const partner = couple.data?.partner;

  return (
    <ToolScreen title="En pareja" eyebrow="Vida personal" refreshing={couple.isRefetching} onRefresh={() => couple.refetch()}>
      {couple.isPending ? (
        <Loading label="Cargando lo que comparten" />
      ) : couple.isError ? (
        <ErrorState error={couple.error} retry={() => couple.refetch()} />
      ) : !partner ? (
        <LinkPartner />
      ) : (
        <>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <T v="heading" style={{ color: colors.primary }}>
                {partner.name.slice(0, 1).toUpperCase()}
              </T>
            </View>
            <View style={{ flex: 1 }}>
              <T v="label" tint="muted">
                Compartes con
              </T>
              <T v="heading">{partner.name}</T>
            </View>
          </Card>
          <Segmented
            label="Qué ver"
            value={tab}
            onChange={setTab}
            options={(['foto', 'meta', 'emprendimiento'] as const).map((k) => ({ value: k, label: `${COUPLE_KIND_LABEL[k]} ${of(k).length || ''}`.trim(), a11yLabel: `${COUPLE_KIND_LABEL[k]}, ${of(k).length}` }))}
          />
          {tab === 'foto' && <Gallery photos={of('foto')} />}
          {tab === 'meta' && <Goals goals={of('meta')} />}
          {tab === 'emprendimiento' && <Ventures ventures={of('emprendimiento')} />}
        </>
      )}
    </ToolScreen>
  );
}

/** Sin pareja vinculada: invita con tu código o escribe el suyo. */
function LinkPartner() {
  const qc = useQueryClient();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [myCode, setMyCode] = useState<string | null>(null);
  const invite = useMutation({ mutationFn: api.partner.invite, onSuccess: (r) => setMyCode(r.code), onError: (e) => toast(errorMessage(e), { tone: 'error' }) });
  const accept = useMutation({
    mutationFn: () => api.partner.accept(code.trim().toUpperCase()),
    onSuccess: (r) => {
      toast(`Ahora estás vinculada/o con ${r.partner.name}.`);
      void qc.invalidateQueries({ queryKey: PARTNER_KEY });
      return qc.invalidateQueries({ queryKey: COUPLE_KEY });
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });
  return (
    <Card style={{ gap: space[3] }}>
      <T v="heading">Vincula a tu pareja</T>
      <T v="body" tint="muted">
        Cuando se vinculen, aquí tendrán una galería de fotos, metas y emprendimientos que comparten y editan los dos.
      </T>
      {myCode ? (
        <View style={{ gap: space[1] }}>
          <T v="label">Tu código (vale 7 días)</T>
          <T v="title" selectable style={{ letterSpacing: 4 }}>
            {myCode}
          </T>
          <T v="small" tint="muted">
            Tu pareja lo escribe en «En pareja» o en su Perfil.
          </T>
        </View>
      ) : (
        <Button variant="secondary" label="Crear mi código" onPress={() => invite.mutate()} disabled={invite.isPending} />
      )}
      <Field label="¿Tienes su código?" value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={6} placeholder="ABC123" />
      <Button label="Vincular" onPress={() => accept.mutate()} disabled={code.trim().length !== 6 || accept.isPending} />
    </Card>
  );
}

// ---------- Fotos ----------

function Gallery({ photos }: { photos: Item<'foto'>[] }) {
  const { colors } = useTheme();
  const actions = useCoupleActions();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Item<'foto'> | null>(null);
  const cols = width > 700 ? 4 : 3;
  const size = Math.floor((Math.min(width, 900) - space[5] * 2 - space[2] * (cols - 1)) / cols);

  const add = async () => {
    setBusy(true);
    try {
      const full = await pickImages(10, 1600);
      if (!full.length) return;
      let n = 0;
      for (const f of full) {
        // La miniatura sale de la misma foto, más pequeña.
        const thumb = await thumbOf(f.data);
        const ok = await actions.add({ kind: 'foto', data: { caption: '', takenOn: localDayKey(new Date()) }, image: f.data, thumb });
        if (ok) n++;
      }
      if (n) toast(n === 1 ? 'Foto agregada.' : `${n} fotos agregadas.`);
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space[3] }}>
      <Button label={busy ? 'Subiendo…' : 'Agregar fotos'} icon={<Camera size={16} color={colors.onPrimary} />} onPress={add} disabled={busy} />
      {photos.length === 0 ? (
        <EmptyState title="Su galería está vacía">Sus primeras fotos juntos aparecerán aquí para los dos.</EmptyState>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {photos.map((p) => (
            <Pressable key={p.id} accessibilityRole="imagebutton" accessibilityLabel={p.data.caption || `Foto del ${p.data.takenOn ? shortDay(p.data.takenOn as Day) : 'álbum'}`} onPress={() => setOpen(p)}>
              <Image source={{ uri: p.thumb }} style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: colors.surfaceSunken }} />
            </Pressable>
          ))}
        </View>
      )}
      {open && <PhotoView photo={open} onClose={() => setOpen(null)} />}
    </View>
  );
}

/** Reduce una foto ya elegida a una miniatura de 420 px. */
async function thumbOf(dataUrl: string): Promise<string> {
  const ctx = ImageManipulator.manipulate(dataUrl);
  ctx.resize({ width: 420 });
  const img = await (await ctx.renderAsync()).saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
  return `data:image/jpeg;base64,${img.base64 ?? ''}`;
}

function PhotoView({ photo, onClose }: { photo: Item<'foto'>; onClose: () => void }) {
  const { colors } = useTheme();
  const actions = useCoupleActions();
  const full = useQuery({ queryKey: ['couple-image', photo.id], queryFn: () => api.couple.image(photo.id), staleTime: Infinity });
  const [caption, setCaption] = useState(photo.data.caption);
  const [asking, setAsking] = useState(false);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', padding: space[4], justifyContent: 'center', gap: space[3] }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <IconButton label="Cerrar" onPress={onClose}>
            <X size={24} color="#fff" />
          </IconButton>
        </View>
        <Image source={{ uri: full.data ?? photo.thumb }} resizeMode="contain" style={{ flex: 1, width: '100%' }} accessibilityLabel={photo.data.caption || 'Foto'} />
        <T v="small" style={{ color: '#ddd' }}>
          {photo.byMe ? 'La subiste tú' : 'La subió tu pareja'}
          {photo.data.takenOn ? ` · ${shortDay(photo.data.takenOn as Day)}` : ''}
        </T>
        <View style={{ backgroundColor: colors.surfaceRaised, borderRadius: radius.lg, padding: space[3], gap: space[2] }}>
          <Field label="Descripción" value={caption} onChangeText={setCaption} maxLength={300} placeholder="Nuestro primer viaje" />
          {asking ? (
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Button small variant="danger" label="Sí, eliminar" onPress={() => void actions.remove(photo, 'Foto').then(onClose)} />
              <Button small variant="secondary" label="Cancelar" onPress={() => setAsking(false)} />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Button small label="Guardar" disabled={caption.trim() === photo.data.caption} onPress={() => void actions.update(photo, { caption: caption.trim() })} />
              <Button small variant="secondary" label="Eliminar foto" icon={<Trash2 size={14} color={colors.ink} />} onPress={() => setAsking(true)} />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ---------- Metas ----------

function Goals({ goals }: { goals: Item<'meta'>[] }) {
  const { colors } = useTheme();
  const actions = useCoupleActions();
  const [editing, setEditing] = useState<Item<'meta'> | 'new' | null>(null);
  const ordered = [...goals.filter((g) => !g.data.done), ...goals.filter((g) => g.data.done)];
  return (
    <View style={{ gap: space[3] }}>
      <Button label="Nueva meta juntos" icon={<Plus size={16} color={colors.onPrimary} />} onPress={() => setEditing('new')} />
      {ordered.length === 0 ? (
        <EmptyState title="Aún no tienen metas juntos">Ahorrar para un viaje, mudarse, aprender algo nuevo… Divídanla en pasos y márquenlos entre los dos.</EmptyState>
      ) : (
        ordered.map((g) => {
          const pct = coupleProgress(g.data.steps, g.data.done);
          return (
            <Card key={g.id} style={{ gap: space[2] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                <IconButton label={g.data.done ? `Marcar «${g.data.title}» como pendiente` : `Marcar «${g.data.title}» como lograda`} onPress={() => void actions.update(g, { done: !g.data.done })}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.primary, backgroundColor: g.data.done ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {g.data.done && <Check size={14} color={colors.onPrimary} />}
                  </View>
                </IconButton>
                <View style={{ flex: 1 }}>
                  <T v="heading" style={g.data.done ? { textDecorationLine: 'line-through', color: colors.inkMuted } : undefined}>
                    {g.data.title}
                  </T>
                  <T v="small" tint="muted">
                    {g.byMe ? 'La propusiste tú' : 'La propuso tu pareja'}
                    {g.data.deadline ? ` · para el ${shortDay(g.data.deadline as Day)}` : ''}
                  </T>
                </View>
                <IconButton label={`Editar «${g.data.title}»`} onPress={() => setEditing(g)}>
                  <Pencil size={18} color={colors.inkMuted} />
                </IconButton>
              </View>
              {g.data.note ? (
                <T v="body" tint="muted">
                  {g.data.note}
                </T>
              ) : null}
              {(g.data.steps.length > 0 || g.data.done) && <Meter value={pct} label={`${pct}% logrado`} />}
              <Steps steps={g.data.steps} onChange={(steps) => void actions.update(g, { steps })} what="paso" />
            </Card>
          );
        })
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nueva meta juntos' : 'Editar meta'}>
        {editing !== null && <GoalForm goal={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </View>
  );
}

function GoalForm({ goal, onDone }: { goal: Item<'meta'> | null; onDone: () => void }) {
  const actions = useCoupleActions();
  const today = localDayKey(new Date());
  const [title, setTitle] = useState(goal?.data.title ?? '');
  const [note, setNote] = useState(goal?.data.note ?? '');
  const [deadline, setDeadline] = useState<Day | ''>((goal?.data.deadline as Day | '') ?? '');
  const ok = title.trim().length > 0;
  const save = async () => {
    const data = { title: title.trim(), note: note.trim(), deadline };
    if (goal) await actions.update(goal, data);
    else await actions.add({ kind: 'meta', data: { ...data, done: false, steps: [] } });
    onDone();
  };
  return (
    <ScrollView contentContainerStyle={{ gap: space[3] }} keyboardShouldPersistTaps="handled">
      <Field label="Meta" value={title} onChangeText={setTitle} maxLength={160} placeholder="Ahorrar para nuestro viaje" autoFocus={!goal} />
      <Field label="Nota (opcional)" value={note} onChangeText={setNote} maxLength={2000} multiline />
      <DayStepper label="Fecha (opcional)" value={deadline} onChange={setDeadline} today={today} months optional={{ add: 'Poner fecha', remove: 'Quitar la fecha' }} />
      <FormActions
        submitLabel={goal ? 'Guardar cambios' : 'Crear meta'}
        onSubmit={() => void save()}
        disabled={!ok}
        onDelete={goal ? () => void actions.remove(goal, 'Meta').then(onDone) : undefined}
        confirm={goal ? `¿Eliminar «${goal.data.title}» para los dos?` : undefined}
      />
    </ScrollView>
  );
}

// ---------- Emprendimientos ----------

function Ventures({ ventures }: { ventures: Item<'emprendimiento'>[] }) {
  const { colors } = useTheme();
  const actions = useCoupleActions();
  const [editing, setEditing] = useState<Item<'emprendimiento'> | 'new' | null>(null);
  return (
    <View style={{ gap: space[3] }}>
      <Button label="Nuevo emprendimiento" icon={<Plus size={16} color={colors.onPrimary} />} onPress={() => setEditing('new')} />
      {ventures.length === 0 ? (
        <EmptyState title="Aún no tienen un emprendimiento juntos">Anoten la idea, en qué etapa va y las tareas de cada uno.</EmptyState>
      ) : (
        ventures.map((v) => {
          const pct = coupleProgress(v.data.tasks);
          return (
            <Card key={v.id} style={{ gap: space[2] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="heading">{v.data.name}</T>
                  <View style={{ alignSelf: 'flex-start', paddingHorizontal: space[2], paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.primarySoft }}>
                    <T v="small" style={{ color: colors.primary, fontFamily: fonts.medium }}>
                      {COUPLE_VENTURE_STAGE_LABEL[v.data.stage]}
                    </T>
                  </View>
                </View>
                <IconButton label={`Editar «${v.data.name}»`} onPress={() => setEditing(v)}>
                  <Pencil size={18} color={colors.inkMuted} />
                </IconButton>
              </View>
              {v.data.description ? (
                <T v="body" tint="muted">
                  {v.data.description}
                </T>
              ) : null}
              {v.data.tasks.length > 0 && <Meter value={pct} label={`${pct}% de las tareas`} />}
              <Steps steps={v.data.tasks} onChange={(tasks) => void actions.update(v, { tasks })} what="tarea" />
            </Card>
          );
        })
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo emprendimiento' : 'Editar emprendimiento'}>
        {editing !== null && <VentureForm venture={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </View>
  );
}

function VentureForm({ venture, onDone }: { venture: Item<'emprendimiento'> | null; onDone: () => void }) {
  const actions = useCoupleActions();
  const [name, setName] = useState(venture?.data.name ?? '');
  const [description, setDescription] = useState(venture?.data.description ?? '');
  const [stage, setStage] = useState<CoupleVentureStage>(venture?.data.stage ?? 'idea');
  const save = async () => {
    const data = { name: name.trim(), description: description.trim(), stage };
    if (venture) await actions.update(venture, data);
    else await actions.add({ kind: 'emprendimiento', data: { ...data, tasks: [] } });
    onDone();
  };
  return (
    <ScrollView contentContainerStyle={{ gap: space[3] }} keyboardShouldPersistTaps="handled">
      <Field label="Nombre" value={name} onChangeText={setName} maxLength={120} placeholder="Tienda de postres" autoFocus={!venture} />
      <Field label="De qué se trata (opcional)" value={description} onChangeText={setDescription} maxLength={5000} multiline />
      <T v="label">Etapa</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }} accessibilityRole="radiogroup" accessibilityLabel="Etapa">
        {COUPLE_VENTURE_STAGES.map((s) => (
          <Chip key={s} label={COUPLE_VENTURE_STAGE_LABEL[s]} selected={stage === s} onPress={() => setStage(s)} />
        ))}
      </View>
      <FormActions
        submitLabel={venture ? 'Guardar cambios' : 'Crear emprendimiento'}
        onSubmit={() => void save()}
        disabled={!name.trim()}
        onDelete={venture ? () => void actions.remove(venture, 'Emprendimiento').then(onDone) : undefined}
        confirm={venture ? `¿Eliminar «${venture.data.name}» para los dos?` : undefined}
      />
    </ScrollView>
  );
}

// ---------- Pasos / tareas compartidas ----------

function Steps({ steps, onChange, what }: { steps: Step[]; onChange: (s: Step[]) => void; what: string }) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const add = () => {
    const name = text.trim();
    if (!name) return;
    onChange([...steps, { id: newId(), name, done: false }]);
    setText('');
  };
  return (
    <View style={{ gap: space[1] }}>
      {steps.map((s) => (
        <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: s.done }}
            accessibilityLabel={s.name}
            onPress={() => onChange(steps.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 40 }}
          >
            <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: s.done ? colors.primary : colors.lineStrong, backgroundColor: s.done ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {s.done && <Check size={12} color={colors.onPrimary} />}
            </View>
            <T v="body" style={{ flex: 1, ...(s.done ? { textDecorationLine: 'line-through', color: colors.inkMuted } : null) }}>
              {s.name}
            </T>
          </Pressable>
          <IconButton label={`Quitar «${s.name}»`} onPress={() => onChange(steps.filter((x) => x.id !== s.id))}>
            <X size={16} color={colors.inkMuted} />
          </IconButton>
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[2] }}>
        <View style={{ flex: 1 }}>
          <Field label={`Nuevo ${what}`} value={text} onChangeText={setText} maxLength={200} onSubmitEditing={add} returnKeyType="done" />
        </View>
        <Button small variant="secondary" label="Añadir" onPress={add} disabled={!text.trim()} />
      </View>
    </View>
  );
}
