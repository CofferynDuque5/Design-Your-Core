import { TOOL_CATALOG, TOOL_GROUPS, toolStatus, type ToolInfo } from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { useRouter, type Href } from 'expo-router';
import { ChevronRight, ExternalLink } from 'lucide-react-native';
import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card, ErrorState, Loading, PageHeader, Screen, SectionHeader, T, fonts } from '../../components/ui';
import { useLegacyData } from '../../lib/legacy';
import { useTheme } from '../../lib/theme';
import { NATIVE_TOOLS, TOOL_ICONS } from '../../lib/tools';
import { openOnWeb } from '../../lib/web';

export default function More() {
  const legacy = useLegacyData();
  const onWeb = TOOL_CATALOG.filter((t) => !NATIVE_TOOLS.has(t.id)).length;

  return (
    <Screen refreshing={legacy.isRefetching} onRefresh={() => legacy.refetch()}>
      <PageHeader eyebrow="Más" title="Tus herramientas" />
      <T v="body" tint="muted" style={{ marginTop: -space[3] }}>
        Todo lo de la app anterior, con tus datos. {NATIVE_TOOLS.size} ya están en el móvil; las otras {onWeb} se abren en la web mientras llegan.
      </T>
      {legacy.isPending ? (
        <Loading label="Cargando tus herramientas" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : (
        TOOL_GROUPS.map((g) => (
          <View key={g.id} style={{ gap: space[3] }}>
            <SectionHeader title={g.label} />
            <Card style={{ paddingVertical: space[1], gap: 0 }}>
              {TOOL_CATALOG.filter((t) => t.group === g.id).map((t, i) => (
                <Fragment key={t.id}>
                  {i > 0 && <Divider />}
                  <ToolRow tool={t} status={toolStatus(t, legacy.data.data)} />
                </Fragment>
              ))}
            </Card>
          </View>
        ))
      )}
    </Screen>
  );
}

function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 52 }} />;
}

function ToolRow({ tool, status }: { tool: ToolInfo; status: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const Icon = TOOL_ICONS[tool.id];
  const native = NATIVE_TOOLS.has(tool.id);
  return (
    <Pressable
      accessibilityRole={native ? 'button' : 'link'}
      accessibilityLabel={`${tool.label}, ${status}${native ? '' : ', en la web'}`}
      accessibilityHint={native ? tool.description : `${tool.description}. Se abre en el navegador.`}
      onPress={() => (native ? router.push(tool.path as Href) : openOnWeb(tool.path))}
      style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
    >
      <View style={[s.icon, { backgroundColor: native ? colors.primarySoft : colors.surfaceSunken }]}>
        <Icon size={20} strokeWidth={1.75} color={native ? colors.primary : colors.inkMuted} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
          <T v="label">{tool.label}</T>
          {!native && (
            <View style={[s.badge, { borderColor: colors.lineStrong }]}>
              <T v="small" tint="muted" style={{ fontSize: 12, lineHeight: 16, fontFamily: fonts.medium }}>
                En la web
              </T>
            </View>
          )}
        </View>
        <T v="small" tint="muted" numberOfLines={2}>
          {tool.description}
        </T>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2, maxWidth: 104 }}>
        <T v="small" tint="subtle" style={{ fontVariant: ['tabular-nums'], textAlign: 'right' }} numberOfLines={2}>
          {status}
        </T>
      </View>
      {native ? <ChevronRight size={18} color={colors.inkSubtle} /> : <ExternalLink size={16} color={colors.inkSubtle} />}
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: touchTarget + 16, paddingVertical: space[3] },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  badge: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space[2] },
});
