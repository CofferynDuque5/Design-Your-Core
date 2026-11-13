import type { ChatCard } from '@dyc/core';
import { radius, space } from '@dyc/tokens';
import { Check } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../lib/theme';
import { Pill } from './tools';
import { Button, T } from './ui';

/** Acción propuesta (del Asistente o de las sugerencias de una sección) con «Hacer» y «Descartar». */
export function ProposalView({ card, onDo, onDiscard }: { card: ChatCard; onDo: (c: ChatCard) => void; onDiscard: (c: ChatCard) => void }) {
  const { colors } = useTheme();
  const suggestion = card.reason !== undefined;
  const label = card.status === 'done' ? 'Hecho' : card.status === 'discarded' ? 'Descartado' : card.status === 'invalid' ? 'No se puede hacer' : suggestion ? 'Sugerencia' : 'Acción propuesta';
  const active = card.status === 'pending' || card.status === 'running';
  return (
    <View accessibilityLabel={`${label}: ${card.title}`} style={[st.proposal, { backgroundColor: colors.surface, borderColor: active ? colors.primary : colors.line, opacity: card.status === 'discarded' ? 0.7 : 1 }]}>
      <View style={st.head}>
        <T v="label" style={{ flexShrink: 1 }}>
          {card.title}
        </T>
        {!!card.where && <Pill>{card.where}</Pill>}
        <T v="small" tint={card.status === 'done' ? 'primary' : 'muted'} style={{ marginLeft: 'auto' }}>
          {label}
        </T>
      </View>
      {!!card.reason && (
        <T v="small" tint="muted">
          {card.reason}
        </T>
      )}
      {card.fields.map((f, i) => (
        <View key={`${f.label}-${i}`} style={st.fieldRow}>
          <T v="small" tint="muted" style={{ width: 96 }}>
            {f.label}
          </T>
          <T v="small" style={{ flex: 1 }}>
            {f.value}
          </T>
        </View>
      ))}
      {card.status === 'invalid' && (
        <T v="small" tint="danger">
          {card.error}
        </T>
      )}
      {card.error && card.status === 'pending' && (
        <T v="small" tint="danger" accessibilityRole="alert">
          {card.error}
        </T>
      )}
      {active && (
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button small label={card.status === 'running' ? 'Haciendo…' : 'Hacer'} icon={<Check size={16} color={colors.onPrimary} />} onPress={() => onDo(card)} busy={card.status === 'running'} accessibilityLabel={`Hacer: ${card.title}`} />
          <Button small variant="ghost" label="Descartar" onPress={() => onDiscard(card)} disabled={card.status === 'running'} accessibilityLabel={`Descartar: ${card.title}`} />
        </View>
      )}
      {card.status === 'done' && !suggestion && (
        <T v="small" tint="muted">
          {card.done}
        </T>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  proposal: { borderWidth: 1, borderRadius: radius.md, padding: space[3], gap: space[2] },
  head: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] },
  fieldRow: { flexDirection: 'row', gap: space[2] },
});
