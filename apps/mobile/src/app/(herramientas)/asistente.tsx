import {
  ASSISTANT_MODELS,
  AssistantError,
  buildContext,
  chat,
  DEFAULT_MODEL,
  maskKey,
  parseAssistantSettings,
  planTool,
  testConnection,
  waterPatch,
  type AssistantModel,
  type AssistantSettings,
  type ChatMessage,
  type LegacyData,
  type Plan,
  type Proposal,
} from '@dyc/core';
import { radius, space } from '@dyc/tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, KeyRound, MessageSquarePlus, Send, ShieldCheck, Sparkles, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Markdown } from '../../components/markdown';
import { Disclosure, Pill, Toggle, ToolScreen } from '../../components/tools';
import { Button, Card, Chip, Field, T, errorMessage, fonts, type as typo } from '../../components/ui';
import { api } from '../../lib/api';
import { LEGACY_QUERY, newId, useLegacyData } from '../../lib/legacy';
import { keys } from '../../lib/queries';
import { storage } from '../../lib/storage';
import { useTheme } from '../../lib/theme';

/**
 * Asistente en el móvil, con la misma lógica que la web (@dyc/core). La clave
 * de Gemini se guarda en el llavero del teléfono (expo-secure-store), no en tu
 * cuenta ni en nuestro servidor, y cada mensaje va directamente del teléfono a
 * Google. Las acciones solo se hacen si pulsas «Hacer».
 */

/** Misma clave que en la web, pero en el llavero de este teléfono. */
const ASSISTANT_STORAGE_KEY = 'dyc.assistant';

type Status = 'pending' | 'running' | 'done' | 'discarded' | 'invalid';
type ProposalCard = Proposal & { status: Status; error?: string };

const SUGGESTIONS = ['Añade «comprar pan» a mis pendientes', 'Anota 2 vasos de agua', 'Ayúdame a planear mi tarde de estudio'];
const errText = (e: unknown) => (e instanceof AssistantError ? e.message : 'Algo salió mal. Inténtalo de nuevo.');
/** Los enlaces de las respuestas no tienen imágenes de notas. */
const noImages = () => null;

function useAssistantSettings() {
  const [settings, setSettings] = useState<AssistantSettings | null>(null);
  const [memoryOnly, setMemoryOnly] = useState(false);
  useEffect(() => {
    let live = true;
    storage
      .get(ASSISTANT_STORAGE_KEY)
      .then((raw) => (raw ? parseAssistantSettings(JSON.parse(raw)) : parseAssistantSettings({})))
      .catch(() => parseAssistantSettings({}))
      .then((s) => live && setSettings(s));
    return () => {
      live = false;
    };
  }, []);
  const update = (next: AssistantSettings) => {
    setSettings(next);
    setMemoryOnly(false);
    storage.set(ASSISTANT_STORAGE_KEY, JSON.stringify(next)).catch(() => setMemoryOnly(true));
  };
  const remove = () => {
    // Borra lo guardado en el teléfono; el modelo elegido sigue en pantalla.
    setSettings((s) => ({ apiKey: '', model: s?.model ?? DEFAULT_MODEL, seenPrivacy: s?.seenPrivacy ?? false }));
    setMemoryOnly(false);
    void storage.set(ASSISTANT_STORAGE_KEY, null).catch(() => undefined);
  };
  return { settings, memoryOnly, update, remove };
}

export default function Assistant() {
  const { settings, memoryOnly, update, remove } = useAssistantSettings();
  const ready = !!settings?.apiKey && !!settings.seenPrivacy;
  return (
    <ToolScreen title="Asistente" eyebrow="Conocimiento">
      {settings && (
        <>
          <KeyCard settings={settings} memoryOnly={memoryOnly} onChange={update} onRemove={remove} />
          <PrivacyCard seen={settings.seenPrivacy} onSeen={() => update({ ...settings, seenPrivacy: true })} />
          <Conversation settings={settings} ready={ready} />
        </>
      )}
    </ToolScreen>
  );
}

// ---------- Clave y modelo ----------

function CardTitle({ icon, children }: { icon: React.ReactNode; children: string }) {
  return (
    <View style={st.cardTitle}>
      {icon}
      <T v="label" accessibilityRole="header">
        {children}
      </T>
    </View>
  );
}

function KeyCard({ settings, memoryOnly, onChange, onRemove }: { settings: AssistantSettings; memoryOnly: boolean; onChange: (s: AssistantSettings) => void; onRemove: () => void }) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState('');
  const [test, setTest] = useState<{ state: 'idle' | 'busy' | 'ok' | 'error'; text: string }>({ state: 'idle', text: '' });
  const save = () => {
    const key = draft.trim();
    if (!key) return;
    onChange({ ...settings, apiKey: key });
    setDraft('');
    setTest({ state: 'idle', text: '' });
  };
  const probe = async () => {
    setTest({ state: 'busy', text: 'Probando la conexión…' });
    try {
      await testConnection(settings.apiKey, settings.model);
      setTest({ state: 'ok', text: `Conexión correcta con ${settings.model}.` });
    } catch (e) {
      setTest({ state: 'error', text: errText(e) });
    }
  };

  return (
    <Card>
      <CardTitle icon={<KeyRound size={18} color={colors.primary} />}>Tu clave de Gemini</CardTitle>
      {settings.apiKey ? (
        <View style={st.keyRow}>
          <T v="body" style={{ flex: 1 }}>
            Clave guardada: <T v="body" style={{ fontVariant: ['tabular-nums'], fontFamily: fonts.medium }}>{maskKey(settings.apiKey)}</T>
          </T>
          <Button
            small
            variant="ghost"
            label="Quitar"
            icon={<X size={16} color={colors.primary} />}
            onPress={() => {
              onRemove();
              setTest({ state: 'idle', text: 'Clave quitada de este teléfono.' });
            }}
          />
        </View>
      ) : (
        <View style={{ gap: space[3] }}>
          <Field
            label="Clave de la API de Gemini"
            value={draft}
            onChangeText={setDraft}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={200}
            returnKeyType="done"
            onSubmitEditing={save}
          />
          <Pressable accessibilityRole="link" accessibilityLabel="Consíguela gratis en Google AI Studio (se abre en el navegador)" onPress={() => Linking.openURL('https://aistudio.google.com/apikey')} style={st.link}>
            <T v="small" tint="primary" style={{ fontFamily: fonts.medium }}>
              Consíguela gratis en Google AI Studio
            </T>
            <ExternalLink size={14} color={colors.primary} />
          </Pressable>
          <Button label="Guardar en este teléfono" onPress={save} disabled={!draft.trim()} />
        </View>
      )}
      <T v="small" tint="muted">
        {memoryOnly
          ? 'El teléfono no dejó guardarla: solo se usará mientras esta pantalla siga abierta.'
          : 'Se guarda en el llavero de este teléfono, no en tu cuenta ni en nuestro servidor. Con «Quitar» se borra de aquí.'}{' '}
        Cada mensaje va directamente del teléfono a Google con tu clave.
      </T>
      <View style={{ gap: space[2] }}>
        <T v="label">Modelo</T>
        <View accessibilityRole="radiogroup" accessibilityLabel="Modelo" style={st.chips}>
          {ASSISTANT_MODELS.map((m) => (
            <Chip key={m} label={m === DEFAULT_MODEL ? `${m} (recomendado)` : m} selected={settings.model === m} onPress={() => onChange({ ...settings, model: m as AssistantModel })} />
          ))}
        </View>
      </View>
      <View style={{ gap: space[2], alignItems: 'flex-start' }}>
        <Button small variant="secondary" label="Probar conexión" onPress={probe} disabled={!settings.apiKey} busy={test.state === 'busy'} />
        {!!test.text && (
          <T v="small" tint={test.state === 'error' ? 'danger' : test.state === 'ok' ? 'primary' : 'muted'} accessibilityLiveRegion="polite" accessibilityRole={test.state === 'error' ? 'alert' : undefined}>
            {test.text}
          </T>
        )}
      </View>
    </Card>
  );
}

// ---------- Privacidad ----------

const PRIVACY = [
  'Siempre: lo que escribes en esta conversación, las respuestas anteriores de la misma conversación, la fecha de hoy y la lista de acciones que puede proponer.',
  'Solo con «Incluir un resumen de mis datos» activado: pendientes y tareas sin hacer, rutina de hoy, metas en curso, totales de finanzas del mes, agua, última noche de sueño, entrenos de la semana, si ya escribiste en el diario hoy y las puntuaciones y hábitos de tu panel.',
  'Nunca: tu Bóveda, tus notas, el texto de tu diario ni tu contraseña.',
  'Google trata estos datos según las condiciones de tu clave de Gemini.',
  'La conversación solo vive en esta pantalla: se borra al salir, y no se guarda en tu cuenta.',
  'Las acciones que proponga (añadir un pendiente, registrar agua…) solo se hacen si pulsas «Hacer».',
];

function PrivacyCard({ seen, onSeen }: { seen: boolean; onSeen: () => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(!seen);
  const list = (
    <View style={{ gap: space[2] }}>
      {PRIVACY.map((p) => (
        <View key={p} style={st.fact}>
          <View style={[st.bullet, { backgroundColor: colors.primary }]} />
          <T v="small" tint="muted" style={{ flex: 1 }}>
            {p}
          </T>
        </View>
      ))}
    </View>
  );
  if (!seen)
    return (
      <Card tone="accent">
        <CardTitle icon={<ShieldCheck size={18} color={colors.primary} />}>Antes de empezar: qué se envía a Google</CardTitle>
        {list}
        <View style={{ alignItems: 'flex-start' }}>
          <Button small label="Entendido" icon={<Check size={16} color={colors.onPrimary} />} onPress={onSeen} />
        </View>
      </Card>
    );
  return (
    <Card tone="sunken">
      <Disclosure label="Qué se envía a Google" open={open} onToggle={() => setOpen((o) => !o)} a11yLabel="Qué se envía a Google" />
      {open && list}
    </Card>
  );
}

// ---------- Conversación ----------

function Conversation({ settings, ready }: { settings: AssistantSettings; ready: boolean }) {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const [includeData, setIncludeData] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const dashboard = useQuery({ queryKey: keys.dashboard('week'), queryFn: () => api.dashboard('week'), enabled: includeData });
  const context = useMemo(() => (includeData ? buildContext(legacy.data?.data, dashboard.data) : null), [includeData, legacy.data, dashboard.data]);

  // Solo en memoria: nada de la conversación se guarda.
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [cards, setCards] = useState<Record<string, ProposalCard>>({});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const pending = Object.values(cards).some((c) => c.status === 'pending' || c.status === 'running');
  const canSend = ready && !busy && !pending && !!text.trim();

  const send = async () => {
    if (!canSend) return;
    const message = text.trim();
    const before = history;
    const next: ChatMessage[] = [...history, { role: 'user', content: message }];
    setHistory(next);
    setText('');
    setBusy(true);
    setError(null);
    setNote(null);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const reply = await chat({ apiKey: settings.apiKey, model: settings.model, history: next, context, signal: ctrl.signal });
      const added: ChatMessage[] = [reply.message];
      const newCards: Record<string, ProposalCard> = {};
      for (const call of reply.message.tool_calls ?? []) {
        const p = planTool(call, legacy.data?.data, { newId });
        newCards[call.id] = { ...p, status: p.plan ? 'pending' : 'invalid' };
        // Lo que no se puede hacer se le dice al modelo en seguida.
        if (!p.plan) added.push({ role: 'tool', tool_call_id: call.id, content: `No se pudo proponer: ${p.error}` });
      }
      setHistory([...next, ...added]);
      setCards((c) => ({ ...c, ...newCards }));
      if (reply.fellBack) setNote(`${settings.model} no respondió; se usó ${reply.model}.`);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      // El mensaje vuelve al cuadro de texto para reintentarlo.
      setHistory(before);
      setText(message);
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const qc = useQueryClient();
  const exec = useMutation({
    mutationKey: ['legacy', 'assistant'],
    scope: { id: 'legacy' },
    mutationFn: (plan: Plan) => runPlan(plan, qc.getQueryData<{ data: LegacyData }>(LEGACY_QUERY)?.data),
    onSettled: () => {
      if (qc.isMutating({ mutationKey: ['legacy'] }) <= 1) return qc.invalidateQueries({ queryKey: LEGACY_QUERY });
    },
  });

  const resolve = (id: string, status: Status, result: string) => {
    setCards((c) => ({ ...c, [id]: { ...c[id], status, error: undefined } }));
    setHistory((h) => [...h, { role: 'tool', tool_call_id: id, content: result }]);
  };
  const doIt = async (card: ProposalCard) => {
    if (!card.plan) return;
    setCards((c) => ({ ...c, [card.callId]: { ...c[card.callId], status: 'running', error: undefined } }));
    try {
      await exec.mutateAsync(card.plan);
      resolve(card.callId, 'done', `Hecho. ${card.done}`);
    } catch (e) {
      setCards((c) => ({ ...c, [card.callId]: { ...c[card.callId], status: 'pending', error: `No se pudo guardar: ${errorMessage(e)}` } }));
    }
  };
  const discard = (card: ProposalCard) => resolve(card.callId, 'discarded', 'La persona descartó esta acción: no se hizo nada.');

  const reset = () => {
    abort.current?.abort();
    setHistory([]);
    setCards({});
    setError(null);
    setNote(null);
    setBusy(false);
  };

  const shown = history.filter((m) => m.role !== 'tool');
  const blocked = !settings.apiKey ? 'Guarda tu clave de Gemini para empezar.' : !settings.seenPrivacy ? 'Lee qué se envía a Google y pulsa «Entendido».' : pending ? 'Elige «Hacer» o «Descartar» en la acción propuesta para seguir.' : null;

  return (
    <Card style={{ gap: space[4] }}>
      <View style={st.chatHead}>
        <View style={{ flex: 1 }}>
          <CardTitle icon={<Sparkles size={18} color={colors.primary} />}>Conversación</CardTitle>
        </View>
        <Button small variant="ghost" label="Nueva" accessibilityLabel="Nueva conversación" icon={<MessageSquarePlus size={16} color={colors.primary} />} onPress={reset} disabled={!history.length && !busy} />
      </View>
      <T v="small" tint="muted" style={{ marginTop: -space[2] }}>
        Solo vive en esta pantalla: se borra al salir, y no se guarda en tu cuenta.
      </T>

      {shown.length === 0 && !busy ? (
        <View style={[st.empty, { borderColor: colors.lineStrong }]}>
          <T v="small" tint="muted" style={{ textAlign: 'center' }}>
            Pregunta lo que quieras o pídele que añada algo por ti. Antes de escribir en tus datos, te mostrará la acción para que la confirmes.
          </T>
          <View accessibilityLabel="Ideas para empezar" style={[st.chips, { justifyContent: 'center' }]}>
            {SUGGESTIONS.map((s) => (
              <Pressable
                key={s}
                accessibilityRole="button"
                accessibilityState={{ disabled: !ready }}
                disabled={!ready}
                onPress={() => setText(s)}
                style={({ pressed }) => [st.suggestion, { borderColor: colors.lineStrong, backgroundColor: colors.surface, opacity: !ready ? 0.45 : pressed ? 0.7 : 1 }]}
              >
                <T v="small" tint="primary" style={{ fontFamily: fonts.medium }}>
                  {s}
                </T>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <View accessibilityLabel="Mensajes" style={{ gap: space[3] }}>
          {shown.map((m, i) =>
            m.role === 'user' ? (
              <View key={i} accessible accessibilityLabel={`Tú: ${m.content}`} style={[st.bubble, st.bubbleUser, { backgroundColor: colors.primary }]}>
                <T v="body" style={{ color: colors.onPrimary }}>
                  {m.content}
                </T>
              </View>
            ) : (
              <View key={i} style={[st.bubble, st.bubbleAssistant, { backgroundColor: colors.surfaceSunken }]}>
                {!!m.content && <Markdown text={m.content} resolveImage={noImages} />}
                {m.tool_calls?.map((c) => cards[c.id] && <ProposalView key={c.id} card={cards[c.id]} onDo={doIt} onDiscard={discard} />)}
              </View>
            ),
          )}
        </View>
      )}
      {busy && (
        <T v="small" tint="muted" accessibilityLiveRegion="polite">
          Pensando…
        </T>
      )}
      {error && (
        <View accessibilityRole="alert" style={[st.alert, { borderColor: colors.danger }]}>
          <T v="small" tint="danger">
            {error}
          </T>
        </View>
      )}
      {note && (
        <T v="small" tint="muted">
          {note}
        </T>
      )}

      <View style={[st.dataRow, { borderColor: colors.line }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="label">Incluir un resumen de mis datos</T>
          <T v="small" tint="muted">
            {includeData ? 'Se envía con cada mensaje mientras esté activado.' : 'Desactivado: el asistente no ve tus datos.'}
          </T>
        </View>
        <Toggle label="Incluir un resumen de mis datos" value={includeData} onChange={setIncludeData} />
      </View>
      {includeData && (
        <View style={{ gap: space[2] }}>
          <Disclosure label="Ver exactamente lo que se enviará" open={showContext} onToggle={() => setShowContext((o) => !o)} a11yLabel="Ver exactamente lo que se enviará" />
          {showContext && (
            <View accessible accessibilityLabel={`Resumen de tus datos que se enviará: ${context ?? ''}`} style={[st.context, { backgroundColor: colors.surfaceSunken }]}>
              <T v="small" tint="muted">
                {context}
              </T>
            </View>
          )}
        </View>
      )}

      <View style={{ gap: space[2] }}>
        <TextInput
          accessibilityLabel="Mensaje para el asistente"
          accessibilityHint={blocked ?? undefined}
          value={text}
          onChangeText={setText}
          editable={ready}
          multiline
          maxLength={4000}
          placeholder="Escribe un mensaje…"
          placeholderTextColor={colors.inkSubtle}
          style={[typo.body, st.input, { color: colors.ink, backgroundColor: colors.surface, borderColor: colors.lineStrong, opacity: ready ? 1 : 0.6 }]}
        />
        <View style={st.sendRow}>
          {blocked ? (
            <T v="small" tint="muted" style={{ flex: 1 }}>
              {blocked}
            </T>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <Button label="Enviar" icon={<Send size={16} color={colors.onPrimary} />} onPress={send} disabled={!canSend} />
        </View>
      </View>
    </Card>
  );
}

function ProposalView({ card, onDo, onDiscard }: { card: ProposalCard; onDo: (c: ProposalCard) => void; onDiscard: (c: ProposalCard) => void }) {
  const { colors } = useTheme();
  const label = card.status === 'done' ? 'Hecho' : card.status === 'discarded' ? 'Descartado' : card.status === 'invalid' ? 'No se puede hacer' : 'Acción propuesta';
  const active = card.status === 'pending' || card.status === 'running';
  return (
    <View accessibilityLabel={`${label}: ${card.title}`} style={[st.proposal, { backgroundColor: colors.surface, borderColor: active ? colors.primary : colors.line, opacity: card.status === 'discarded' ? 0.7 : 1 }]}>
      <View style={st.proposalHead}>
        <T v="label" style={{ flexShrink: 1 }}>
          {card.title}
        </T>
        {!!card.where && <Pill>{card.where}</Pill>}
        <T v="small" tint={card.status === 'done' ? 'primary' : 'muted'} style={{ marginLeft: 'auto' }}>
          {label}
        </T>
      </View>
      {card.fields.map((f) => (
        <View key={f.label} style={st.fieldRow}>
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
      {card.status === 'done' && (
        <T v="small" tint="muted">
          {card.done}
        </T>
      )}
    </View>
  );
}

/** Escribe la acción confirmada con la API de módulos (como cualquier otra herramienta). */
async function runPlan(plan: Plan, data: LegacyData | undefined): Promise<unknown> {
  switch (plan.kind) {
    case 'add':
      return api.modules.add(plan.key, plan.item as never);
    case 'update':
      return api.modules.update(plan.key, plan.id, plan.patch as never);
    case 'water':
      return api.modules.patch('dayLog', waterPatch(data, plan.glasses, plan.today));
  }
}

const st = StyleSheet.create({
  cardTitle: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  fact: { flexDirection: 'row', gap: space[2], alignItems: 'flex-start' },
  bullet: { width: 5, height: 5, borderRadius: 3, marginTop: 8 },
  chatHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.lg, padding: space[4], gap: space[3], alignItems: 'center' },
  suggestion: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space[3], borderRadius: radius.pill, borderWidth: 1 },
  bubble: { borderRadius: radius.lg, padding: space[3], gap: space[3], maxWidth: '92%' },
  bubbleUser: { alignSelf: 'flex-end', borderBottomRightRadius: radius.xs },
  bubbleAssistant: { alignSelf: 'flex-start', borderBottomLeftRadius: radius.xs },
  alert: { borderWidth: 1, borderRadius: radius.md, padding: space[3] },
  dataRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space[3] },
  context: { borderRadius: radius.md, padding: space[3] },
  input: { minHeight: 88, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space[3], paddingTop: space[2], paddingBottom: space[2], textAlignVertical: 'top' },
  sendRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  proposal: { borderWidth: 1, borderRadius: radius.md, padding: space[3], gap: space[2] },
  proposalHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] },
  fieldRow: { flexDirection: 'row', gap: space[2] },
});
