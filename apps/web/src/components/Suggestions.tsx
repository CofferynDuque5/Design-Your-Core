import { canSuggest, suggestContext, TOOL_CATALOG, type ChatCard, type ToolId } from '@dyc/core';
import { Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useInRouterContext, useLocation } from 'react-router';
import { newId, useLegacyData } from '../app/legacy';
import { useRunPlan } from '../app/plan';
import { AssistantError, loadSettings, suggest } from '../lib/assistant';
import { Dialog } from './Dialog';
import { ProposalCard } from './ProposalCard';
import { errorMessage } from './States';

/** La sección de la ruta actual, si tiene sugerencias. */
function useSuggestTool(): ToolId | null {
  const { pathname } = useLocation();
  const tool = TOOL_CATALOG.find((t) => pathname === t.path || pathname.startsWith(`${t.path}/`));
  return tool && canSuggest(tool.id) ? tool.id : null;
}

/** Botón «Sugerencias» de la cabecera de cada sección (fuera de un router no se muestra). */
export function SuggestButton() {
  return useInRouterContext() ? <SuggestButtonInRouter /> : null;
}

function SuggestButtonInRouter() {
  const tool = useSuggestTool();
  const [open, setOpen] = useState(false);
  if (!tool) return null;
  const label = TOOL_CATALOG.find((t) => t.id === tool)?.label ?? '';
  return (
    <>
      <button type="button" className="btn btn--secondary suggest-btn" onClick={() => setOpen(true)}>
        <Sparkles size={16} aria-hidden="true" /> Sugerencias
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Sugerencias para ${label}`}>
        {open && <SuggestionsPanel tool={tool} />}
      </Dialog>
    </>
  );
}

type Card = ChatCard;

export function SuggestionsPanel({ tool }: { tool: ToolId }) {
  const settings = loadSettings();
  const legacy = useLegacyData();
  const [cards, setCards] = useState<Card[]>([]);
  const [intro, setIntro] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const shownTitles = useRef<string[]>([]);
  const exec = useRunPlan();

  if (!settings.apiKey)
    return (
      <div className="stack-sm">
        <p>Las sugerencias las prepara el Asistente con tu clave de Gemini, mirando lo que tienes en esta sección.</p>
        <p className="muted small">Guarda tu clave en el Asistente (es gratis) y vuelve aquí.</p>
        <div>
          <Link to="/asistente" className="btn">
            <Sparkles size={16} aria-hidden="true" /> Ir al Asistente
          </Link>
        </div>
      </div>
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

  const set = (id: string, patch: Partial<Card>) => setCards((cs) => cs.map((c) => (c.callId === id ? { ...c, ...patch } : c)));
  const doIt = async (card: Card) => {
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
    <div className="stack suggestions">
      <p className="muted small">
        Al pedirlas se envían a Google, con tu clave, los datos de esta sección (nunca tu Bóveda ni el texto de tu diario). Nada cambia hasta que pulses «Hacer».
      </p>
      <details className="assistant-context">
        <summary>Ver lo que se enviará</summary>
        <pre tabIndex={0} aria-label="Datos de esta sección que se enviarán">
          {suggestContext(tool, legacy.data?.data)}
        </pre>
      </details>
      {error && (
        <div className="alert alert--danger" role="alert">
          {error}
        </div>
      )}
      {busy && (
        <p className="muted small" role="status">
          Pensando sugerencias…
        </p>
      )}
      {asked && !busy && intro && <p>{intro}</p>}
      {!busy && cards.length > 0 && (
        <div className="stack-sm" aria-label="Sugerencias">
          {cards.map((c) => (
            <ProposalCard key={c.callId} card={c} onDo={doIt} onDiscard={(x) => set(x.callId, { status: 'discarded' })} />
          ))}
        </div>
      )}
      <div>
        <button type="button" className="btn" onClick={ask} disabled={busy || !legacy.data}>
          <Sparkles size={16} aria-hidden="true" /> {asked ? 'Pedir otras' : 'Pedir sugerencias'}
        </button>
      </div>
    </div>
  );
}
