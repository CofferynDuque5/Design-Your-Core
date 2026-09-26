import {
  money,
  monthSummary,
  optionsWith,
  parseAmount,
  shortDay,
  TX_CATEGORIES,
  TX_TYPE_INFO,
  TX_TYPES,
  txTypeOf,
  utcDayKey,
  type Day,
  type LegacyTransaction,
  type TxType,
} from '@dyc/core';
import { radius, space, touchTarget } from '@dyc/tokens';
import { Plus, Trash2, TrendingDown, TrendingUp } from 'lucide-react-native';
import { Fragment, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { DayStepper, DotChoices, FormActions, IconButton, Meter, MonthNav, Pill, ToolScreen } from '../../components/tools';
import { Button, Card, EmptyState, ErrorState, Field, Loading, SectionHeader, Segmented, T, fonts } from '../../components/ui';
import { newId, useLegacyData, useLegacyList, useLegacyObject, useModule, useModuleObject } from '../../lib/legacy';
import { useTheme } from '../../lib/theme';
import { useToast } from '../../lib/toast';

const SHOWN_MAX = 300;
const TYPE_OPTIONS = TX_TYPES.map((t) => ({ value: t, label: TX_TYPE_INFO[t].label }));
const amountOf = (t: LegacyTransaction) => Math.abs(typeof t.amount === 'number' ? t.amount : 0);
/** «Gasto de 12,3 en Transporte (Metro)»: nombre de un movimiento para lectores. */
const describe = (t: LegacyTransaction) => `${TX_TYPE_INFO[txTypeOf(t)].label} de ${money(amountOf(t))} en ${t.category || 'Otro'}${t.note ? ` (${t.note})` : ''}`;

export default function Finance() {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const list = useLegacyList(legacy.data?.data, 'transactions');
  const budget = useLegacyObject(legacy.data?.data, 'budget');
  const actions = useModule('transactions');
  const toast = useToast();
  // La app anterior guarda la fecha en UTC: el mes actual es el de esa fecha.
  const today = utcDayKey();
  const [month, setMonth] = useState<Day>(`${today.slice(0, 7)}-01`);
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
    <ToolScreen
      title="Finanzas"
      eyebrow="Vida personal"
      refreshing={legacy.isRefetching}
      onRefresh={() => legacy.refetch()}
      right={<Button small label="Nuevo movimiento" icon={<Plus size={16} color={colors.onPrimary} />} onPress={() => setEditing('new')} disabled={!legacy.data} />}
    >
      {legacy.isPending ? (
        <Loading label="Cargando tus finanzas" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : (
        <>
          <Card style={{ paddingHorizontal: space[3], gap: space[4] }}>
            <MonthNav month={month} current={today} onChange={setMonth} />
            <View style={[st.balance, { borderTopColor: colors.line }]}>
              <View accessible accessibilityLabel={`Balance del mes: ${summary.balance < 0 ? 'menos ' : ''}${money(Math.abs(summary.balance))}`} style={{ alignItems: 'center' }}>
                <T v="small" tint="muted">
                  Balance del mes
                </T>
                <T v="display" style={{ fontVariant: ['tabular-nums'], color: summary.balance < 0 ? colors.danger : colors.ink }}>
                  {summary.balance < 0 ? '−' : ''}
                  {money(Math.abs(summary.balance))}
                </T>
              </View>
              <View style={st.split}>
                <Figure label="Ingresos" value={`+${money(summary.income)}`} spoken={money(summary.income)} color={colors.success} />
                <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />
                <Figure label="Gastos" value={`−${money(summary.expense)}`} spoken={money(summary.expense)} color={colors.ink} />
              </View>
            </View>
          </Card>

          <Card>
            <View style={st.head}>
              <T v="heading" accessibilityRole="header" style={{ flex: 1 }}>
                Presupuesto del mes
              </T>
              <Button small variant="link" label={monthly ? 'Cambiar' : 'Definir'} accessibilityLabel={monthly ? 'Cambiar el presupuesto' : 'Definir un presupuesto'} onPress={() => setBudgetOpen(true)} />
            </View>
            {monthly ? (
              <BudgetProgress spent={summary.expense} monthly={monthly} />
            ) : (
              <T v="small" tint="muted">
                Define cuánto quieres gastar al mes y verás cuánto te queda.
              </T>
            )}
          </Card>

          <Card>
            <T v="heading" accessibilityRole="header">
              Gastos por categoría
            </T>
            {summary.byCategory.length === 0 ? (
              <T v="small" tint="muted">
                Sin gastos este mes.
              </T>
            ) : (
              summary.byCategory.map((c) => {
                const pct = summary.expense ? Math.round((c.amount / summary.expense) * 100) : 0;
                return (
                  <View key={c.category} style={{ gap: space[1] }}>
                    <View style={st.head}>
                      <T v="label" style={{ flex: 1 }}>
                        {c.category}
                      </T>
                      <T v="small" tint="muted" style={{ fontVariant: ['tabular-nums'] }}>
                        {money(c.amount)} · {pct} %
                      </T>
                    </View>
                    <Meter value={pct} label={`${c.category}: ${pct} % de los gastos`} color={colors.terracotta} />
                  </View>
                );
              })
            )}
          </Card>

          <View style={{ gap: space[3] }}>
            <SectionHeader title="Movimientos" right={<Pill a11yLabel={`${summary.items.length} este mes`}>{String(summary.items.length)}</Pill>} />
            {summary.items.length === 0 ? (
              <EmptyState
                title={list.length ? 'Sin movimientos este mes' : 'Aún no tienes movimientos'}
                action={<Button small variant="secondary" label="Añadir movimiento" icon={<Plus size={16} color={colors.primary} />} onPress={() => setEditing('new')} />}
              >
                Apunta tus ingresos y gastos para ver en qué se va tu dinero cada mes.
              </EmptyState>
            ) : (
              <Card style={{ paddingVertical: space[1], gap: 0 }}>
                {summary.items.slice(0, SHOWN_MAX).map((t, i) => (
                  <Fragment key={t.id}>
                    {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 48 }} />}
                    <TxRow tx={t} onEdit={() => setEditing(t)} onRemove={() => remove(t)} />
                  </Fragment>
                ))}
              </Card>
            )}
            {summary.items.length > SHOWN_MAX && (
              <T v="small" tint="muted">
                Se muestran los {SHOWN_MAX} más recientes del mes.
              </T>
            )}
          </View>
        </>
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo movimiento' : 'Editar movimiento'}>
        {editing !== null && <TxForm tx={editing === 'new' ? null : editing} today={today} month={month} onDone={() => setEditing(null)} />}
      </Sheet>
      <Sheet open={budgetOpen} onClose={() => setBudgetOpen(false)} title="Presupuesto mensual">
        {budgetOpen && <BudgetForm monthly={monthly} onDone={() => setBudgetOpen(false)} />}
      </Sheet>
    </ToolScreen>
  );
}

function Figure({ label, value, spoken, color }: { label: string; value: string; spoken: string; color: string }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${spoken}`} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <T v="title" style={{ fontSize: 24, lineHeight: 30, fontVariant: ['tabular-nums'], color }}>
        {value}
      </T>
      <T v="small" tint="muted">
        {label}
      </T>
    </View>
  );
}

function BudgetProgress({ spent, monthly }: { spent: number; monthly: number }) {
  const { colors } = useTheme();
  const pct = Math.round((spent / monthly) * 100);
  const over = spent > monthly;
  return (
    <View style={{ gap: space[2] }}>
      <View style={[st.head, { gap: space[3] }]}>
        <View style={{ flex: 1 }}>
          <Meter value={Math.min(100, pct)} label="Presupuesto gastado" color={over ? colors.danger : pct >= 80 ? colors.warning : colors.success} />
        </View>
        <T v="small" style={{ fontFamily: fonts.semibold, fontVariant: ['tabular-nums'] }}>
          {pct} %
        </T>
      </View>
      <T v="small">
        Gastado <T v="small" style={{ fontFamily: fonts.semibold }}>{money(spent)}</T> de {money(monthly)}.{' '}
        {over ? (
          <T v="small" tint="danger" style={{ fontFamily: fonts.semibold }}>
            Te pasaste por {money(Math.round((spent - monthly) * 100) / 100)}.
          </T>
        ) : (
          <T v="small" tint="muted">
            Quedan {money(Math.round((monthly - spent) * 100) / 100)}.
          </T>
        )}
      </T>
    </View>
  );
}

/** Tocar el movimiento lo edita; la papelera lo borra y el aviso permite deshacerlo. */
function TxRow({ tx, onEdit, onRemove }: { tx: LegacyTransaction; onEdit: () => void; onRemove: () => void }) {
  const { colors } = useTheme();
  const income = txTypeOf(tx) === 'income';
  const label = describe(tx);
  const Icon = income ? TrendingUp : TrendingDown;
  return (
    <View style={st.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Editar: ${label}`} onPress={onEdit} style={({ pressed }) => [st.rowHit, pressed && { opacity: 0.7 }]}>
        <View style={[st.icon, { backgroundColor: income ? colors.successSoft : colors.surfaceSunken }]}>
          <Icon size={18} color={income ? colors.success : colors.inkMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <T v="label" numberOfLines={1}>
            {tx.category || 'Otro'}
          </T>
          <T v="small" tint="muted" numberOfLines={1}>
            {typeof tx.date === 'string' && tx.date.length >= 10 ? shortDay(tx.date) : ''}
            {tx.note ? ` · ${tx.note}` : ''}
          </T>
        </View>
        <T v="label" style={{ fontFamily: fonts.semibold, fontVariant: ['tabular-nums'], color: income ? colors.success : colors.ink }}>
          {income ? '+' : '−'}
          {money(amountOf(tx))}
        </T>
      </Pressable>
      <IconButton label={`Borrar: ${label}`} onPress={onRemove} style={{ marginRight: -space[2] }}>
        <Trash2 size={18} color={colors.inkMuted} />
      </IconButton>
    </View>
  );
}

function TxForm({ tx, today, month, onDone }: { tx: LegacyTransaction | null; today: Day; month: Day; onDone: () => void }) {
  const actions = useModule('transactions');
  const [type, setType] = useState<TxType>(tx ? txTypeOf(tx) : 'expense');
  const [amount, setAmount] = useState(tx ? String(amountOf(tx)).replace('.', ',') : '');
  const [category, setCategory] = useState(tx?.category || TX_CATEGORIES.expense[0]);
  const [note, setNote] = useState(tx?.note ?? '');
  // En otro mes, el movimiento nuevo propone el día 1 de ese mes.
  const [date, setDate] = useState<Day>(tx?.date ?? (month.slice(0, 7) === today.slice(0, 7) ? today : month));
  const value = parseAmount(amount);
  const valid = value !== null && value > 0 && value <= 1e12;
  const categories = optionsWith(TX_CATEGORIES[type], category);

  const pickType = (t: TxType) => {
    setType(t);
    if (!TX_CATEGORIES[t].includes(category)) setCategory(TX_CATEGORIES[t][0]);
  };

  const submit = () => {
    if (!valid || !date) return;
    // Como la app anterior: el monto siempre en positivo; el signo lo da el tipo.
    const fields = { type, amount: Math.round(Math.abs(value) * 100) / 100, category, note: note.trim(), date };
    if (tx) actions.update(tx.id, fields);
    else actions.add({ id: newId(), ...fields });
    onDone();
  };

  return (
    <ScrollView style={{ maxHeight: 620 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <Segmented label="Tipo" options={TYPE_OPTIONS} value={type} onChange={pickType} />
      <Field
        label="Monto"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0,00"
        autoFocus={!tx}
        maxLength={16}
        error={amount.trim() && !valid ? 'Escribe un monto mayor que 0, con hasta dos decimales (12,50).' : null}
      />
      <DayStepper label="Fecha" value={date} onChange={(d) => d && setDate(d)} today={today} />
      <DotChoices legend="Categoría" value={category} onChange={setCategory} options={categories.map((c) => ({ value: c, label: c }))} />
      <Field label="Nota (opcional)" value={note} onChangeText={setNote} maxLength={300} placeholder={type === 'income' ? 'Pago de septiembre' : 'Supermercado'} />
      <FormActions
        submitLabel={tx ? 'Guardar' : 'Añadir movimiento'}
        onSubmit={submit}
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
    </ScrollView>
  );
}

function BudgetForm({ monthly, onDone }: { monthly: number; onDone: () => void }) {
  const actions = useModuleObject('budget');
  const [value, setValue] = useState(monthly ? String(monthly).replace('.', ',') : '');
  const n = parseAmount(value) ?? 0;
  const valid = n > 0 && n <= 1e12;
  const save = () => {
    if (!valid) return;
    actions.patch({ monthly: Math.round(n * 100) / 100 });
    onDone();
  };
  return (
    <View style={{ gap: space[4] }}>
      <Field
        label="Cuánto quieres gastar al mes"
        value={value}
        onChangeText={setValue}
        keyboardType="decimal-pad"
        autoFocus
        maxLength={16}
        placeholder="500"
        hint="Vale para todos los meses y se guarda en tu cuenta, así lo ves en todos tus dispositivos."
        error={value.trim() && !valid ? 'Escribe una cantidad mayor que 0, con hasta dos decimales.' : null}
      />
      <View style={{ gap: space[2] }}>
        <Button label="Guardar" onPress={save} disabled={!valid} />
        {monthly > 0 && (
          <Button
            variant="ghost"
            label="Quitar presupuesto"
            onPress={() => {
              actions.patch({ monthly: 0 });
              onDone();
            }}
          />
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  balance: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space[4], gap: space[4] },
  split: { flexDirection: 'row', alignItems: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  rowHit: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: touchTarget + 12, paddingVertical: space[2] },
  icon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
