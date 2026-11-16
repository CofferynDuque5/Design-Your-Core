/**
 * Planes y pasarela de pago manual: la persona elige plan y método, ve los
 * datos que el administrador cargó en su panel, paga por su cuenta y envía la
 * referencia con el comprobante. El administrador lo revisa y, al aprobarlo,
 * se activa el plan.
 */
import { z } from 'zod';

export const PLAN_IDS = ['pro', 'pareja', 'estudiante'] as const;
export type PlanId = (typeof PLAN_IDS)[number];
/** Plan de la cuenta: los de pago o «gratis». */
export type AccountPlan = PlanId | 'gratis';

export const PLAN_PERIODS = ['mes', 'ano'] as const;
export type PlanPeriod = (typeof PLAN_PERIODS)[number];
export const PLAN_PERIOD_LABEL: Record<PlanPeriod, string> = { mes: 'Mensual', ano: 'Anual' };
export const PLAN_PERIOD_UNIT: Record<PlanPeriod, string> = { mes: 'al mes', ano: 'al año' };

export interface PlanInfo {
  id: PlanId;
  name: string;
  tagline: string;
  features: string[];
}

export const PLANS: readonly PlanInfo[] = [
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Todo tu sistema, sin límites.',
    features: ['Las 25 herramientas sin límites', 'Asistente con IA y Sugerencias', 'Crear horario de estudio automático', 'Alarmas con el panel cerrado', 'Bóveda cifrada, Emprendimientos y Finanzas'],
  },
  {
    id: 'pareja',
    name: 'Pareja',
    tagline: 'Pro para los dos.',
    features: ['Todo lo de Pro para ti y tu pareja enlazada', 'Retos y metas del pilar Pareja', 'Un solo pago para las dos cuentas'],
  },
  {
    id: 'estudiante',
    name: 'Estudiante',
    tagline: 'Pro con precio de estudiante.',
    features: ['Todo lo de Pro', 'Cursos, horario y Enfoque para estudiar', 'Pide tu código o usa tu correo universitario'],
  },
];

export const PLAN_NAME: Record<AccountPlan, string> = { gratis: 'Gratis', pro: 'Pro', pareja: 'Pareja', estudiante: 'Estudiante' };

export type PlanPrices = Record<PlanId, Record<PlanPeriod, number>>;
export const DEFAULT_PRICES: PlanPrices = {
  pro: { mes: 3.99, ano: 29.99 },
  pareja: { mes: 5.99, ano: 44.99 },
  estudiante: { mes: 1.99, ano: 19.99 },
};

export const CURRENCIES = ['USD', 'VES', 'COP', 'PEN', 'CRC', 'ARS', 'BOB', 'CLP'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const CURRENCY_LABEL: Record<Currency, string> = {
  USD: 'Dólares (USD)',
  VES: 'Bolívares (Bs)',
  COP: 'Pesos colombianos (COP)',
  PEN: 'Soles (PEN)',
  CRC: 'Colones (CRC)',
  ARS: 'Pesos argentinos (ARS)',
  BOB: 'Bolivianos (Bs)',
  CLP: 'Pesos chilenos (CLP)',
};
const CURRENCY_SYMBOL: Record<Currency, string> = { USD: '$', VES: 'Bs', COP: 'COP', PEN: 'S/', CRC: '₡', ARS: 'ARS', BOB: 'Bs', CLP: 'CLP' };
/** Monedas que se cobran sin decimales. */
const NO_DECIMALS: ReadonlySet<Currency> = new Set(['COP', 'CRC', 'ARS', 'CLP']);

export interface PaymentField {
  label: string;
  value: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  /** País o región, solo para mostrar. */
  country: string;
  currency: Currency;
  /** Cuánto vale 1 USD en la moneda del método (1 para USD). */
  rate: number;
  /** Datos para pagar: banco, número, titular… */
  fields: PaymentField[];
  /** Indicaciones extra (lo que debe poner en el concepto, horario…). */
  instructions: string;
  /** Imagen del código QR (data URL), opcional. */
  qr?: string;
  enabled: boolean;
}

export interface PaymentSettings {
  prices: PlanPrices;
  methods: PaymentMethod[];
}

const m = (id: string, name: string, country: string, currency: Currency, labels: string[], instructions = ''): PaymentMethod => ({
  id,
  name,
  country,
  currency,
  rate: currency === 'USD' ? 1 : 0,
  fields: labels.map((label) => ({ label, value: '' })),
  instructions,
  enabled: true,
});

/** Los métodos de partida: el administrador rellena sus datos desde el panel. */
export const DEFAULT_METHODS: readonly PaymentMethod[] = [
  m('ve-bancos', 'Bancos venezolanos', 'Venezuela', 'VES', ['Banco', 'Teléfono (Pago Móvil)', 'Cédula o RIF', 'Número de cuenta', 'Titular'], 'Pago Móvil o transferencia. Usa la tasa del día que ves aquí.'),
  m('zelle', 'Zelle', 'Estados Unidos', 'USD', ['Correo o teléfono', 'Titular']),
  m('bancolombia', 'Bancolombia', 'Colombia', 'COP', ['Tipo de cuenta', 'Número de cuenta', 'Titular', 'Cédula o NIT']),
  m('yape-plin', 'Yape o Plin', 'Perú', 'PEN', ['Número de celular', 'Titular']),
  m('sip', 'SINPE Móvil', 'Costa Rica', 'CRC', ['Número de teléfono', 'Titular']),
  m('pichincha', 'Banco Pichincha', 'Ecuador', 'USD', ['Tipo de cuenta', 'Número de cuenta', 'Titular', 'Cédula']),
  m('ar-transferencia', 'Transferencia Argentina', 'Argentina', 'ARS', ['CBU o CVU', 'Alias', 'Titular', 'CUIT o CUIL']),
  m('bo-transferencia', 'Transferencia Bolivia', 'Bolivia', 'BOB', ['Banco', 'Número de cuenta', 'Titular', 'Carnet de identidad']),
  m('cl-transferencia', 'Transferencia Chile', 'Chile', 'CLP', ['Banco', 'Tipo de cuenta', 'Número de cuenta', 'Titular', 'RUT', 'Correo']),
  m('paypal', 'PayPal', 'Internacional', 'USD', ['Correo de PayPal', 'Enlace PayPal.me'], 'Envía como «Amigos y familiares» si puedes, para que no se descuente comisión.'),
  m('zinli', 'Zinli', 'Internacional', 'USD', ['Correo de Zinli', 'Titular']),
];

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = { prices: DEFAULT_PRICES, methods: DEFAULT_METHODS.map((x) => ({ ...x, fields: x.fields.map((f) => ({ ...f })) })) };

/** Un método se muestra si está activo, tiene datos cargados y (si no es USD) la tasa del día. */
export function methodReady(x: PaymentMethod): boolean {
  return x.enabled && x.fields.some((f) => f.value.trim()) && (x.currency === 'USD' || x.rate > 0);
}

/** Lo que se ve de un método: solo los datos con valor. */
export function publicMethod(x: PaymentMethod): PaymentMethod {
  return { ...x, fields: x.fields.filter((f) => f.value.trim()) };
}

/** Monto a pagar en la moneda del método. */
export function localAmount(usd: number, method: Pick<PaymentMethod, 'currency' | 'rate'>): number {
  const raw = usd * (method.currency === 'USD' ? 1 : method.rate);
  return NO_DECIMALS.has(method.currency) ? Math.ceil(raw) : Math.round(raw * 100) / 100;
}

/** «Bs 1.459,64», «$3,99», «COP 16.000». */
export function formatMoney(amount: number, currency: Currency): string {
  const decimals = NO_DECIMALS.has(currency) ? 0 : 2;
  const n = amount.toLocaleString('es-VE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const sym = CURRENCY_SYMBOL[currency];
  return sym.length === 1 || sym === 'S/' ? `${sym}${sym === 'S/' ? ' ' : ''}${n}` : `${sym} ${n}`;
}

export const PAYMENT_STATUSES = ['pendiente', 'aprobado', 'rechazado'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = { pendiente: 'En revisión', aprobado: 'Aprobado', rechazado: 'Rechazado' };

export interface PaymentRequest {
  id: string;
  plan: PlanId;
  period: PlanPeriod;
  methodId: string;
  methodName: string;
  currency: Currency;
  amount: number;
  amountUsd: number;
  reference: string;
  payerName: string;
  note: string;
  /** Solo lo ve el administrador (y quien lo envió). */
  proof?: string;
  hasProof: boolean;
  status: PaymentStatus;
  adminNote: string;
  createdAt: string;
  reviewedAt: string | null;
}

/** Comprobante: imagen (data URL) de hasta ~3 MB. */
const proof = z
  .string()
  .max(4_200_000, 'El comprobante pesa demasiado (máximo 3 MB)')
  .regex(/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/, 'El comprobante debe ser una imagen');

export const paymentRequestInput = z.object({
  plan: z.enum(PLAN_IDS),
  period: z.enum(PLAN_PERIODS),
  methodId: z.string().min(1).max(60),
  reference: z.string().trim().min(3, 'Escribe el número de referencia o confirmación').max(120),
  payerName: z.string().trim().min(2, 'Escribe el nombre de quien pagó').max(120),
  note: z.string().trim().max(500).default(''),
  proof: proof.optional(),
});
export type PaymentRequestInput = z.input<typeof paymentRequestInput>;

const price = z.number().min(0).max(10_000);
export const paymentSettingsSchema = z.object({
  prices: z.object(Object.fromEntries(PLAN_IDS.map((p) => [p, z.object({ mes: price, ano: price })])) as Record<PlanId, z.ZodObject<{ mes: typeof price; ano: typeof price }>>),
  methods: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(60).regex(/^[a-z0-9-]+$/, 'id: solo minúsculas, números y guiones'),
        name: z.string().trim().min(1).max(80),
        country: z.string().trim().max(60).default(''),
        currency: z.enum(CURRENCIES),
        rate: z.number().min(0).max(1e9),
        fields: z.array(z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().max(300) })).max(12),
        instructions: z.string().trim().max(800).default(''),
        qr: z.string().max(1_500_000).regex(/^data:image\/(png|jpe?g|webp|gif);base64,/, 'El QR debe ser una imagen').optional(),
        enabled: z.boolean(),
      }),
    )
    .max(40)
    .refine((list) => new Set(list.map((x) => x.id)).size === list.length, 'Hay dos métodos con el mismo id'),
});

export const paymentReviewInput = z.object({ note: z.string().trim().max(500).default('') });

/** Plan vigente: si la fecha de vencimiento ya pasó, vuelve a «gratis». */
export function effectivePlan(plan: string | null | undefined, until: Date | string | null | undefined, now: Date = new Date()): AccountPlan {
  if (!plan || plan === 'gratis' || !until) return 'gratis';
  if (new Date(until).getTime() <= now.getTime()) return 'gratis';
  return (PLAN_IDS as readonly string[]).includes(plan) ? (plan as PlanId) : 'gratis';
}

/** Nueva fecha de vencimiento al aprobar: suma el período a lo que quede vigente. */
export function extendPlan(until: Date | string | null | undefined, period: PlanPeriod, now: Date = new Date()): Date {
  const base = until && new Date(until).getTime() > now.getTime() ? new Date(until) : new Date(now);
  const d = new Date(base);
  if (period === 'mes') d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d;
}

/** Une lo guardado con los métodos de partida (para que siempre estén todos). */
export function withDefaults(saved: Partial<PaymentSettings> | null | undefined): PaymentSettings {
  const methods = saved?.methods?.length ? saved.methods : DEFAULT_PAYMENT_SETTINGS.methods;
  return { prices: { ...DEFAULT_PRICES, ...(saved?.prices ?? {}) }, methods };
}
