import { monthSummary, parseAmount, shortDay, TX_CATEGORIES, TX_TYPE_INFO, TX_TYPES, txTypeOf as typeOf, utcDayKey, type LegacyTransaction, type TxType } from '@dyc/core';
import { Pencil, Plus, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { newId, useLegacyData, useLegacyList, useLegacyObject, useModule, useModuleObject } from '../app/legacy';
import { useToast } from '../app/toast';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { Segmented, SelectField, TextField } from '../components/Form';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { FormActions, Meter, MonthNav, optionsWith, Stats } from '../components/ToolParts';
import { money } from '../lib/tools';

const SHOWN_MAX = 300;
const TYPE_OPTIONS = TX_TYPES.map((t) => ({ value: t, label: TX_TYPE_INFO[t].label }));

/** Presupuesto que la app anterior guardaba en este navegador (solo como sugerencia). */
function oldBudget(): number | null {
  try {
    const n = Number(localStorage.getItem('core_budget'));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function Finance() {
  const legacy = useLegacyData();
  const list = useLegacyList(legacy.data?.data, 'transactions');
  const budget = useLegacyObject(legacy.data?.data, 'budget');
  const actions = useModule('transactions');
  const toast = useToast();
  // La app anterior guarda la fecha en UTC: el mes actual es el de esa fecha.
  const today = utcDayKey();
  const [month, setMonth] = useState(`${today.slice(0, 7)}-01`);
  const [editing, setEditing] = useState<LegacyTransaction | 'new' | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const summary = useMemo(() => monthSummary(list, month.slice(0, 7)), [list, month]);
  const monthly = typeof budget.monthly === 'number' && budget.monthly > 0 ? budget.monthly : 0;

  const remove = (t: LegacyTransaction) => {
    const order = list.map((x) => x.id);
    actions.remove(t.id);
    toast('Movimiento eliminado.', {
      action: {
        label: 'Deshacer',
        run: () => {
          actions.add(t);
          actions.reorder(order);
        },
      },
    });
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Vida personal" title="Finanzas">
        <button type="button" className="btn" onClick={() => setEditing('new')} disabled={!legacy.data}>
          <Plus size={18} aria-hidden="true" /> Nuevo movimiento
        </button>
      </PageHeader>
      {legacy.isPending ? (
        <Loading label="Cargando tus finanzas" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : (
        <div className="stack-lg">
          <div className="card month-card">
            <MonthNav month={month} onChange={setMonth} current={today} titleId="finance-month" />
          </div>
          <Stats
            items={[
              { value: <span className="amount amount--income">+{money(summary.income)}</span>, label: 'Ingresos' },
              { value: <span className="amount">−{money(summary.expense)}</span>, label: 'Gastos' },
              { value: <span className={`amount${summary.balance < 0 ? ' amount--negative' : ''}`}>{summary.balance < 0 ? '−' : ''}{money(Math.abs(summary.balance))}</span>, label: 'Balance' },
            ]}
          />
          <div className="finance-layout">
            <section className="card card--list" aria-labelledby="tx-title">
              <h2 id="tx-title" className="list-count">
                Movimientos <span className="chip small numeric">{summary.items.length}</span>
              </h2>
              {summary.items.length === 0 ? (
                <EmptyState title={list.length ? 'Sin movimientos este mes' : 'Aún no tienes movimientos'}>
                  Apunta tus ingresos y gastos para ver en qué se va tu dinero cada mes.
                </EmptyState>
              ) : (
                <ul className="tx-list">
                  {summary.items.slice(0, SHOWN_MAX).map((t) => (
                    <TxRow key={t.id} tx={t} onEdit={() => setEditing(t)} onRemove={() => remove(t)} />
                  ))}
                </ul>
              )}
              {summary.items.length > SHOWN_MAX && <p className="muted small">Se muestran los {SHOWN_MAX} más recientes del mes.</p>}
            </section>
            <div className="stack">
              <section className="card stack-sm" aria-labelledby="budget-title">
                <div className="section-head">
                  <h2 id="budget-title" className="list-count">
                    Presupuesto del mes
                  </h2>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setBudgetOpen(true)}>
                    {monthly ? 'Cambiar' : 'Definir'}
                  </button>
                </div>
                {monthly ? <BudgetProgress spent={summary.expense} monthly={monthly} /> : <p className="muted small">Define cuánto quieres gastar al mes y verás cuánto te queda.</p>}
              </section>
              <section className="card stack-sm" aria-labelledby="cats-title">
                <h2 id="cats-title" className="list-count">
                  Gastos por categoría
                </h2>
                {summary.byCategory.length === 0 ? (
                  <p className="muted small">Sin gastos este mes.</p>
                ) : (
                  <ul className="bar-list">
                    {summary.byCategory.map((c) => {
                      const pct = summary.expense ? Math.round((c.amount / summary.expense) * 100) : 0;
                      return (
                        <li key={c.category}>
                          <span className="bar-list__label">
                            <span>{c.category}</span>
                            <span className="numeric muted small">
                              {money(c.amount)} · {pct} %
                            </span>
                          </span>
                          <Meter value={pct} label={`${c.category}: ${pct} % de los gastos`} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo movimiento' : 'Editar movimiento'}>
        {editing !== null && <TxForm tx={editing === 'new' ? null : editing} today={today} month={month} onDone={() => setEditing(null)} />}
      </Dialog>
      <Dialog open={budgetOpen} onClose={() => setBudgetOpen(false)} title="Presupuesto mensual">
        {budgetOpen && <BudgetForm monthly={monthly} onDone={() => setBudgetOpen(false)} />}
      </Dialog>
    </div>
  );
}

function BudgetProgress({ spent, monthly }: { spent: number; monthly: number }) {
  const pct = Math.round((spent / monthly) * 100);
  const over = spent > monthly;
  return (
    <>
      <div className="meter-row">
        <Meter value={Math.min(100, pct)} label="Presupuesto gastado" color={over ? 'var(--color-danger)' : pct >= 80 ? 'var(--color-warning)' : 'var(--color-success)'} />
        <span className="numeric small">{pct} %</span>
      </div>
      <p className="small">
        Gastado <strong className="numeric">{money(spent)}</strong> de <span className="numeric">{money(monthly)}</span>.{' '}
        {over ? (
          <strong className="danger-text">Te pasaste por {money(Math.round((spent - monthly) * 100) / 100)}.</strong>
        ) : (
          <span className="muted">Quedan {money(Math.round((monthly - spent) * 100) / 100)}.</span>
        )}
      </p>
    </>
  );
}

function TxRow({ tx, onEdit, onRemove }: { tx: LegacyTransaction; onEdit: () => void; onRemove: () => void }) {
  const income = typeOf(tx) === 'income';
  const amount = Math.abs(typeof tx.amount === 'number' ? tx.amount : 0);
  const name = tx.category || 'Otro';
  const label = `${TX_TYPE_INFO[typeOf(tx)].label} de ${money(amount)} en ${name}${tx.note ? ` (${tx.note})` : ''}`;
  return (
    <li className="tx-row">
      <span className={`tx-row__icon${income ? ' tx-row__icon--income' : ''}`} aria-hidden="true">
        {income ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
      </span>
      <span className="tx-row__text">
        <strong>{name}</strong>
        <span className="muted small">
          {typeof tx.date === 'string' && tx.date.length >= 10 ? shortDay(tx.date) : ''}
          {tx.note ? ` · ${tx.note}` : ''}
        </span>
      </span>
      <span className={`amount numeric${income ? ' amount--income' : ''}`}>
        <span className="visually-hidden">{income ? 'Ingreso' : 'Gasto'}: </span>
        {income ? '+' : '−'}
        {money(amount)}
      </span>
      <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Editar: ${label}`}>
        <Pencil size={18} aria-hidden="true" />
      </button>
      <button type="button" className="icon-btn" onClick={onRemove} aria-label={`Borrar: ${label}`}>
        <Trash2 size={18} aria-hidden="true" />
      </button>
    </li>
  );
}

function TxForm({ tx, today, month, onDone }: { tx: LegacyTransaction | null; today: string; month: string; onDone: () => void }) {
  const actions = useModule('transactions');
  const [type, setType] = useState<TxType>(tx ? typeOf(tx) : 'expense');
  const [amount, setAmount] = useState(tx ? String(Math.abs(tx.amount ?? 0)).replace('.', ',') : '');
  const [category, setCategory] = useState(tx?.category || TX_CATEGORIES.expense[0]);
  const [note, setNote] = useState(tx?.note ?? '');
  // En otro mes, el movimiento nuevo propone el día 1 de ese mes.
  const [date, setDate] = useState(tx?.date ?? (month.slice(0, 7) === today.slice(0, 7) ? today : month));
  const value = parseAmount(amount);
  const valid = value !== null && value > 0 && value <= 1e12;
  const categories = optionsWith(TX_CATEGORIES[type], category);

  const pickType = (t: TxType) => {
    setType(t);
    if (!TX_CATEGORIES[t].includes(category)) setCategory(TX_CATEGORIES[t][0]);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !date) return;
    // Como la app anterior: el monto siempre en positivo; el signo lo da el tipo.
    const fields = { type, amount: Math.round(Math.abs(value as number) * 100) / 100, category, note: note.trim(), date };
    if (tx) actions.update(tx.id, fields);
    else actions.add({ id: newId(), ...fields });
    onDone();
  };

  return (
    <form className="stack" onSubmit={submit}>
      <div className="field">
        <span className="field__label">Tipo</span>
        <Segmented label="Tipo" options={TYPE_OPTIONS} value={type} onChange={pickType} />
      </div>
      <div className="grid-2">
        <TextField
          label="Monto"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          autoFocus
          error={amount.trim() && !valid ? 'Escribe un monto mayor que 0, con hasta dos decimales (12,50).' : null}
        />
        <TextField label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <SelectField label="Categoría" value={category} onChange={(e) => setCategory(e.target.value)}>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </SelectField>
      <TextField label="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={type === 'income' ? 'Pago de septiembre' : 'Supermercado'} />
      <FormActions
        submitLabel={tx ? 'Guardar' : 'Añadir movimiento'}
        disabled={!valid || !date}
        onDelete={
          tx
            ? () => {
                actions.remove(tx.id);
                onDone();
              }
            : undefined
        }
        confirm="Se borrará este movimiento."
      />
    </form>
  );
}

function BudgetForm({ monthly, onDone }: { monthly: number; onDone: () => void }) {
  const actions = useModuleObject('budget');
  // Si aún no hay presupuesto, se propone el que la app anterior guardó en este navegador.
  const [suggested] = useState(() => (monthly ? null : oldBudget()));
  const [value, setValue] = useState(String(monthly || suggested || '').replace('.', ','));
  const n = parseAmount(value) ?? 0;
  const valid = n > 0 && n <= 1e12;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    actions.patch({ monthly: Math.round(n * 100) / 100 });
    onDone();
  };
  return (
    <form className="stack" onSubmit={submit}>
      <TextField
        label="Cuánto quieres gastar al mes"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required
        autoFocus
        hint={
          suggested
            ? `La app anterior tenía ${money(suggested)} guardado en este navegador; lo hemos puesto como sugerencia.`
            : 'Vale para todos los meses y se guarda en tu cuenta, así lo ves en todos tus dispositivos.'
        }
      />
      <div className="form-actions">
        {monthly > 0 && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              actions.patch({ monthly: 0 });
              onDone();
            }}
          >
            Quitar presupuesto
          </button>
        )}
        <button type="submit" className="btn" disabled={!valid}>
          Guardar
        </button>
      </div>
    </form>
  );
}
