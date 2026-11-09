import {
  CURRENCIES,
  CURRENCY_LABEL,
  formatMoney,
  localAmount,
  methodReady,
  PAYMENT_STATUS_LABEL,
  PLAN_NAME,
  PLAN_PERIOD_LABEL,
  PLANS,
  type Currency,
  type PaymentMethod,
  type PaymentSettings,
  type PaymentStatus,
} from '@dyc/core';
import type { AdminPaymentRequest } from '@dyc/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { api } from '../app/api';
import { compressImage } from '../app/images';
import { useToast } from '../app/toast';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { Segmented, SelectField, TextArea, TextField } from '../components/Form';
import { EmptyState, ErrorState, errorMessage, Loading } from '../components/States';
import { formatLongDate } from '../lib/billing';
import { billingKey, useBilling } from './Plans';

type Tab = 'comprobantes' | 'metodos' | 'precios';
type Filter = PaymentStatus | 'todos';

/** Administración de pagos: revisar comprobantes, cargar los datos de cada método y los precios. */
export function AdminPayments() {
  const billing = useBilling();
  const [tab, setTab] = useState<Tab>('comprobantes');
  if (billing.isPending) return <Loading />;
  if (billing.isError) return <ErrorState error={billing.error} retry={() => billing.refetch()} />;
  if (!billing.data.admin)
    return (
      <div className="page page--narrow">
        <PageHeader eyebrow="Administración" title="Pagos" />
        <EmptyState title="Esta sección es solo para la administración">Si administras Design Your Core, agrega tu correo en ADMIN_EMAILS del archivo core-config.env del servidor.</EmptyState>
      </div>
    );
  return (
    <div className="page">
      <PageHeader eyebrow="Administración" title="Pagos" />
      <div className="stack-lg">
        <div className="seg-scroll">
        <Segmented
          label="Sección"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'comprobantes', label: 'Comprobantes' },
            { value: 'metodos', label: 'Métodos de pago' },
            { value: 'precios', label: 'Precios' },
          ]}
        />
        </div>
        {tab === 'comprobantes' ? <Requests /> : <SettingsEditor tab={tab} />}
      </div>
    </div>
  );
}

function Requests() {
  const [filter, setFilter] = useState<Filter>('pendiente');
  const list = useQuery({ queryKey: ['admin-payments', filter], queryFn: () => api.admin.requests(filter === 'todos' ? undefined : filter) });
  return (
    <section className="stack" aria-label="Comprobantes">
      <div className="seg-scroll">
      <Segmented
        label="Filtrar"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'pendiente', label: `En revisión${list.data && filter === 'pendiente' ? ` (${list.data.pending})` : ''}` },
          { value: 'aprobado', label: 'Aprobados' },
          { value: 'rechazado', label: 'Rechazados' },
          { value: 'todos', label: 'Todos' },
        ]}
      />
      </div>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} retry={() => list.refetch()} />
      ) : list.data.requests.length === 0 ? (
        <EmptyState title={filter === 'pendiente' ? 'No hay pagos por revisar' : 'No hay pagos aquí'}>Cuando alguien envíe un comprobante aparece en esta lista.</EmptyState>
      ) : (
        <div className="admin-requests">
          {list.data.requests.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </div>
      )}
    </section>
  );
}

function RequestCard({ request: r }: { request: AdminPaymentRequest }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [proof, setProof] = useState<string | null>(null);
  const showProof = useMutation({ mutationFn: () => api.admin.proof(r.id), onSuccess: setProof, onError: (e) => toast(errorMessage(e), { tone: 'error' }) });
  const review = useMutation({
    mutationFn: (ok: boolean) => (ok ? api.admin.approve(r.id, note.trim()) : api.admin.reject(r.id, note.trim())),
    onSuccess: (x) => {
      qc.invalidateQueries({ queryKey: ['admin-payments'] });
      qc.invalidateQueries({ queryKey: billingKey });
      toast(x.status === 'aprobado' ? `Aprobado: ${r.user.name} ya tiene ${PLAN_NAME[r.plan]}.` : 'Pago rechazado.');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });
  return (
    <article className="card stack-sm admin-request">
      <div className="admin-request__head">
        <span>
          <strong>{r.user.name}</strong>
          <span className="muted small"> · {r.user.email}</span>
        </span>
        <span className={`pay-status pay-status--${r.status}`}>{PAYMENT_STATUS_LABEL[r.status]}</span>
      </div>
      <p className="admin-request__amount">
        {formatMoney(r.amount, r.currency)}
        {r.currency !== 'USD' && <span className="muted small"> · {formatMoney(r.amountUsd, 'USD')}</span>}
      </p>
      <dl className="pay-summary small">
        <div>
          <dt className="muted">Plan</dt>
          <dd>
            {PLAN_NAME[r.plan]} {PLAN_PERIOD_LABEL[r.period].toLowerCase()}
          </dd>
        </div>
        <div>
          <dt className="muted">Método</dt>
          <dd>{r.methodName}</dd>
        </div>
        <div>
          <dt className="muted">Referencia</dt>
          <dd>{r.reference}</dd>
        </div>
        <div>
          <dt className="muted">Pagó</dt>
          <dd>{r.payerName}</dd>
        </div>
        <div>
          <dt className="muted">Enviado</dt>
          <dd>{formatLongDate(r.createdAt)}</dd>
        </div>
      </dl>
      {r.note && <p className="small">Nota: {r.note}</p>}
      {r.adminNote && r.status !== 'pendiente' && <p className="small muted">Tu nota: {r.adminNote}</p>}
      {r.hasProof && (
        <div>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => showProof.mutate()} disabled={showProof.isPending}>
            {showProof.isPending ? 'Abriendo…' : 'Ver comprobante'}
          </button>
        </div>
      )}
      {r.status === 'pendiente' && (
        <>
          <TextField label="Nota para la persona (opcional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Por ejemplo: el monto llegó incompleto" />
          <div className="row">
            <button type="button" className="btn btn--sm" onClick={() => review.mutate(true)} disabled={review.isPending}>
              Aprobar y activar
            </button>
            <button type="button" className="btn btn--ghost btn--sm danger-text" onClick={() => review.mutate(false)} disabled={review.isPending}>
              Rechazar
            </button>
          </div>
        </>
      )}
      <Dialog open={!!proof} onClose={() => setProof(null)} title={`Comprobante de ${r.user.name}`} wide>
        {proof && <img className="proof-full" src={proof} alt={`Comprobante del pago con referencia ${r.reference}`} />}
      </Dialog>
    </article>
  );
}

function SettingsEditor({ tab }: { tab: 'metodos' | 'precios' }) {
  const qc = useQueryClient();
  const toast = useToast();
  const saved = useQuery({ queryKey: ['admin-payment-settings'], queryFn: api.admin.settings });
  const [draft, setDraft] = useState<PaymentSettings | null>(null);
  useEffect(() => {
    if (saved.data) setDraft(structuredClone(saved.data));
  }, [saved.data]);
  const save = useMutation({
    mutationFn: (s: PaymentSettings) => api.admin.saveSettings(s),
    onSuccess: (s) => {
      qc.setQueryData(['admin-payment-settings'], s);
      qc.invalidateQueries({ queryKey: billingKey });
      toast('Cambios guardados. Ya se ven en «Planes».');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });
  if (saved.isPending || !draft) return <Loading />;
  if (saved.isError) return <ErrorState error={saved.error} retry={() => saved.refetch()} />;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.data);

  const setMethod = (i: number, m: PaymentMethod) => setDraft({ ...draft, methods: draft.methods.map((x, j) => (j === i ? m : x)) });
  const addMethod = () => {
    let n = draft.methods.length + 1;
    while (draft.methods.some((m) => m.id === `metodo-${n}`)) n++;
    setDraft({ ...draft, methods: [...draft.methods, { id: `metodo-${n}`, name: 'Nuevo método', country: '', currency: 'USD', rate: 1, fields: [{ label: 'Dato', value: '' }], instructions: '', enabled: true }] });
  };

  return (
    <section className="stack" aria-label={tab === 'metodos' ? 'Métodos de pago' : 'Precios'}>
      {tab === 'metodos' ? (
        <>
          <p className="muted">Escribe los datos con los que te pagan. Un método aparece en «Planes» cuando está activo, tiene al menos un dato y, si no es en dólares, la tasa del día.</p>
          <div className="admin-methods">
            {draft.methods.map((m, i) => (
              <MethodEditor key={i} method={m} usd={draft.prices.pro.mes} onChange={(x) => setMethod(i, x)} onRemove={() => setDraft({ ...draft, methods: draft.methods.filter((_, j) => j !== i) })} />
            ))}
          </div>
          <div>
            <button type="button" className="btn btn--secondary" onClick={addMethod}>
              <Plus size={18} aria-hidden="true" /> Añadir método
            </button>
          </div>
        </>
      ) : (
        <div className="card stack">
          <p className="muted">Precios en dólares. Cada método convierte a su moneda con la tasa que pongas.</p>
          <div className="admin-prices">
            {PLANS.map((p) => (
              <fieldset key={p.id} className="admin-prices__plan">
                <legend className="section-title">{p.name}</legend>
                {(['mes', 'ano'] as const).map((per) => (
                  <TextField
                    key={per}
                    label={`${PLAN_PERIOD_LABEL[per]} (USD)`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={String(draft.prices[p.id][per])}
                    onChange={(e) => setDraft({ ...draft, prices: { ...draft.prices, [p.id]: { ...draft.prices[p.id], [per]: Math.max(0, Number(e.target.value) || 0) } } })}
                  />
                ))}
              </fieldset>
            ))}
          </div>
        </div>
      )}
      <div className="admin-save">
        <button type="button" className="btn" onClick={() => save.mutate(draft)} disabled={!dirty || save.isPending}>
          {save.isPending ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Todo guardado'}
        </button>
        {dirty && (
          <button type="button" className="btn btn--ghost" onClick={() => setDraft(structuredClone(saved.data))}>
            Descartar
          </button>
        )}
      </div>
    </section>
  );
}

function MethodEditor({ method: m, usd, onChange, onRemove }: { method: PaymentMethod; usd: number; onChange: (m: PaymentMethod) => void; onRemove: () => void }) {
  const toast = useToast();
  const qrId = useId();
  const [open, setOpen] = useState(false);
  const ready = methodReady(m);
  const missing = !m.enabled ? 'Apagado' : !m.fields.some((f) => f.value.trim()) ? 'Faltan datos' : m.currency !== 'USD' && !(m.rate > 0) ? 'Falta la tasa' : null;
  const setField = (i: number, patch: Partial<PaymentMethod['fields'][number]>) => onChange({ ...m, fields: m.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const pickQr = async (file: File | undefined) => {
    if (!file) return;
    try {
      onChange({ ...m, qr: await compressImage(file, 800, 0.85) });
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' });
    }
  };
  return (
    <article className={`card admin-method${ready ? ' admin-method--ready' : ''}`}>
      <button type="button" className="admin-method__head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>
          <strong>{m.name || 'Sin nombre'}</strong>
          <span className="muted small">
            {' '}
            · {m.country || 'Sin país'} · {m.currency}
          </span>
        </span>
        <span className={`pay-status ${ready ? 'pay-status--aprobado' : 'pay-status--off'}`}>{ready ? 'Visible' : missing}</span>
        <ChevronDown size={18} aria-hidden="true" className="admin-method__chevron" />
      </button>
      {open && (
        <div className="stack admin-method__body">
          <label className="check-row">
            <input type="checkbox" checked={m.enabled} onChange={(e) => onChange({ ...m, enabled: e.target.checked })} /> Mostrar este método en «Planes»
          </label>
          <div className="admin-grid">
            <TextField label="Nombre" value={m.name} onChange={(e) => onChange({ ...m, name: e.target.value })} />
            <TextField label="País o región" value={m.country} onChange={(e) => onChange({ ...m, country: e.target.value })} />
            <SelectField label="Moneda" value={m.currency} onChange={(e) => { const currency = e.target.value as Currency; onChange({ ...m, currency, rate: currency === 'USD' ? 1 : m.rate === 1 ? 0 : m.rate }); }}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {CURRENCY_LABEL[c]}
                </option>
              ))}
            </SelectField>
            {m.currency !== 'USD' && (
              <TextField
                label={`Tasa: 1 USD en ${m.currency}`}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={m.rate ? String(m.rate) : ''}
                onChange={(e) => onChange({ ...m, rate: Math.max(0, Number(e.target.value) || 0) })}
                hint={m.rate > 0 ? `El plan Pro mensual sale en ${formatMoney(localAmount(usd, m), m.currency)}.` : 'Actualízala cuando cambie.'}
              />
            )}
          </div>
          <fieldset className="stack-sm">
            <legend className="field__label">Datos para pagar</legend>
            {m.fields.map((f, i) => (
              <div key={i} className="admin-field">
                <TextField label="Dato" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} />
                <TextField label="Valor" value={f.value} onChange={(e) => setField(i, { value: e.target.value })} placeholder="Déjalo vacío para no mostrarlo" />
                <button type="button" className="icon-btn" aria-label={`Quitar «${f.label}»`} onClick={() => onChange({ ...m, fields: m.fields.filter((_, j) => j !== i) })}>
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            ))}
            <div>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange({ ...m, fields: [...m.fields, { label: 'Dato', value: '' }] })} disabled={m.fields.length >= 12}>
                <Plus size={16} aria-hidden="true" /> Añadir dato
              </button>
            </div>
          </fieldset>
          <TextArea label="Indicaciones (opcional)" rows={2} value={m.instructions} onChange={(e) => onChange({ ...m, instructions: e.target.value })} placeholder="Qué poner en el concepto, horario de verificación…" />
          <div className="field">
            <span className="field__label">Código QR (opcional)</span>
            {m.qr ? (
              <div className="proof-preview">
                <img src={m.qr} alt={`QR de ${m.name}`} />
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange({ ...m, qr: undefined })}>
                  Quitar QR
                </button>
              </div>
            ) : (
              <label className="proof-drop proof-drop--sm" htmlFor={qrId}>
                <ImagePlus size={20} aria-hidden="true" /> <span>Subir QR</span>
              </label>
            )}
            <input id={qrId} type="file" accept="image/*" className="visually-hidden" onChange={(e) => pickQr(e.target.files?.[0])} />
          </div>
          <div>
            <button type="button" className="btn btn--ghost btn--sm danger-text" onClick={onRemove}>
              <Trash2 size={16} aria-hidden="true" /> Quitar este método
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
