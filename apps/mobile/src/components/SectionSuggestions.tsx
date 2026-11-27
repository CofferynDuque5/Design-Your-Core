import { canSuggest, suggest, suggestContext, TOOL_CATALOG, AssistantError, type ChatCard, type ToolId } from '@dyc/core';
import { space } from '@dyc/tokens';
import { usePathname, useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useAssistantSettings } from '../lib/assistant';
import { newId, useLegacyData } from '../lib/legacy';
import { useRunPlan } from '../lib/plan';
import { useTheme } from '../lib/theme';
import { ProposalView } from './ProposalView';
import { Sheet } from './Sheet';
import { Disclosure } from './tools';
import { Button, T, errorMessage } from './ui';

/** La herramienta de la ruta actual, si tiene sugerencias. */
function useSuggestTool(): ToolId | null {
  const pathname = usePathname();
  const tool = TOOL_CATALOG.find((t) => pathname === t.path || pathname.startsWith(`${t.path}/`));
  return tool && canSuggest(tool.id) ? tool.id : null;
}

/** Botón «Sugerencias» bajo el título de cada herramienta; abre las sugerencias con «Hacer». */
export function SuggestButton() {
  const { colors } = useTheme();
  const tool = useSuggestTool();
  const [open, setOpen] = useState(false);
  if (!tool) return null;
  const label = TOOL_CATALOG.find((t) => t.id === tool)?.label ?? '';
  return (
    <>
      <View style={{ alignItems: 'flex-start' }}>
        <Button small variant="secondary" label="Sugerencias" icon={<Sparkles size={16} color={colors.primary} />} onPress={() => setOpen(true)} />
      </View>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Sugerencias para ${label}`}>
        {open && <SuggestionsPanel tool={tool} onLeave={() => setOpen(false)} />}
      </Sheet>
    </>
  );
}

export function SuggestionsPanel({ tool, onLeave }: { tool: ToolId; onLeave: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { settings } = useAssistantSettings();
  const legacy = useLegacyData();
  const [cards, setCards] = useState<ChatCard[]>([]);
  const [intro, setIntro] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const [showData, setShowData] = useState(false);
  const shownTitles = useRef<string[]>([]);
  const exec = useRunPlan();

  if (!settings) return null;
  if (!settings.apiKey)
    return (
      <View style={{ gap: space[3] }}>
        <T v="body">Las sugerencias las prepara el Asistente con tu clave de Gemini, mirando lo que tienes en esta sección.</T>
        <T v="small" tint="muted">
          Guarda tu clave en el Asistente (es gratis) y vuelve aquí.
        </T>
        <View style={{ alignItems: 'flex-start' }}>
          <Button
            label="Ir al Asistente"
            icon={<Sparkles size={16} color={colors.onPrimary} />}
            onPress={() => {
              onLeave();
              router.push('/asistente');
            }}
          />
        </View>
      </View>
    );

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await suggest({ apiKey: settings.apiKey, model: settings.model, tool, data: legacy.data?.data, newId, avoid: shownTitles.current });
      shownTitles.current = [...shownTitles.current, ...r.proposals.map((p) => p.title)].slice(-12);
      setCards(r.proposals.map((p) => ({ ...p, status: 'pending' })));
      setIntro(r.proposals.length ? r.intro : r.intro || 'Esta vez no salió ninguna sugerencia que se pueda aplicar. Pide otras.');
      setAsked(true);
    } catch (e) {
      setError(e instanceof AssistantError ? e.message : 'Algo salió mal. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };
  const set = (id: string, patch: Partial<ChatCard>) => setCards((cs) => cs.map((c) => (c.callId === id ? { ...c, ...patch } : c)));
  const doIt = async (card: ChatCard) => {
    if (!card.plan) return;
    set(card.callId, { status: 'running', error: undefined });
    try {
      await exec.mutateAsync(card.plan);
      set(card.callId, { status: 'done' });
    } catch (e) {
      set(card.callId, { status: 'pending', error: `No se pudo guardar: ${errorMessage(e)}` });
    }
  };

  return (
    <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: space[3] }}>
      <T v="small" tint="muted">
        Al pedirlas se envían a Google, con tu clave, los datos de esta sección (nunca tu Bóveda ni el texto de tu diario). Nada cambia hasta que pulses «Hacer».
      </T>
      <Disclosure label="Ver lo que se enviará" open={showData} onToggle={() => setShowData((o) => !o)} a11yLabel="Ver lo que se enviará" />
      {showData && (
        <T v="small" tint="muted" accessibilityLabel={`Datos de esta sección que se enviarán: ${suggestContext(tool, legacy.data?.data)}`}>
          {suggestContext(tool, legacy.data?.data)}
        </T>
      )}
      {error && (
        <T v="small" tint="danger" accessibilityRole="alert">
          {error}
        </T>
      )}
      {busy && (
        <T v="small" tint="muted" accessibilityLiveRegion="polite">
          Pensando sugerencias…
        </T>
      )}
      {asked && !busy && !!intro && <T v="body">{intro}</T>}
      {!busy && cards.map((c) => <ProposalView key={c.callId} card={c} onDo={doIt} onDiscard={(x) => set(x.callId, { status: 'discarded' })} />)}
      <View style={{ alignItems: 'flex-start' }}>
        <Button label={asked ? 'Pedir otras' : 'Pedir sugerencias'} icon={<Sparkles size={16} color={colors.onPrimary} />} onPress={ask} busy={busy} disabled={!legacy.data} />
      </View>
    </ScrollView>
  );
}
