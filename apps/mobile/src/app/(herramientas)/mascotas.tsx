import {
  CARE_KIND_INFO,
  CARE_KINDS,
  careKindOf,
  careWhen,
  byTime,
  HHMM_RE,
  nextDue,
  normalizeHHMM,
  PET_SPECIES,
  PET_SPECIES_INFO,
  petSpeciesOf,
  plural,
  utcDayKey,
  weekdaysOf,
  type CareKind,
  type LegacyPet,
  type LegacyPetCare,
  type PetSpecies,
} from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { Check, Pencil, Plus } from 'lucide-react-native';
import { Fragment, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { DotChoices, FormActions, IconButton, Stats, TimeField, Toggle, ToolScreen, WeekdayPicker } from '../../components/tools';
import { Button, Card, EmptyState, ErrorState, Field, Loading, T } from '../../components/ui';
import { newId, useLegacyData, useLegacyList, useModule } from '../../lib/legacy';
import { useTheme } from '../../lib/theme';
import { useNow } from '../../lib/tools';

const PET_COLOR = '#E8912A';

export default function Pets() {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const pets = useLegacyList(legacy.data?.data, 'pets');
  const cares = useLegacyList(legacy.data?.data, 'petCares');
  const now = useNow();
  // «Hecho hoy» usa el día en UTC, como la app anterior.
  const today = utcDayKey(now);
  const [editing, setEditing] = useState<LegacyPet | 'new' | null>(null);
  const [care, setCare] = useState<{ pet: LegacyPet; care: LegacyPetCare | null } | null>(null);
  const known = new Set(pets.map((p) => p.id));
  const ownCares = cares.filter((c) => known.has(c.petId));
  const doneToday = ownCares.filter((c) => c.lastDone === today).length;
  const pendingToday = ownCares.filter((c) => nextDue(c, now)?.inDays === 0).length;

  return (
    <ToolScreen
      title="Mascotas"
      eyebrow="Vida personal"
      refreshing={legacy.isRefetching}
      onRefresh={() => legacy.refetch()}
      right={<Button small label="Nueva mascota" icon={<Plus size={16} color={colors.onPrimary} />} onPress={() => setEditing('new')} disabled={!legacy.data} />}
    >
      {legacy.isPending ? (
        <Loading label="Cargando tus mascotas" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : pets.length === 0 ? (
        <EmptyState title="Aún no tienes mascotas" action={<Button small variant="secondary" label="Añadir mascota" icon={<Plus size={16} color={colors.primary} />} onPress={() => setEditing('new')} />}>
          Añade a tus mascotas y sus cuidados (comida, agua, paseos, veterinario) para saber qué toca cada día.
        </EmptyState>
      ) : (
        <>
          <Stats
            items={[
              { value: String(pets.length), label: pets.length === 1 ? 'Mascota' : 'Mascotas' },
              { value: String(pendingToday), label: 'Por hacer hoy' },
              { value: String(doneToday), label: doneToday === 1 ? 'Hecho hoy' : 'Hechos hoy' },
            ]}
          />
          {pets.map((p) => (
            <PetCard key={p.id} pet={p} cares={cares.filter((c) => c.petId === p.id)} today={today} now={now} onEdit={() => setEditing(p)} onCare={(c) => setCare({ pet: p, care: c })} />
          ))}
          <T v="small" tint="muted">
            Los avisos con sonido de la app anterior todavía no están en la app nueva: aquí ves cuándo toca cada cuidado y lo marcas al hacerlo.
          </T>
        </>
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nueva mascota' : 'Editar mascota'}>
        {editing !== null && <PetForm pet={editing === 'new' ? null : editing} cares={editing === 'new' ? 0 : cares.filter((c) => c.petId === editing.id).length} onDone={() => setEditing(null)} />}
      </Sheet>
      <Sheet open={care !== null} onClose={() => setCare(null)} title={care?.care ? 'Editar cuidado' : `Nuevo cuidado${care ? ` de ${care.pet.name}` : ''}`}>
        {care !== null && <CareForm pet={care.pet} care={care.care} onDone={() => setCare(null)} />}
      </Sheet>
    </ToolScreen>
  );
}

function PetCard({ pet: p, cares, today, now, onEdit, onCare }: { pet: LegacyPet; cares: LegacyPetCare[]; today: string; now: Date; onEdit: () => void; onCare: (c: LegacyPetCare | null) => void }) {
  const { colors } = useTheme();
  const species = PET_SPECIES_INFO[petSpeciesOf(p)];
  const name = p.name || 'Sin nombre';
  const sorted = [...cares].sort(byTime);
  return (
    <Card style={[st.card, { borderLeftColor: PET_COLOR }]}>
      <View style={st.head}>
        <View style={[st.avatar, { backgroundColor: `${PET_COLOR}24` }]}>
          <T v="title" style={{ fontSize: 26, lineHeight: 32 }} importantForAccessibility="no" accessibilityElementsHidden>
            {species.emoji}
          </T>
        </View>
        <View style={{ flex: 1 }}>
          <T v="heading" accessibilityRole="header" style={{ fontSize: 19, lineHeight: 24 }}>
            {name}
          </T>
          <T v="small" tint="muted">
            {species.label}
            {p.note ? ` · ${p.note}` : ''}
          </T>
        </View>
        <IconButton label={`Editar a ${name}`} onPress={onEdit} style={{ marginRight: -space[2] }}>
          <Pencil size={18} color={colors.inkMuted} />
        </IconButton>
      </View>
      {sorted.length === 0 ? (
        <T v="small" tint="muted">
          Sin cuidados todavía.
        </T>
      ) : (
        <View accessibilityLabel={`Cuidados de ${name}`}>
          {sorted.map((c, i) => (
            <Fragment key={c.id}>
              {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />}
              <CareRow care={c} petName={name} today={today} now={now} onEdit={() => onCare(c)} />
            </Fragment>
          ))}
        </View>
      )}
      <Button small variant="ghost" label="Añadir cuidado" accessibilityLabel={`Añadir cuidado para ${name}`} icon={<Plus size={16} color={colors.primary} />} onPress={() => onCare(null)} style={{ alignSelf: 'flex-start', marginLeft: -space[4] }} />
    </Card>
  );
}

function CareRow({ care: c, petName, today, now, onEdit }: { care: LegacyPetCare; petName: string; today: string; now: Date; onEdit: () => void }) {
  const { colors } = useTheme();
  const actions = useModule('petCares');
  const kind = CARE_KIND_INFO[careKindOf(c)];
  const title = c.title || kind.label;
  const done = c.lastDone === today;
  const off = c.enabled === false;
  return (
    <View style={[st.care, off && { opacity: 0.6 }]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`Hecho hoy: «${title}» de ${petName}`}
        accessibilityHint={careWhen(c, done, now)}
        onPress={() => actions.update(c.id, { lastDone: done ? '' : today })}
        style={({ pressed }) => [st.careHit, pressed && { opacity: 0.7 }]}
      >
        <View style={[st.box, { borderColor: done ? colors.success : colors.lineStrong, backgroundColor: done ? colors.success : 'transparent' }]}>{done && <Check size={16} strokeWidth={2.5} color={colors.surface} />}</View>
        <T v="body" style={{ fontSize: 20 }} importantForAccessibility="no" accessibilityElementsHidden>
          {kind.emoji}
        </T>
        <View style={{ flex: 1 }}>
          <T v="label" tint={done ? 'muted' : 'ink'} style={done && { textDecorationLine: 'line-through' }}>
            {title}
          </T>
          <T v="small" tint="muted">
            {careWhen(c, done, now)}
          </T>
        </View>
      </Pressable>
      <Toggle label={`Aviso activo: «${title}» de ${petName}`} value={!off} onChange={() => actions.update(c.id, { enabled: off })} />
      <IconButton label={`Editar «${title}» de ${petName}`} onPress={onEdit} style={{ marginRight: -space[2] }}>
        <Pencil size={16} color={colors.inkMuted} />
      </IconButton>
    </View>
  );
}

function PetForm({ pet, cares, onDone }: { pet: LegacyPet | null; cares: number; onDone: () => void }) {
  const actions = useModule('pets');
  const [name, setName] = useState(pet?.name ?? '');
  const [species, setSpecies] = useState<PetSpecies>(pet ? petSpeciesOf(pet) : 'dog');
  const [note, setNote] = useState(pet?.note ?? '');
  const submit = () => {
    if (!name.trim()) return;
    const fields = { name: name.trim(), species, note: note.trim() };
    if (pet) actions.update(pet.id, fields);
    else actions.add({ id: newId(), ...fields });
    onDone();
  };
  return (
    <ScrollView style={{ maxHeight: 620 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <Field label="Nombre" value={name} onChangeText={setName} maxLength={80} placeholder="Luna" autoFocus={!pet} />
      <DotChoices
        legend="Especie"
        value={species}
        onChange={setSpecies}
        options={PET_SPECIES.map((sp) => ({ value: sp, label: `${PET_SPECIES_INFO[sp].emoji} ${PET_SPECIES_INFO[sp].label}`, a11yLabel: PET_SPECIES_INFO[sp].label }))}
      />
      <Field label="Nota (opcional)" value={note} onChangeText={setNote} maxLength={300} placeholder="Raza, edad…" />
      <FormActions
        submitLabel={pet ? 'Guardar' : 'Añadir mascota'}
        onSubmit={submit}
        disabled={!name.trim()}
        onDelete={
          pet
            ? () => {
                actions.remove(pet.id);
                onDone();
              }
            : undefined
        }
        confirm={`Se borrará a ${pet?.name || 'esta mascota'}${cares ? ` con ${plural(cares, 'cuidado', 'cuidados')}` : ''}.`}
      />
    </ScrollView>
  );
}

function CareForm({ pet, care, onDone }: { pet: LegacyPet; care: LegacyPetCare | null; onDone: () => void }) {
  const actions = useModule('petCares');
  const [kind, setKind] = useState<CareKind>(care ? careKindOf(care) : 'comida');
  const [title, setTitle] = useState(care?.title ?? '');
  const [time, setTime] = useState(care?.time ?? '');
  const [days, setDays] = useState(weekdaysOf(care?.days));
  const hhmm = normalizeHHMM(time);
  const timeOk = !hhmm || HHMM_RE.test(hhmm);
  const submit = () => {
    if (!timeOk) return;
    // Sin título, el cuidado se llama como su tipo.
    const fields = { kind, title: title.trim() || CARE_KIND_INFO[kind].label, time: hhmm, days };
    if (care) actions.update(care.id, fields);
    else actions.add({ id: newId(), petId: pet.id, ...fields, sound: true, enabled: true, lastDone: '' });
    onDone();
  };
  return (
    <ScrollView style={{ maxHeight: 620 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <DotChoices legend="Tipo" value={kind} onChange={setKind} options={CARE_KINDS.map((k) => ({ value: k, label: `${CARE_KIND_INFO[k].emoji} ${CARE_KIND_INFO[k].label}`, a11yLabel: CARE_KIND_INFO[k].label }))} />
      <Field label="Qué hay que hacer" value={title} onChangeText={setTitle} maxLength={120} placeholder={kind === 'comida' ? 'Darle de comer' : CARE_KIND_INFO[kind].label} />
      <TimeField label="Hora (opcional)" value={time} onChange={setTime} optional />
      <WeekdayPicker legend="Días" value={days} onChange={setDays} />
      <FormActions
        submitLabel={care ? 'Guardar' : 'Añadir cuidado'}
        onSubmit={submit}
        disabled={!timeOk}
        onDelete={
          care
            ? () => {
                actions.remove(care.id);
                onDone();
              }
            : undefined
        }
        confirm={`Se borrará «${care?.title || 'este cuidado'}».`}
      />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  card: { borderLeftWidth: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  avatar: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  care: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  careHit: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: touchTarget + 12, paddingVertical: space[2] },
  box: { width: 26, height: 26, borderRadius: radius.sm, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
