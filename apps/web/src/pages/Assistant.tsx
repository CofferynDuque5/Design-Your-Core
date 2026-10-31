import { useQuery } from '@tanstack/react-query';
import { Check, ExternalLink, FileText, History, KeyRound, MessageSquarePlus, Paperclip, Send, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import { api } from '../app/api';
import { deleteFiles, readAttachment, uploadFile } from '../app/files';
import { newId, useLegacyData, useLegacyList, useModule } from '../app/legacy';
import { useRunPlan } from '../app/plan';
import { keys } from '../app/queries';
import { PageHeader } from '../components/AppShell';
import { SelectField, TextField } from '../components/Form';
import { ProposalCard } from '../components/ProposalCard';
import { errorMessage } from '../components/States';
import { ConfirmDelete } from '../components/ToolParts';
import {
  ASSISTANT_MODEL_NOTE,
  ASSISTANT_MODELS,
  AssistantError,
  attachmentProblem,
  buildContext,
  chat,
  chatAttachmentRefs,
  chatCards,
  chatWhen,
  clearSettings,
  formatBytes,
  loadSettings,
  maskKey,
  planTool,
  saveSettings,
  storedChat,
  testConnection,
  withAttachmentData,
  type AssistantModel,
  type AssistantSettings,
  type CardStatus,
  type ChatAttachment,
  type ChatCard,
  type ChatMessage,
  type LegacyChat,
} from '../lib/assistant';
import { Markdown } from '../lib/markdown';

type Card = ChatCard;

const SUGGESTIONS = ['Añade «comprar pan» a mis pendientes', 'Anota 2 vasos de agua', 'Ayúdame a planear mi tarde de estudio'];
const errText = (e: unknown) => (e instanceof AssistantError ? e.message : 'Algo salió mal. Inténtalo de nuevo.');

export function Assistant() {
  const [settings, setSettings] = useState<AssistantSettings>(loadSettings);
  const [memoryOnly, setMemoryOnly] = useState(false);
  const update = (next: AssistantSettings) => {
    setSettings(next);
    setMemoryOnly(!saveSettings(next));
  };
  const ready = !!settings.apiKey && settings.seenPrivacy;
  // Cada conversación abierta es una sesión nueva del chat (con su id guardado, si ya existe).
  const [session, setSession] = useState<{ n: number; chat: LegacyChat | null }>({ n: 0, chat: null });
  const [currentId, setCurrentId] = useState<string | null>(null);
  const open = (c: LegacyChat | null) => {
    setSession((s) => ({ n: s.n + 1, chat: c }));
    setCurrentId(c?.id ?? null);
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Conocimiento" title="Asistente" />
      <div className="assistant-layout">
        <aside className="assistant-side stack-lg" aria-label="Ajustes del asistente">
          <KeyCard
            settings={settings}
            memoryOnly={memoryOnly}
            onChange={update}
            onRemove={() => {
              // Borra todo lo guardado en este navegador; el modelo elegido sigue en pantalla.
              clearSettings();
              setSettings({ apiKey: '', model: settings.model, seenPrivacy: settings.seenPrivacy });
              setMemoryOnly(false);
            }}
          />
          <HistoryCard currentId={currentId} onOpen={open} />
          <PrivacyCard seen={settings.seenPrivacy} onSeen={() => update({ ...settings, seenPrivacy: true })} />
        </aside>
        <Chat key={session.n} initial={session.chat} settings={settings} ready={ready} onSaved={setCurrentId} onNew={() => open(null)} />
      </div>
    </div>
  );
}

// ---------- Clave y modelo ----------

function KeyCard({ settings, memoryOnly, onChange, onRemove }: { settings: AssistantSettings; memoryOnly: boolean; onChange: (s: AssistantSettings) => void; onRemove: () => void }) {
  const [draft, setDraft] = useState('');
  const [test, setTest] = useState<{ state: 'idle' | 'busy' | 'ok' | 'error'; text: string }>({ state: 'idle', text: '' });
  const save = (e: FormEvent) => {
    e.preventDefault();
    const key = draft.trim();
    if (!key) return;
    onChange({ ...settings, apiKey: key });
    setDraft('');
    setTest({ state: 'idle', text: '' });
  };
  const remove = () => {
    onRemove();
    setTest({ state: 'idle', text: 'Clave quitada de este navegador.' });
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
    <section className="card stack" aria-labelledby="assistant-key">
      <h2 id="assistant-key" className="list-count">
        <KeyRound size={16} aria-hidden="true" /> Tu clave de Gemini
      </h2>
      {settings.apiKey ? (
        <div className="assistant-key-row">
          <span>
            Clave guardada: <code className="numeric">{maskKey(settings.apiKey)}</code>
          </span>
          <button type="button" className="btn btn--ghost btn--sm danger-text" onClick={remove}>
            <X size={16} aria-hidden="true" /> Quitar
          </button>
        </div>
      ) : (
        <form className="stack-sm" onSubmit={save}>
          <TextField
            label="Clave de la API de Gemini"
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            maxLength={200}
            hint={
              <>
                Consíguela gratis en{' '}
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
                  Google AI Studio
                  <ExternalLink size={12} aria-hidden="true" />
                  <span className="visually-hidden"> (se abre en otra pestaña)</span>
                </a>
                .
              </>
            }
          />
          <button type="submit" className="btn" disabled={!draft.trim()}>
            Guardar en este navegador
          </button>
        </form>
      )}
      <p className="muted small">
        {memoryOnly
          ? 'Tu navegador no deja guardarla: solo se usará mientras esta pestaña siga abierta.'
          : 'Se guarda solo en este navegador, no en tu cuenta ni en nuestro servidor. Con «Quitar» se borra de aquí.'}{' '}
        Cada mensaje va directamente de este navegador a Google con tu clave.
      </p>
      <SelectField label="Modelo" value={settings.model} onChange={(e) => onChange({ ...settings, model: e.target.value as AssistantModel })}>
        {ASSISTANT_MODELS.map((m) => (
          <option key={m} value={m}>
            {m} ({ASSISTANT_MODEL_NOTE[m]})
          </option>
        ))}
      </SelectField>
      <div className="stack-xs">
        <button type="button" className="btn btn--secondary btn--sm" onClick={probe} disabled={!settings.apiKey || test.state === 'busy'}>
          Probar conexión
        </button>
        <p className={`small${test.state === 'error' ? ' field__error' : test.state === 'ok' ? ' success-text' : ' muted'}`} role={test.state === 'error' ? 'alert' : 'status'}>
          {test.text}
        </p>
      </div>
    </section>
  );
}

// ---------- Privacidad ----------

function PrivacyCard({ seen, onSeen }: { seen: boolean; onSeen: () => void }) {
  return (
    <section className={`card stack-sm${seen ? ' card--quiet' : ' card--raised'}`} aria-labelledby="assistant-privacy">
      <h2 id="assistant-privacy" className="list-count">
        <ShieldCheck size={16} aria-hidden="true" /> {seen ? 'Qué se envía a Google' : 'Antes de empezar: qué se envía a Google'}
      </h2>
      <ul className="facts small">
        <li>Siempre: lo que escribes en esta conversación (y los archivos que adjuntes), las respuestas anteriores de la misma conversación, la fecha de hoy y la lista de acciones que puede proponer.</li>
        <li>Solo con «Incluir un resumen de mis datos» activado: pendientes y tareas sin hacer, rutina de hoy, metas en curso, totales de finanzas del mes, agua, última noche de sueño, entrenos de la semana, si ya escribiste en el diario hoy y las puntuaciones y hábitos de tu panel.</li>
        <li>Nunca: tu Bóveda, tus notas, el texto de tu diario ni tu contraseña.</li>
        <li>Google trata estos datos según las condiciones de tu clave de Gemini.</li>
        <li>Tus conversaciones y sus archivos se guardan en tu cuenta para verlas en «Historial» (también en el móvil). Puedes borrar cada una cuando quieras.</li>
        <li>Las acciones que proponga (añadir un pendiente, registrar agua…) solo se hacen si pulsas «Hacer».</li>
      </ul>
      {!seen && (
        <div>
          <button type="button" className="btn btn--sm" onClick={onSeen}>
            <Check size={16} aria-hidden="true" /> Entendido
          </button>
        </div>
      )}
    </section>
  );
}

// ---------- Historial ----------

function HistoryCard({ currentId, onOpen }: { currentId: string | null; onOpen: (c: LegacyChat | null) => void }) {
  const legacy = useLegacyData();
  const chats = useLegacyList(legacy.data?.data, 'chats');
  const actions = useModule('chats');
  const [asking, setAsking] = useState<LegacyChat | null>(null);
  const remove = (c: LegacyChat) => {
    actions.remove(c.id);
    void deleteFiles(chatAttachmentRefs(c.messages ?? []));
    setAsking(null);
    if (c.id === currentId) onOpen(null);
  };
  return (
    <section className="card stack-sm" aria-labelledby="assistant-history">
      <h2 id="assistant-history" className="list-count">
        <History size={16} aria-hidden="true" /> Historial
      </h2>
      {chats.length === 0 ? (
        <p className="muted small">Tus conversaciones aparecerán aquí para que puedas volver a ellas desde la web o el móvil.</p>
      ) : (
        <ul className="history-list" aria-label="Conversaciones guardadas">
          {chats.map((c) => (
            <li key={c.id} className="history-item">
              {asking?.id === c.id ? (
                <ConfirmDelete onConfirm={() => remove(c)} onCancel={() => setAsking(null)}>
                  Se borrará «{c.title}» con sus archivos.
                </ConfirmDelete>
              ) : (
                <>
                  <button type="button" className="history-item__open" onClick={() => onOpen(c)} aria-current={c.id === currentId ? 'true' : undefined}>
                    <span className="history-item__title">{c.title}</span>
                    <span className="small muted">{chatWhen(c.updatedAt)}</span>
                  </button>
                  <button type="button" className="icon-btn" onClick={() => setAsking(c)} aria-label={`Borrar «${c.title}»`}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- Conversación ----------

function Chat({ initial, settings, ready, onSaved, onNew }: { initial: LegacyChat | null; settings: AssistantSettings; ready: boolean; onSaved: (id: string) => void; onNew: () => void }) {
  const legacy = useLegacyData();
  const [includeData, setIncludeData] = useState(false);
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
  const logRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const switchId = useId();
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, cards, busy]);

  // Al abrir una conversación guardada, se vuelven a descargar sus imágenes y PDF.
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
  const chats = useModule('chats');
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

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.target.files ?? [])];
    e.target.value = '';
    setError(null);
    setReading(true);
    const added: ChatAttachment[] = [];
    try {
      for (const f of list) {
        const problem = attachmentProblem({ name: f.name, mime: f.type, size: f.size }, files.length + added.length);
        if (problem) {
          setError(problem);
          break;
        }
        added.push(await readAttachment(f));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo.');
    } finally {
      setFiles((x) => [...x, ...added]);
      setReading(false);
    }
  };

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
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

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  const shown = history.filter((m) => m.role !== 'tool');
  const blocked = !settings.apiKey ? 'Guarda tu clave de Gemini para empezar.' : !settings.seenPrivacy ? 'Lee qué se envía a Google y pulsa «Entendido».' : pending ? 'Elige «Hacer» o «Descartar» en la acción propuesta para seguir.' : null;

  return (
    <section className="card card--raised assistant-chat" aria-labelledby="assistant-chat">
      <div className="assistant-chat__head">
        <h2 id="assistant-chat" className="list-count">
          <Sparkles size={16} aria-hidden="true" /> {initial ? initial.title : 'Conversación'}
        </h2>
        <button type="button" className="btn btn--ghost btn--sm" onClick={reset} disabled={!history.length && !busy}>
          <MessageSquarePlus size={16} aria-hidden="true" /> Nueva conversación
        </button>
      </div>
      <p className="muted small">Se guarda en tu cuenta: la encuentras en «Historial».</p>

      <div className="assistant-log" ref={logRef} role="log" aria-label="Mensajes" tabIndex={0}>
        {shown.length === 0 && !busy ? (
          <div className="assistant-empty">
            <p className="muted">Pregunta lo que quieras, adjunta una foto o un PDF, o pídele que añada algo por ti. Antes de escribir en tus datos, te mostrará la acción para que la confirmes.</p>
            <div className="chips" role="group" aria-label="Ideas para empezar">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chip-btn" onClick={() => setText(s)} disabled={!ready}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="assistant-messages">
            {shown.map((m, i) =>
              m.role === 'user' ? (
                <li key={i} className="bubble bubble--user">
                  <span className="visually-hidden">Tú: </span>
                  {m.attachments?.length ? <AttachmentList items={m.attachments} /> : null}
                  {m.content}
                </li>
              ) : (
                <li key={i} className="bubble bubble--assistant">
                  <span className="visually-hidden">Asistente: </span>
                  {m.content && <Markdown text={m.content} headingBase={3} />}
                  {m.tool_calls?.map((c) => cards[c.id] && <ProposalCard key={c.id} card={cards[c.id]} onDo={doIt} onDiscard={discard} />)}
                </li>
              ),
            )}
          </ol>
        )}
        {busy && (
          <p className="assistant-thinking muted small" role="status">
            Pensando…
          </p>
        )}
      </div>

      {error && (
        <div className="alert alert--danger" role="alert">
          {error}
        </div>
      )}
      {note && <p className="muted small">{note}</p>}

      <div className="assistant-data">
        <span className="assistant-data__text">
          <label htmlFor={switchId}>Incluir un resumen de mis datos</label>
          <span className="field__hint">{includeData ? 'Se envía con cada mensaje mientras esté activado.' : 'Desactivado: el asistente no ve tus datos.'}</span>
        </span>
        <span className="switch">
          <input id={switchId} type="checkbox" role="switch" checked={includeData} onChange={(e) => setIncludeData(e.target.checked)} />
          <span aria-hidden="true" />
        </span>
      </div>
      {includeData && (
        <details className="assistant-context">
          <summary>Ver exactamente lo que se enviará</summary>
          <pre tabIndex={0} aria-label="Resumen de tus datos que se enviará">
            {context}
          </pre>
        </details>
      )}

      {files.length > 0 && (
        <ul className="attach-pending" aria-label="Archivos para enviar">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="attach-chip">
              {f.kind === 'image' && f.data ? <img src={f.data} alt="" /> : <FileText size={16} aria-hidden="true" />}
              <span className="attach-chip__name">{f.name}</span>
              <span className="small muted numeric">{formatBytes(f.size)}</span>
              <button type="button" className="icon-btn" onClick={() => setFiles((x) => x.filter((_, k) => k !== i))} aria-label={`Quitar «${f.name}»`}>
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="assistant-composer" onSubmit={send}>
        <input ref={fileRef} type="file" multiple hidden accept="image/*,.pdf,application/pdf,text/*,.md,.csv,.json" onChange={pick} aria-hidden="true" tabIndex={-1} />
        <button type="button" className="icon-btn assistant-attach" onClick={() => fileRef.current?.click()} disabled={!ready || busy || reading} aria-label="Adjuntar imagen o archivo">
          <Paperclip size={20} aria-hidden="true" />
        </button>
        <label className="visually-hidden" htmlFor={inputId}>
          Mensaje para el asistente
        </label>
        <textarea
          id={inputId}
          className="input"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          maxLength={4000}
          placeholder={files.length ? 'Pregunta algo sobre el archivo…' : 'Escribe un mensaje…'}
          disabled={!ready}
          aria-describedby={blocked ? `${inputId}-why` : undefined}
        />
        <button type="submit" className="btn" disabled={!canSend}>
          <Send size={16} aria-hidden="true" /> Enviar
        </button>
      </form>
      {reading && (
        <p className="muted small" role="status">
          Preparando el archivo…
        </p>
      )}
      {blocked && (
        <p className="muted small" id={`${inputId}-why`}>
          {blocked}
        </p>
      )}
    </section>
  );
}

/** Archivos de un mensaje: las imágenes en miniatura, el resto con su nombre. */
function AttachmentList({ items }: { items: ChatAttachment[] }) {
  return (
    <ul className="bubble__files" aria-label="Archivos adjuntos">
      {items.map((a, i) => (
        <li key={`${a.name}-${i}`}>
          {a.kind === 'image' && a.data ? (
            <img src={a.data} alt={a.name} className="bubble__img" />
          ) : (
            <span className="bubble__file">
              <FileText size={16} aria-hidden="true" /> {a.name}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
