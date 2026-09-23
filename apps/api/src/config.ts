import dotenv from 'dotenv';

// TODA la configuración vive en UN solo archivo visible y fácil de editar:
// core-config.env. Tiene prioridad (override) para que sea la única fuente de
// verdad: no hace falta tocar variables en el panel de cPanel.
export function loadEnvFiles(): void {
  dotenv.config({ path: 'core-config.env', override: true });
  dotenv.config();
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass: string;
  from: string;
}

export interface Config {
  isProd: boolean;
  port: number | string;
  databaseUrl: string;
  jwtSecret: string;
  /** Orígenes exactos permitidos (CLIENT_ORIGIN, separados por comas). */
  clientOrigins: string[];
  /** Dominios propios: cualquier subdominio suyo puede hablar con la API. */
  allowedRootDomains: string[];
  /** URL pública de la API (enlaces de recuperación de contraseña). */
  publicUrl?: string;
  smtp: SmtpConfig | null;
}

const DEV_SECRET = 'dev-secret-solo-local-0000000000000000';

// Normaliza la cadena de la base de datos para que funcione sí o sí:
//  - quita channel_binding (el motor no lo soporta y hace fallar la conexión),
//  - si es un enlace "pooler" de Neon (PgBouncer), añade pgbouncer=true para
//    que Prisma no use prepared statements (evita errores intermitentes).
export function normalizeDatabaseUrl(raw: string | undefined): string {
  if (!raw) return '';
  let u = raw
    .replace(/([?&])channel_binding=require/gi, '$1')
    .replace(/&&/g, '&')
    .replace(/[?&]$/, '')
    .replace(/\?&/, '?');
  if (/-pooler/.test(u) && !/[?&]pgbouncer=/.test(u)) {
    u += (u.includes('?') ? '&' : '?') + 'pgbouncer=true';
  }
  return u;
}

export function isPlaceholderDatabaseUrl(u: string): boolean {
  return !u || /USUARIO:CLAVE|ep-xxxx/.test(u);
}

export function resolveSecret(secret: string | undefined, isProd: boolean): string {
  const s = secret || '';
  if (isProd) {
    if (s.length < 32) throw new Error('JWT_SECRET debe tener 32+ caracteres en producción');
    return s;
  }
  return s || DEV_SECRET;
}

const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((x) => x.trim().replace(/\/+$/, ''))
    .filter(Boolean);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const isProd = env.NODE_ENV === 'production';
  const portEnv = env.PORT || '4600';
  return {
    isProd,
    port: /^\d+$/.test(portEnv) ? Number(portEnv) : portEnv,
    databaseUrl: normalizeDatabaseUrl(env.DATABASE_URL),
    jwtSecret: resolveSecret(env.JWT_SECRET, isProd),
    clientOrigins: list(env.CLIENT_ORIGIN),
    allowedRootDomains: list(env.ALLOWED_ROOT_DOMAINS ?? 'nvcorx.com'),
    publicUrl: env.PUBLIC_URL ? env.PUBLIC_URL.replace(/\/+$/, '') : undefined,
    smtp: env.SMTP_HOST
      ? {
          host: env.SMTP_HOST,
          port: Number(env.SMTP_PORT || 587),
          secure: env.SMTP_SECURE === 'true',
          user: env.SMTP_USER || undefined,
          pass: env.SMTP_PASS || '',
          from: env.SMTP_FROM || 'Core <no-reply@localhost>',
        }
      : null,
  };
}
