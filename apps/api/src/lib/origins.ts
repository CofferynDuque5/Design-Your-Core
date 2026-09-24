import type { Config } from '../config.js';

type OriginRules = Pick<Config, 'clientOrigins' | 'allowedRootDomains'>;

/** true si el origen es de confianza: CLIENT_ORIGIN o un subdominio de los dominios propios. */
export function isTrustedOrigin(origin: string, rules: OriginRules): boolean {
  const o = origin.replace(/\/+$/, '');
  if (rules.clientOrigins.includes(o)) return true;
  try {
    const h = new URL(o).hostname;
    return rules.allowedRootDomains.some((d) => h === d || h.endsWith('.' + d));
  } catch {
    return false;
  }
}

/** Origen local de desarrollo (localhost / 127.0.0.1). */
export function isLocalOrigin(origin: string): boolean {
  try {
    const h = new URL(origin).hostname;
    return h === 'localhost' || h === '127.0.0.1';
  } catch {
    return false;
  }
}
