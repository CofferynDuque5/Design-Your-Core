import {
  ASSISTANT_MODEL_LABEL,
  GEMINI_KEY_STEPS,
  ASSISTANT_MODELS,
  AssistantError,
  attachmentProblem,
  buildContext,
  chat,
  chatAttachmentRefs,
  chatCards,
  chatWhen,
  formatBytes,
  maskKey,
  planTool,
  storedChat,
  testConnection,
  withAttachmentData,
  ATTACH_MAX_FILES,
  type AssistantModel,
  type AssistantSettings,
  type CardStatus,
  type ChatAttachment,
  type ChatCard,
  type ChatMessage,
  type LegacyChat,
} from '@dyc/core';
import { radius, space } from '@dyc/tokens';
import { useQuery } from '@tanstack/react-query';
import { Check, ExternalLink, FileText, History, ImagePlus, KeyRound, MessageSquarePlus, Paperclip, Send, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Markdown } from '../../components/markdown';
import { ProposalView } from '../../components/ProposalView';
import { Sheet } from '../../components/Sheet';
import { ConfirmDelete, Disclosure, IconButton, Toggle, ToolScreen } from '../../components/tools';
import { Button, Card, Chip, Field, T, errorMessage, fonts, type as typo } from '../../components/ui';
import { api } from '../../lib/api';
import { useAssistantSettings } from '../../lib/assistant';
import { deleteFiles, documentAttachment, pickDocuments, pickImages, uploadFile } from '../../lib/files';
import { newId, useLegacyData, useLegacyList, useModule } from '../../lib/legacy';
import { useRunPlan } from '../../lib/plan';
import { keys } from '../../lib/queries';
import { useTheme } from '../../lib/theme';

/**
 * Asistente en el móvil, con la misma lógica que la web (@dyc/core). La clave
 * de Gemini se guarda en el llavero del teléfono (expo-secure-store), no en tu
 * cuenta ni en nuestro servidor, y cada mensaje va directamente del teléfono a
 * Google. Las acciones solo se hacen si pulsas «Hacer». Las conversaciones se
 * guardan en tu cuenta (Historial) y se pueden adjuntar fotos y archivos.
 */

type Card = ChatCard;

const SUGGESTIONS = ['Añade «comprar pan» a mis pendientes', 'Anota 2 vasos de agua', 'Ayúdame a planear mi tarde de estudio'];
const errText = (e: unknown) => (e instanceof AssistantError ? e.message : 'Algo salió mal. Inténtalo de nuevo.');
/** Los enlaces de las respuestas no tienen imágenes de notas. */
const noImages = () => null;

export default function Assistant() {
  const { settings, memoryOnly, update, remove } = useAssistantSettings();
  const ready = !!settings?.apiKey && !!settings.seenPrivacy;
  const [session, setSession] = useState<{ n: number; chat: LegacyChat | null }>({ n: 0, chat: null });
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const open = (c: LegacyChat | null) => {
    setSession((s) => ({ n: s.n + 1, chat: c }));
    setCurrentId(c?.id ?? null);
    setShowHistory(false);
  };
  return (
    <ToolScreen title="Asistente" eyebrow="Conocimiento">
      {settings && (
        <>
          <KeyCard settings={settings} memoryOnly={memoryOnly} onChange={update} onRemove={remove} />
          <PrivacyCard seen={settings.seenPrivacy} onSeen={() => update({ ...settings, seenPrivacy: true })} />
          <Conversation key={session.n} initial={session.chat} settings={settings} ready={ready} onSaved={setCurrentId} onNew={() => open(null)} onHistory={() => setShowHistory(true)} />
        </>
      )}
      <Sheet open={showHistory} onClose={() => setShowHistory(false)} title="Historial">
        {showHistory && <HistoryList currentId={currentId} onOpen={open} />}
      </Sheet>
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
          <T v="small">Para hablar con el Asistente necesitas una clave gratuita de Google. Se consigue en un par de minutos:</T>
          {GEMINI_KEY_STEPS.map((step, i) => (
            <T key={step} v="small" tint="muted">{`${i + 1}. ${step}`}</T>
          ))}
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
            <Chip key={m} label={ASSISTANT_MODEL_LABEL[m]} selected={settings.model === m} onPress={() => onChange({ ...settings, model: m as AssistantModel })} />
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
  'Siempre: lo que escribes en esta conversación (y las fotos o archivos que adjuntes), las respuestas anteriores de la misma conversación, la fecha de hoy y la lista de acciones que puede proponer.',
  'Solo con «Incluir un resumen de mis datos» activado: pendientes y tareas sin hacer, rutina de hoy, metas en curso, totales de finanzas del mes, agua, última noche de sueño, entrenos de la semana, si ya escribiste en el diario hoy y las puntuaciones y hábitos de tu panel.',
  'Nunca: tu Bóveda, tus notas, el texto de tu diario ni tu contraseña.',
  'Google trata estos datos según las condiciones de tu clave de Gemini.',
  'Tus conversaciones y sus archivos se guardan en tu cuenta para verlas en «Historial» (también en la web). Puedes borrar cada una cuando quieras.',
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

// ---------- Historial ----------

function HistoryList({ currentId, onOpen }: { currentId: string | null; onOpen: (c: LegacyChat | null) => void }) {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const chats = useLegacyList(legacy.data?.data, 'chats');
  const actions = useModule('chats', { undo: false });
  const [asking, setAsking] = useState<string | null>(null);
  if (!chats.length)
    return (
      <T v="small" tint="muted">
        Tus conversaciones aparecerán aquí para que puedas volver a ellas desde el móvil o la web.
      </T>
    );
  return (
    <View accessibilityLabel="Conversaciones guardadas" style={{ gap: space[2] }}>
      {chats.map((c) =>
        asking === c.id ? (
          <ConfirmDelete
            key={c.id}
            onConfirm={() => {
              actions.remove(c.id);
              void deleteFiles(chatAttachmentRefs(c.messages ?? []));
              setAsking(null);
              if (c.id === currentId) onOpen(null);
            }}
            onCancel={() => setAsking(null)}
          >
            {`Se borrará «${c.title}» con sus archivos.`}
          </ConfirmDelete>
        ) : (
          <View key={c.id} style={[st.historyRow, { borderColor: c.id === currentId ? colors.primary : colors.line, backgroundColor: c.id === currentId ? colors.primarySoft : 'transparent' }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${c.title}, ${chatWhen(c.updatedAt)}`}
              accessibilityState={{ selected: c.id === currentId }}
              onPress={() => onOpen(c)}
              style={({ pressed }) => [{ flex: 1, gap: 2, paddingVertical: space[2] }, pressed && { opacity: 0.7 }]}
            >
              <T v="label" numberOfLines={1}>
                {c.title}
              </T>
              <T v="small" tint="muted">
                {chatWhen(c.updatedAt)}
              </T>
            </Pressable>
            <IconButton label={`Borrar «${c.title}»`} onPress={() => setAsking(c.id)}>
              <Trash2 size={18} color={colors.inkMuted} />
            </IconButton>
          </View>
        ),
      )}
    </View>
  );
}

// ---------- Conversación ----------

function Conversation({
  initial,
  settings,
  ready,
  onSaved,
  onNew,
  onHistory,
}: {
  initial: LegacyChat | null;
  settings: AssistantSettings;
  ready: boolean;
  onSaved: (id: string) => void;
  onNew: () => void;
  onHistory: () => void;
}) {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const [includeData, setIncludeData] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const dashboard = useQuery({ queryKey: keys.dashboard('week'), queryFn: () => api.dashboard('week'), enabled: includeData });
  const context = useMemo(() => (includeData ? buildContext(legacy.data?.data, dashboard.data) : null), [includeData, legacy.data, dashboard.data]);

  const [history, setHistory] = useState<ChatMessage[]>(() => initial?.messages ?? []);
  const [cards, setCards] = useState<Record<string, Card>>(() => (initial ? chatCards(initial) : {}));
  const [files, setFiles] = useState<ChatAttachment[]>([]);
  const [reading, setReading] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  // Al abrir una conversación guardada, se vuelven a descargar sus fotos y PDF.
  useEffect(() => {
    const refs = initial ? chatAttachmentRefs(initial.messages ?? []) : [];
    if (!refs.length) return;
    let live = true;
    api.legacy
      .images(refs.slice(0, 100))
      .then((r) => live && setHistory((h) => withAttachmentData(h, r.images)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [initial]);

  // Guardar en tu cuenta: la primera vez se crea, luego se actualiza.
  const chats = useModule('chats', { undo: false });
  const chatId = useRef<string | null>(initial?.id ?? null);
  const dirty = useRef(false);
  useEffect(() => {
    if (busy || !dirty.current || !history.length) return;
    dirty.current = false;
    if (chatId.current) {
      const { id: _id, ...patch } = storedChat(chatId.current, settings.model, history, cards);
      chats.update(chatId.current, patch);
    } else {
      chatId.current = newId();
      chats.add(storedChat(chatId.current, settings.model, history, cards));
      onSaved(chatId.current);
    }
  }, [busy, history, cards, chats, settings.model, onSaved]);

  const pending = Object.values(cards).some((c) => c.status === 'pending' || c.status === 'running');
  const canSend = ready && !busy && !pending && !reading && (!!text.trim() || files.length > 0);
  const room = ATTACH_MAX_FILES - files.length;

  const attach = async (from: 'photos' | 'files') => {
    setError(null);
    if (room <= 0) return setError(`Puedes adjuntar hasta ${ATTACH_MAX_FILES} archivos por mensaje.`);
    setReading(true);
    const added: ChatAttachment[] = [];
    try {
      if (from === 'photos') {
        for (const p of await pickImages(room)) added.push({ name: p.name, mime: p.mime, kind: 'image', size: p.size, ref: '', data: p.data });
      } else {
        for (const a of await pickDocuments()) {
          const problem = attachmentProblem({ name: a.name, mime: a.mimeType ?? '', size: a.size ?? 0 }, files.length + added.length);
          if (problem) {
            setError(problem);
            break;
          }
          added.push(await documentAttachment(a));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
    } finally {
      setFiles((x) => [...x, ...added]);
      setReading(false);
    }
  };

  const send = async () => {
    if (!canSend) return;
    const message = text.trim();
    const attachments = files;
    const before = history;
    const userMsg: ChatMessage = attachments.length ? { role: 'user', content: message, attachments } : { role: 'user', content: message };
    const next: ChatMessage[] = [...history, userMsg];
    setHistory(next);
    setText('');
    setFiles([]);
    setBusy(true);
    setError(null);
    setNote(null);
    const ctrl = new AbortController();
    abort.current = ctrl;
    // Los archivos se guardan en tu cuenta mientras Gemini responde.
    const uploads = Promise.all(attachments.map(async (a) => (a.data ? { ...a, ref: await uploadFile(a.data, 'ai').catch(() => '') } : a)));
    try {
      const reply = await chat({ apiKey: settings.apiKey, model: settings.model, history: next, context, signal: ctrl.signal });
      const added: ChatMessage[] = [reply.message];
      const newCards: Record<string, Card> = {};
      for (const call of reply.message.tool_calls ?? []) {
        const p = planTool(call, legacy.data?.data, { newId });
        newCards[call.id] = { ...p, status: p.plan ? 'pending' : 'invalid' };
        // Lo que no se puede hacer se le dice al modelo en seguida.
        if (!p.plan) added.push({ role: 'tool', tool_call_id: call.id, content: `No se pudo proponer: ${p.error}` });
      }
      const saved = attachments.length ? { ...userMsg, attachments: await uploads } : userMsg;
      dirty.current = true;
      setHistory([...before, saved, ...added]);
      setCards((c) => ({ ...c, ...newCards }));
      if (reply.fellBack) setNote(`${settings.model} no respondió; se usó ${reply.model}.`);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      // El mensaje y los archivos vuelven al cuadro de texto para reintentarlo.
      void uploads.then((done) => deleteFiles(done.map((a) => a.ref).filter(Boolean)));
      setHistory(before);
      setText(message);
      setFiles(attachments);
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const exec = useRunPlan();
  const resolve = (id: string, status: CardStatus, result: string) => {
    dirty.current = true;
    setCards((c) => ({ ...c, [id]: { ...c[id], status, error: undefined } }));
    setHistory((h) => [...h, { role: 'tool', tool_call_id: id, content: result }]);
  };
  const doIt = async (card: Card) => {
    if (!card.plan) return;
    setCards((c) => ({ ...c, [card.callId]: { ...c[card.callId], status: 'running', error: undefined } }));
    try {
      await exec.mutateAsync(card.plan);
      resolve(card.callId, 'done', `Hecho. ${card.done}`);
    } catch (e) {
      setCards((c) => ({ ...c, [card.callId]: { ...c[card.callId], status: 'pending', error: `No se pudo guardar: ${errorMessage(e)}` } }));
    }
  };
  const discard = (card: Card) => resolve(card.callId, 'discarded', 'La persona descartó esta acción: no se hizo nada.');

  const reset = () => {
    abort.current?.abort();
    onNew();
  };

  const shown = history.filter((m) => m.role !== 'tool');
  const blocked = !settings.apiKey ? 'Guarda tu clave de Gemini para empezar.' : !settings.seenPrivacy ? 'Lee qué se envía a Google y pulsa «Entendido».' : pending ? 'Elige «Hacer» o «Descartar» en la acción propuesta para seguir.' : null;

  return (
    <Card style={{ gap: space[4] }}>
      <View style={st.chatHead}>
        <View style={{ flex: 1 }}>
          <CardTitle icon={<Sparkles size={18} color={colors.primary} />}>{initial ? initial.title : 'Conversación'}</CardTitle>
        </View>
        <IconButton label="Historial" onPress={onHistory}>
          <History size={20} color={colors.primary} />
        </IconButton>
        <Button small variant="ghost" label="Nueva" accessibilityLabel="Nueva conversación" icon={<MessageSquarePlus size={16} color={colors.primary} />} onPress={reset} disabled={!history.length && !busy} />
      </View>
      <T v="small" tint="muted" style={{ marginTop: -space[2] }}>
        Se guarda en tu cuenta: la encuentras en «Historial».
      </T>

      {shown.length === 0 && !busy ? (
        <View style={[st.empty, { borderColor: colors.lineStrong }]}>
          <T v="small" tint="muted" style={{ textAlign: 'center' }}>
            Pregunta lo que quieras, adjunta una foto o un PDF, o pídele que añada algo por ti. Antes de escribir en tus datos, te mostrará la acción para que la confirmes.
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
              <View key={i} accessible accessibilityLabel={`Tú: ${[m.content, ...(m.attachments ?? []).map((a) => `adjunto ${a.name}`)].filter(Boolean).join(', ')}`} style={[st.bubble, st.bubbleUser, { backgroundColor: colors.primary }]}>
                {m.attachments?.map((a, k) =>
                  a.kind === 'image' && a.data ? (
                    <Image key={k} source={{ uri: a.data }} style={st.bubbleImg} resizeMode="cover" />
                  ) : (
                    <View key={k} style={st.bubbleFile}>
                      <FileText size={16} color={colors.onPrimary} />
                      <T v="small" style={{ color: colors.onPrimary }} numberOfLines={1}>
                        {a.name}
                      </T>
                    </View>
                  ),
                )}
                {!!m.content && (
                  <T v="body" style={{ color: colors.onPrimary }}>
                    {m.content}
                  </T>
                )}
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
        {files.length > 0 && (
          <View accessibilityLabel="Archivos para enviar" style={st.chips}>
            {files.map((f, i) => (
              <View key={`${f.name}-${i}`} style={[st.attachChip, { borderColor: colors.lineStrong, backgroundColor: colors.surface }]}>
                {f.kind === 'image' && f.data ? <Image source={{ uri: f.data }} style={st.attachThumb} /> : <FileText size={16} color={colors.inkMuted} />}
                <T v="small" numberOfLines={1} style={{ maxWidth: 140 }}>
                  {f.name}
                </T>
                <T v="small" tint="muted">
                  {formatBytes(f.size)}
                </T>
                <IconButton label={`Quitar «${f.name}»`} onPress={() => setFiles((x) => x.filter((_, k) => k !== i))}>
                  <X size={16} color={colors.inkMuted} />
                </IconButton>
              </View>
            ))}
          </View>
        )}
        <TextInput
          accessibilityLabel="Mensaje para el asistente"
          accessibilityHint={blocked ?? undefined}
          value={text}
          onChangeText={setText}
          editable={ready}
          multiline
          maxLength={4000}
          placeholder={files.length ? 'Pregunta algo sobre el archivo…' : 'Escribe un mensaje…'}
          placeholderTextColor={colors.inkSubtle}
          style={[typo.body, st.input, { color: colors.ink, backgroundColor: colors.surface, borderColor: colors.lineStrong, opacity: ready ? 1 : 0.6 }]}
        />
        <View style={st.sendRow}>
          <IconButton label="Adjuntar foto" onPress={() => attach('photos')} disabled={!ready || busy || reading}>
            <ImagePlus size={20} color={colors.primary} />
          </IconButton>
          <IconButton label="Adjuntar archivo" onPress={() => attach('files')} disabled={!ready || busy || reading}>
            <Paperclip size={20} color={colors.primary} />
          </IconButton>
          {reading ? (
            <T v="small" tint="muted" style={{ flex: 1 }} accessibilityLiveRegion="polite">
              Preparando el archivo…
            </T>
          ) : blocked ? (
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
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], borderWidth: 1, borderRadius: radius.md, paddingLeft: space[3] },
  attachChip: { flexDirection: 'row', alignItems: 'center', gap: space[2], borderWidth: 1, borderRadius: radius.md, paddingLeft: space[2] },
  attachThumb: { width: 32, height: 32, borderRadius: radius.xs },
  bubbleImg: { width: 200, height: 200, borderRadius: radius.md },
  bubbleFile: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});
