import type { LegacyData } from '@dyc/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, KeyRound, MessageSquarePlus, Send, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { api } from '../app/api';
import { LEGACY_QUERY, newId, useLegacyData } from '../app/legacy';
import { keys } from '../app/queries';
import { PageHeader } from '../components/AppShell';
import { SelectField, TextField } from '../components/Form';
import { errorMessage } from '../components/States';
import {
  ASSISTANT_MODELS,
  AssistantError,
  buildContext,
  chat,
  clearSettings,
  loadSettings,
  maskKey,
  planTool,
  saveSettings,
  testConnection,
  waterPatch,
  type AssistantModel,
  type AssistantSettings,
  type ChatMessage,
  type Plan,
  type Proposal,
} from '../lib/assistant';
import { Markdown } from '../lib/markdown';

type Status = 'pending' | 'running' | 'done' | 'discarded' | 'invalid';
type Card = Proposal & { status: Status; error?: string };

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
          <PrivacyCard seen={settings.seenPrivacy} onSeen={() => update({ ...settings, seenPrivacy: true })} />
        </aside>
        <Chat settings={settings} ready={ready} />
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
            {m}
            {m === 'gemini-flash-latest' ? ' (recomendado)' : ''}
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
        <li>Siempre: lo que escribes en esta conversación, las respuestas anteriores de la misma conversación, la fecha de hoy y la lista de acciones que puede proponer.</li>
        <li>Solo con «Incluir un resumen de mis datos» activado: pendientes y tareas sin hacer, rutina de hoy, metas en curso, totales de finanzas del mes, agua, última noche de sueño, entrenos de la semana, si ya escribiste en el diario hoy y las puntuaciones y hábitos de tu panel.</li>
        <li>Nunca: tu Bóveda, tus notas, el texto de tu diario ni tu contraseña.</li>
        <li>Google trata estos datos según las condiciones de tu clave de Gemini.</li>
        <li>La conversación solo vive en esta pestaña: se borra al recargar o salir, y no se guarda en tu cuenta.</li>
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

// ---------- Conversación ----------

function Chat({ settings, ready }: { settings: AssistantSettings; ready: boolean }) {
  const legacy = useLegacyData();
  const [includeData, setIncludeData] = useState(false);
  const dashboard = useQuery({ queryKey: keys.dashboard('week'), queryFn: () => api.dashboard('week'), enabled: includeData });
  const context = useMemo(() => (includeData ? buildContext(legacy.data?.data, dashboard.data) : null), [includeData, legacy.data, dashboard.data]);

  // Solo en memoria: nada de la conversación se guarda.
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [cards, setCards] = useState<Record<string, Card>>({});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const switchId = useId();
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, cards, busy]);

  const pending = Object.values(cards).some((c) => c.status === 'pending' || c.status === 'running');
  const canSend = ready && !busy && !pending && !!text.trim();

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
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
      const newCards: Record<string, Card> = {};
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
    setHistory([]);
    setCards({});
    setError(null);
    setNote(null);
    setBusy(false);
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
          <Sparkles size={16} aria-hidden="true" /> Conversación
        </h2>
        <button type="button" className="btn btn--ghost btn--sm" onClick={reset} disabled={!history.length && !busy}>
          <MessageSquarePlus size={16} aria-hidden="true" /> Nueva conversación
        </button>
      </div>
      <p className="muted small">Solo vive en esta pestaña: se borra al recargar o salir, y no se guarda en tu cuenta.</p>

      <div className="assistant-log" ref={logRef} role="log" aria-label="Mensajes" tabIndex={0}>
        {shown.length === 0 && !busy ? (
          <div className="assistant-empty">
            <p className="muted">Pregunta lo que quieras o pídele que añada algo por ti. Antes de escribir en tus datos, te mostrará la acción para que la confirmes.</p>
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

      <form className="assistant-composer" onSubmit={send}>
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
          placeholder="Escribe un mensaje…"
          disabled={!ready}
          aria-describedby={blocked ? `${inputId}-why` : undefined}
        />
        <button type="submit" className="btn" disabled={!canSend}>
          <Send size={16} aria-hidden="true" /> Enviar
        </button>
      </form>
      {blocked && (
        <p className="muted small" id={`${inputId}-why`}>
          {blocked}
        </p>
      )}
    </section>
  );
}

function ProposalCard({ card, onDo, onDiscard }: { card: Card; onDo: (c: Card) => void; onDiscard: (c: Card) => void }) {
  const label = card.status === 'done' ? 'Hecho' : card.status === 'discarded' ? 'Descartado' : card.status === 'invalid' ? 'No se puede hacer' : 'Acción propuesta';
  return (
    <div className={`proposal proposal--${card.status}`} role="group" aria-label={`${label}: ${card.title}`}>
      <div className="proposal__head">
        <strong>{card.title}</strong>
        {card.where && <span className="chip small">{card.where}</span>}
        <span className={`proposal__state small${card.status === 'done' ? ' success-text' : ''}`}>{label}</span>
      </div>
      {card.fields.length > 0 && (
        <dl className="proposal__fields small">
          {card.fields.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {card.status === 'invalid' && <p className="field__error">{card.error}</p>}
      {card.error && card.status === 'pending' && (
        <p className="field__error" role="alert">
          {card.error}
        </p>
      )}
      {(card.status === 'pending' || card.status === 'running') && (
        <div className="row">
          <button type="button" className="btn btn--sm" onClick={() => onDo(card)} disabled={card.status === 'running'}>
            <Check size={16} aria-hidden="true" /> {card.status === 'running' ? 'Haciendo…' : 'Hacer'}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onDiscard(card)} disabled={card.status === 'running'}>
            Descartar
          </button>
        </div>
      )}
      {card.status === 'done' && <p className="small muted">{card.done}</p>}
    </div>
  );
}

/** Escribe la acción confirmada con la API de módulos (como cualquier otra sección). */
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
