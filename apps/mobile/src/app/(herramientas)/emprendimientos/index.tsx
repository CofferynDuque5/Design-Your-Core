import { matchesSearch, safeColor, VENTURE_COLORS, VENTURE_STAGE_INFO, ventureItemsOf, ventureSummary, type LegacyVenture } from '@dyc/core';
import { radius, space } from '@dyc/tokens';
import { useRouter, type Href } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Sheet } from '../../../components/Sheet';
import { Pill, SearchBar, ToolScreen } from '../../../components/tools';
import { Button, EmptyState, ErrorState, Loading, T, fonts } from '../../../components/ui';
import { stageOf, VentureForm } from '../../../components/ventures';
import { useLegacyData, useLegacyList } from '../../../lib/legacy';
import { useTheme } from '../../../lib/theme';

export default function Ventures() {
  const { colors } = useTheme();
  const router = useRouter();
  const legacy = useLegacyData();
  const ventures = useLegacyList(legacy.data?.data, 'ventures');
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const found = ventures.filter((v) => matchesSearch(q, v.name, v.description, ...ventureItemsOf(legacy.data?.data, v.id).map((i) => `${i.title} ${i.text ?? ''}`)));

  return (
    <ToolScreen
      title="Emprendimientos"
      refreshing={legacy.isRefetching}
      onRefresh={() => legacy.refetch()}
      right={<Button small label="Nuevo" accessibilityLabel="Nuevo emprendimiento" icon={<Plus size={16} color={colors.onPrimary} />} onPress={() => setCreating(true)} disabled={!legacy.data} />}
    >
      {legacy.isPending ? (
        <Loading label="Cargando tus emprendimientos" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : ventures.length === 0 ? (
        <EmptyState title="Guarda aquí cada negocio o proyecto" action={<Button small label="Crear el primero" onPress={() => setCreating(true)} />}>
          Para cada emprendimiento puedes guardar notas, fotos, archivos (presupuestos, presentaciones, hojas de cálculo) y enlaces.
        </EmptyState>
      ) : (
        <View style={{ gap: space[3] }} accessibilityLabel="Tus emprendimientos">
          <SearchBar label="Buscar en tus emprendimientos" value={q} onChange={setQ} placeholder="Buscar por nombre, nota o enlace…" count={found.length} />
          {found.map((v) => (
            <VentureCard key={v.id} venture={v} summary={ventureSummary(ventureItemsOf(legacy.data.data, v.id))} />
          ))}
        </View>
      )}
      <Sheet open={creating} onClose={() => setCreating(false)} title="Nuevo emprendimiento">
        {creating && (
          <VentureForm
            venture={null}
            onDone={(id) => {
              setCreating(false);
              if (id) router.push(`/emprendimientos/${encodeURIComponent(id)}` as Href);
            }}
          />
        )}
      </Sheet>
    </ToolScreen>
  );
}

function VentureCard({ venture: v, summary }: { venture: LegacyVenture; summary: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const color = safeColor(v.color, VENTURE_COLORS[0]);
  const stage = VENTURE_STAGE_INFO[stageOf(v)].label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${v.name}. ${stage}. ${summary}`}
      accessibilityHint="Abre el emprendimiento"
      onPress={() => router.push(`/emprendimientos/${encodeURIComponent(v.id)}` as Href)}
      style={({ pressed }) => [st.card, { backgroundColor: colors.surface, borderColor: colors.line, borderLeftColor: color, opacity: pressed ? 0.8 : 1 }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <T v="label" style={{ fontFamily: fonts.semibold, flexShrink: 1 }} numberOfLines={2}>
          {v.name}
        </T>
        <Pill color={color}>{stage}</Pill>
      </View>
      {!!v.description && (
        <T v="small" tint="muted" numberOfLines={2}>
          {v.description}
        </T>
      )}
      <T v="small" tint="muted">
        {summary}
      </T>
    </Pressable>
  );
}

const st = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderLeftWidth: 4, padding: space[4], gap: space[2] },
});
