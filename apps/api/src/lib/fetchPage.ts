import { lookup } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

/** Descarga una página pública (texto) para leer la duración de un curso. */
export type FetchPage = (url: string) => Promise<{ status: number; body: string }>;

const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 8000;

/** true si la dirección es de internet (no la red local, ni el propio servidor). */
export function isPublicAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isPublicAddress(mapped[1]);
    return !(v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v));
  }
  return false;
}

// Se revisa la IP ya resuelta, justo al conectar: así no se cuela una IP interna
// aunque el nombre cambie entre una consulta y otra.
const safeLookup: LookupFunction = (host, options, cb) => {
  lookup(host, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, '', 0);
    const list = (addresses as unknown as Array<{ address: string; family: number }>) ?? [];
    const bad = list.find((a) => !isPublicAddress(a.address));
    if (!list.length || bad) return cb(Object.assign(new Error('Dirección no permitida'), { code: 'EBLOCKED' }), '', 0);
    if ((options as { all?: boolean }).all) return (cb as unknown as (e: null, a: typeof list) => void)(null, list);
    cb(null, list[0].address, list[0].family);
  });
};

function getOnce(url: URL): Promise<{ status: number; body: string; location?: string }> {
  return new Promise((resolve, reject) => {
    if (isIP(url.hostname.replace(/^\[|\]$/g, '')) && !isPublicAddress(url.hostname.replace(/^\[|\]$/g, ''))) return reject(new Error('Dirección no permitida'));
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.get(
      url,
      {
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; DesignYourCore/1.0; +https://designyourcorepanel.nvcorx.com)',
          accept: 'text/html,application/json;q=0.9,*/*;q=0.5',
          'accept-language': 'es,en;q=0.8',
          // La página de YouTube pide aceptar cookies en Europa; esto la salta.
          cookie: 'CONSENT=YES+1; SOCS=CAI',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, body: '', location: res.headers.location });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) {
            res.destroy();
            return resolve({ status, body: Buffer.concat(chunks).toString('utf8') });
          }
          chunks.push(c);
        });
        res.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('Tiempo agotado')));
    req.on('error', reject);
  });
}

/** GET con hasta 3 redirecciones, solo http(s) y solo a direcciones públicas. */
export const fetchPublicPage: FetchPage = async (url) => {
  let u = new URL(url);
  for (let hop = 0; hop < 4; hop++) {
    if (!/^https?:$/.test(u.protocol)) throw new Error('Solo http y https');
    const r = await getOnce(u);
    if (!r.location) return r;
    u = new URL(r.location, u);
  }
  throw new Error('Demasiadas redirecciones');
};
