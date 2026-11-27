import {
  CURRENCY_LABEL,
  formatMoney,
  localAmount,
  PAYMENT_STATUS_LABEL,
  PLAN_NAME,
  PLAN_PERIOD_LABEL,
  PLAN_PERIOD_UNIT,
  PLANS,
  type PaymentMethod,
  type PaymentRequest,
  type PlanId,
  type PlanPeriod,
} from '@dyc/core';
import type { Billing } from '@dyc/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ImagePlus, Settings, ShieldCheck, X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../app/api';
import { compressImage } from '../app/images';
import { useToast } from '../app/toast';
import { PageHeader } from '../components/AppShell';
import { Segmented, TextArea, TextField } from '../components/Form';
import { EmptyState, ErrorState, errorMessage, Loading } from '../components/States';
import { formatLongDate } from '../lib/billing';
import { copyText } from '../lib/clipboard';

export const billingKey = ['billing'] as const;
export const useBilling = () => useQuery({ queryKey: billingKey, queryFn: api.billing.get });

const PERIODS: Array<{ value: PlanPeriod; label: string }> = [
  { value: 'mes', label: PLAN_PERIOD_LABEL.mes },
  { value: 'ano', label: PLAN_PERIOD_LABEL.ano },
];

/** Planes y pago: elige plan, método, paga con los datos y envía el comprobante. */
export function Plans() {
  const billing = useBilling();
  const [period, setPeriod] = useState<PlanPeriod>('mes');
  const [plan, setPlan] = useState<PlanId | null>(null);
  const [methodId, setMethodId] = useState<string | null>(null);

  if (billing.isPending) return <Loading />;
  if (billing.isError) return <ErrorState error={billing.error} retry={() => billing.refetch()} />;
  const b = billing.data;
  const pending = b.requests.find((r) => r.status === 'pendiente');
  const method = b.methods.find((m) => m.id === methodId) ?? null;

  return (
    <div className="page page--narrow">
      <PageHeader eyebrow="Tu cuenta" title="Planes">
        {b.admin && (
          <Link to="/admin/pagos" className="btn btn--secondary btn--sm">
            <Settings size={16} aria-hidden="true" /> Administrar pagos
          </Link>
        )}
      </PageHeader>
      <div className="stack-lg">
        <CurrentPlan billing={b} />
        {pending ? (
          <PendingCard request={pending} />
        ) : (
          <>
            <section className="stack" aria-labelledby="plans-title">
              <div className="billing-head">
                <h2 id="plans-title" className="section-title">
                  1. Elige tu plan
                </h2>
                <Segmented label="Forma de pago" options={PERIODS} value={period} onChange={setPeriod} />
              </div>
              <div className="plan-grid">
                {PLANS.map((p) => {
                  const price = b.prices[p.id][period];
                  const monthly = b.prices[p.id].mes;
                  const saves = period === 'ano' && monthly > 0 ? Math.round((1 - price / (monthly * 12)) * 100) : 0;
                  const selected = plan === p.id;
                  return (
                    <article key={p.id} className={`card plan-card${selected ? ' plan-card--on' : ''}${p.id === 'pro' ? ' plan-card--star' : ''}`}>
                      {p.id === 'pro' && <span className="plan-card__tag">Recomendado</span>}
                      <h3 className="plan-card__name">{p.name}</h3>
                      <p className="muted small">{p.tagline}</p>
                      <p className="plan-card__price">
                        {formatMoney(price, 'USD')} <span className="muted small">{PLAN_PERIOD_UNIT[period]}</span>
                      </p>
                      {saves > 0 && <p className="plan-card__save small">Ahorras {saves} %</p>}
                      <ul className="plan-card__features">
                        {p.features.map((f) => (
                          <li key={f}>
                            <Check size={16} aria-hidden="true" /> {f}
                          </li>
                        ))}
                      </ul>
                      <button type="button" className={selected ? 'btn' : 'btn btn--secondary'} aria-pressed={selected} onClick={() => setPlan(p.id)}>
                        {selected ? 'Elegido' : `Elegir ${p.name}`}
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>

            {plan && (
              <section className="stack" aria-labelledby="method-title">
                <h2 id="method-title" className="section-title">
                  2. ¿Cómo vas a pagar?
                </h2>
                {b.methods.length === 0 ? (
                  <EmptyState title="Estamos configurando los métodos de pago">Vuelve en un rato o escríbenos y te ayudamos a pagar.</EmptyState>
                ) : (
                  <div className="method-grid" role="radiogroup" aria-label="Método de pago">
                    {b.methods.map((m) => (
                      <button key={m.id} type="button" role="radio" aria-checked={m.id === methodId} className="method-chip" onClick={() => setMethodId(m.id)}>
                        <strong>{m.name}</strong>
                        <span className="muted small">
                          {m.country} · {m.currency}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

            {plan && method && (
              <>
                <PayDetails method={method} usd={b.prices[plan][period]} plan={plan} period={period} />
                <ProofForm key={`${plan}-${period}-${method.id}`} plan={plan} period={period} method={method} />
              </>
            )}
          </>
        )}
        <History requests={b.requests.filter((r) => r.status !== 'pendiente')} />
      </div>
    </div>
  );
}

function CurrentPlan({ billing }: { billing: Billing }) {
  const paid = billing.plan !== 'gratis';
  return (
    <section className={`card plan-now${paid ? ' plan-now--paid' : ''}`} aria-label="Tu plan actual">
      <ShieldCheck size={22} aria-hidden="true" />
      <div>
        <p className="eyebrow">Tu plan</p>
        <p className="plan-now__name">{PLAN_NAME[billing.plan]}</p>
        <p className="muted small">{paid && billing.planUntil ? `Activo hasta el ${formatLongDate(billing.planUntil)}. Puedes renovarlo antes y se suma.` : 'Lo esencial, gratis para siempre.'}</p>
      </div>
    </section>
  );
}

function PayDetails({ method, usd, plan, period }: { method: PaymentMethod; usd: number; plan: PlanId; period: PlanPeriod }) {
  const toast = useToast();
  const amount = localAmount(usd, method);
  const copy = async (text: string, what: string) =>
    (await copyText(text)) ? toast(`${what} copiado.`) : toast('No se pudo copiar. Selecciónalo y cópialo a mano.', { tone: 'error' });
  return (
    <section className="card stack pay-details" aria-labelledby="pay-title">
      <h2 id="pay-title" className="section-title">
        3. Paga con {method.name}
      </h2>
      <div className="pay-amount">
        <span className="muted small">
          Monto a pagar · {PLAN_NAME[plan]} {PLAN_PERIOD_LABEL[period].toLowerCase()}
        </span>
        <span className="pay-amount__value">{formatMoney(amount, method.currency)}</span>
        {method.currency !== 'USD' && (
          <span className="muted small">
            {formatMoney(usd, 'USD')} a la tasa de hoy: 1 USD = {formatMoney(method.rate, method.currency)}
          </span>
        )}
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => copy(String(amount), 'Monto')}>
          <Copy size={16} aria-hidden="true" /> Copiar monto
        </button>
      </div>
      <dl className="pay-fields">
        {method.fields.map((f) => (
          <div key={f.label} className="pay-field">
            <dt className="muted small">{f.label}</dt>
            <dd>
              <span className="pay-field__value">{f.value}</span>
              <button type="button" className="icon-btn" aria-label={`Copiar ${f.label}`} onClick={() => copy(f.value, f.label)}>
                <Copy size={16} aria-hidden="true" />
              </button>
            </dd>
          </div>
        ))}
      </dl>
      {method.qr && <img className="pay-qr" src={method.qr} alt={`Código QR para pagar con ${method.name}`} />}
      {method.instructions && <p className="pay-note small">{method.instructions}</p>}
      <p className="muted small">Moneda: {CURRENCY_LABEL[method.currency]}. Haz el pago desde tu banco o app y luego envía la referencia abajo.</p>
    </section>
  );
}

function ProofForm({ plan, period, method }: { plan: PlanId; period: PlanPeriod; method: PaymentMethod }) {
  const qc = useQueryClient();
  const toast = useToast();
  const fileId = useId();
  const [reference, setReference] = useState('');
  const [payerName, setPayerName] = useState('');
  const [note, setNote] = useState('');
  const [proof, setProof] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: () => api.billing.pay({ plan, period, methodId: method.id, reference: reference.trim(), payerName: payerName.trim(), note: note.trim(), ...(proof ? { proof } : {}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: billingKey });
      toast('Pago enviado. Te avisamos aquí cuando esté revisado.');
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      setProof(await compressImage(file, 1600, 0.8));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (reference.trim().length < 3) return setError('Escribe el número de referencia o confirmación del pago.');
    if (payerName.trim().length < 2) return setError('Escribe el nombre de quien hizo el pago.');
    if (!proof) return setError('Adjunta la captura del comprobante.');
    setError(null);
    send.mutate();
  };

  return (
    <form className="card stack" onSubmit={submit} aria-labelledby="proof-title" noValidate>
      <h2 id="proof-title" className="section-title">
        4. Ya pagué: envía el comprobante
      </h2>
      <TextField label="Número de referencia" hint="El número de confirmación que te dio el banco o la app." value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" required />
      <TextField label="Nombre de quien pagó" value={payerName} onChange={(e) => setPayerName(e.target.value)} autoComplete="name" required />
      <div className="field">
        <span className="field__label">Captura del comprobante</span>
        {proof ? (
          <div className="proof-preview">
            <img src={proof} alt="Vista previa del comprobante" />
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setProof(null)}>
              <X size={16} aria-hidden="true" /> Quitar
            </button>
          </div>
        ) : (
          <label className="proof-drop" htmlFor={fileId}>
            <ImagePlus size={22} aria-hidden="true" />
            <span>Elegir imagen</span>
            <span className="muted small">JPG o PNG. Se reduce sola antes de enviarse.</span>
          </label>
        )}
        <input id={fileId} type="file" accept="image/*" className="visually-hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      <TextArea label="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button type="submit" className="btn" disabled={send.isPending}>
          {send.isPending ? 'Enviando…' : 'Enviar para revisión'}
        </button>
      </div>
    </form>
  );
}

function PendingCard({ request }: { request: PaymentRequest }) {
  const qc = useQueryClient();
  const toast = useToast();
  const cancel = useMutation({
    mutationFn: () => api.billing.cancel(request.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: billingKey });
      toast('Pago cancelado. Puedes enviar otro.');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });
  return (
    <section className="card stack pay-pending" aria-labelledby="pending-title">
      <p className="eyebrow">En revisión</p>
      <h2 id="pending-title" className="section-title">
        Recibimos tu pago
      </h2>
      <p className="muted">Lo revisamos a mano, normalmente el mismo día. Cuando se apruebe, tu plan se activa solo.</p>
      <RequestSummary request={request} />
      <div>
        <button type="button" className="btn btn--ghost btn--sm danger-text" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
          Cancelar este pago
        </button>
      </div>
    </section>
  );
}

export function RequestSummary({ request: r }: { request: PaymentRequest }) {
  return (
    <dl className="pay-summary small">
      <div>
        <dt className="muted">Plan</dt>
        <dd>
          {PLAN_NAME[r.plan]} {PLAN_PERIOD_LABEL[r.period].toLowerCase()}
        </dd>
      </div>
      <div>
        <dt className="muted">Monto</dt>
        <dd>{formatMoney(r.amount, r.currency)}</dd>
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
        <dt className="muted">Enviado</dt>
        <dd>{formatLongDate(r.createdAt)}</dd>
      </div>
    </dl>
  );
}

function History({ requests }: { requests: PaymentRequest[] }) {
  if (!requests.length) return null;
  return (
    <section className="card stack" aria-labelledby="history-title">
      <h2 id="history-title" className="section-title">
        Tus pagos
      </h2>
      <ul className="pay-history">
        {requests.map((r) => (
          <li key={r.id}>
            <span>
              <strong>
                {PLAN_NAME[r.plan]} {PLAN_PERIOD_LABEL[r.period].toLowerCase()}
              </strong>
              <span className="muted small">
                {' '}
                · {formatMoney(r.amount, r.currency)} · {r.methodName} · {formatLongDate(r.createdAt)}
              </span>
              {r.status === 'rechazado' && r.adminNote && <span className="pay-history__note small">Motivo: {r.adminNote}</span>}
            </span>
            <span className={`pay-status pay-status--${r.status}`}>{PAYMENT_STATUS_LABEL[r.status]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
