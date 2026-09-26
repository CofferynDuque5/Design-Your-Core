import { legacyVault, noteTag, vaultMono, vaultSecureOf, type LegacyVaultEntry, type VaultItem, type VaultSecure } from '@dyc/core';
import { Copy, Eye, EyeOff, KeyRound, Lock, Pencil, Plus, RefreshCw, Search, ShieldAlert, ShieldCheck, Trash2, Wand2 } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { newId, useLegacyData } from '../app/legacy';
import { useToast } from '../app/toast';
import { useVault } from '../app/vault';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { Segmented, TextArea, TextField } from '../components/Form';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { FormActions } from '../components/ToolParts';
import { copyText } from '../lib/clipboard';
import { plural } from '../lib/format';
import {
  createVault,
  decryptEntry,
  encryptEntry,
  encryptLegacy,
  ENTRY_LIMITS,
  generatePassword,
  passwordStrength,
  unlockVault,
  WrongPasswordError,
  type VaultEntry,
} from '../lib/vaultCrypto';

/** Se bloquea sola tras 5 minutos sin actividad. */
export const VAULT_IDLE_MS = 5 * 60_000;
const MASTER_MIN = 8;
const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
const byName = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' });
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Solo se enlazan webs http(s). */
const safeUrl = (u?: string) => {
  if (!u) return null;
  const full = /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`;
  try {
    const url = new URL(full);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
};

type LockReason = 'idle' | 'manual' | null;
const identityOf = (v: VaultSecure) => `${v.kdf.salt}:${v.check.ct}`;

export function Vault() {
  const legacy = useLegacyData();
  const data = legacy.data?.data;
  const vault = useMemo(() => vaultSecureOf(data), [data]);
  const damaged = !vault && data?.vaultSecure !== undefined && data?.vaultSecure !== null;
  const oldEntries = useMemo(() => legacyVault(data), [data]);
  // La clave vale solo para la bóveda con la que se abrió: si se borra o se crea
  // otra (en otra pestaña o dispositivo), se vuelve a bloquear.
  const [session, setSession] = useState<{ key: CryptoKey; id: string } | null>(null);
  const key = vault && session?.id === identityOf(vault) ? session.key : null;
  const [reason, setReason] = useState<LockReason>(null);
  const open = useCallback((k: CryptoKey, v: VaultSecure) => {
    setReason(null);
    setSession({ key: k, id: identityOf(v) });
  }, []);
  const lock = useCallback((why: LockReason) => {
    setSession(null);
    setReason(why);
  }, []);

  useAutoLock(key !== null, () => lock('idle'));

  return (
    <div className="page page--narrow">
      <PageHeader eyebrow="Conocimiento" title="Bóveda">
        {key && (
          <button type="button" className="btn btn--secondary" onClick={() => lock('manual')}>
            <Lock size={16} aria-hidden="true" /> Bloquear
          </button>
        )}
      </PageHeader>
      {legacy.isPending ? (
        <Loading label="Cargando tu bóveda" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : (
        <div className="stack-lg">
          {oldEntries.length > 0 && <LegacyNotice entries={oldEntries} vault={vault} cryptoKey={key} />}
          {damaged ? (
            <DamagedVault />
          ) : !vault ? (
            <CreateVault onCreated={open} />
          ) : !key ? (
            <UnlockVault vault={vault} reason={reason} onUnlock={(k) => open(k, vault)} />
          ) : (
            <Unlocked vault={vault} cryptoKey={key} />
          )}
          <HowItWorks />
        </div>
      )}
    </div>
  );
}

/** Bloquea tras VAULT_IDLE_MS sin actividad y al salir de la página. */
function useAutoLock(active: boolean, lock: () => void) {
  const lockRef = useRef(lock);
  lockRef.current = lock;
  useEffect(() => {
    if (!active) return;
    let last = Date.now();
    let timer = window.setTimeout(() => lockRef.current(), VAULT_IDLE_MS);
    const touch = () => {
      last = Date.now();
      window.clearTimeout(timer);
      timer = window.setTimeout(() => lockRef.current(), VAULT_IDLE_MS);
    };
    // En segundo plano los temporizadores se retrasan: al volver se mira el reloj.
    const visible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last >= VAULT_IDLE_MS) lockRef.current();
    };
    const leave = () => lockRef.current();
    for (const e of ACTIVITY) window.addEventListener(e, touch, { capture: true, passive: true });
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('pagehide', leave);
    return () => {
      window.clearTimeout(timer);
      for (const e of ACTIVITY) window.removeEventListener(e, touch, { capture: true });
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('pagehide', leave);
    };
  }, [active]);
}

function HowItWorks() {
  return (
    <section className="card card--quiet stack-sm" aria-labelledby="vault-how">
      <h2 id="vault-how" className="list-count">
        Cómo se protege
      </h2>
      <ul className="facts small">
        <li>Tus entradas se cifran en este dispositivo antes de guardarse, con una clave que sale de tu contraseña maestra (AES-GCM de 256 bits).</li>
        <li>El servidor solo guarda datos cifrados: no ve tus contraseñas ni tu contraseña maestra, que nunca sale de este navegador.</li>
        <li>Si pierdes la contraseña maestra, pierdes las entradas: nadie puede recuperarlas, tampoco nosotros.</li>
        <li>Se bloquea sola tras 5 minutos sin actividad y al salir de esta página.</li>
        <li>La app anterior no puede ver esta bóveda cifrada.</li>
      </ul>
    </section>
  );
}

// ---------- Crear ----------

function StrengthHint({ password }: { password: string }) {
  const s = passwordStrength(password);
  return (
    <span className="strength" data-score={s.score}>
      <span className="strength__bar" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} data-on={s.score >= n || undefined} />
        ))}
      </span>
      <span>Seguridad: {password ? s.label.toLowerCase() : 'escribe una contraseña'}</span>
    </span>
  );
}

function CreateVault({ onCreated }: { onCreated: (key: CryptoKey, vault: VaultSecure) => void }) {
  const actions = useVault();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [show, setShow] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mismatch = repeat.length > 0 && repeat !== password;
  const valid = password.length >= MASTER_MIN && repeat === password && understood;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { vault, key } = await createVault(password);
      if (await actions.create(vault)) onCreated(key, vault);
    } catch {
      setError('No se pudo crear la bóveda en este navegador.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card card--raised stack" onSubmit={submit} aria-labelledby="vault-create" aria-busy={busy || undefined}>
      <div className="vault-lock-head">
        <span className="vault-lock-icon" aria-hidden="true">
          <KeyRound size={24} />
        </span>
        <div className="stack-xs">
          <h2 id="vault-create">Crea tu bóveda</h2>
          <p className="muted small">Elige una contraseña maestra. Con ella se cifran y se abren tus contraseñas guardadas.</p>
        </div>
      </div>
      <TextField
        label="Contraseña maestra"
        type={show ? 'text' : 'password'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        maxLength={200}
        required
        hint={
          <>
            <StrengthHint password={password} />
            <br />
            Al menos {MASTER_MIN} caracteres. Una frase de varias palabras es fácil de recordar y difícil de adivinar.
          </>
        }
      />
      <TextField
        label="Repite la contraseña maestra"
        type={show ? 'text' : 'password'}
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
        autoComplete="new-password"
        maxLength={200}
        required
        error={mismatch ? 'Las dos contraseñas no coinciden.' : null}
      />
      <label className="toggle-line">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Mostrar lo que escribo
      </label>
      <div className="alert alert--warning vault-warning" role="note">
        <ShieldAlert size={18} aria-hidden="true" />
        <span>
          <strong>No se puede recuperar.</strong> Si olvidas la contraseña maestra, perderás todas las entradas de la bóveda: ni tú ni nadie podrá descifrarlas. Guárdala en un lugar seguro.
        </span>
      </div>
      <label className="toggle-line toggle-line--ink">
        <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} /> Entiendo que, si la olvido, pierdo las entradas
      </label>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn" disabled={!valid || busy}>
        {busy ? 'Creando la bóveda…' : 'Crear la bóveda'}
      </button>
    </form>
  );
}

// ---------- Desbloquear ----------

function UnlockVault({ vault, reason, onUnlock }: { vault: VaultSecure; reason: LockReason; onUnlock: (key: CryptoKey) => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const key = await unlockVault(vault, password);
      setPassword('');
      onUnlock(key);
    } catch (err) {
      setError(err instanceof WrongPasswordError ? err.message : 'No se pudo abrir la bóveda en este navegador.');
      setBusy(false);
    }
  };

  return (
    <>
      <form className="card card--raised stack" onSubmit={submit} aria-labelledby="vault-unlock" aria-busy={busy || undefined}>
        <div className="vault-lock-head">
          <span className="vault-lock-icon" aria-hidden="true">
            <Lock size={24} />
          </span>
          <div className="stack-xs">
            <h2 id="vault-unlock">Bóveda bloqueada</h2>
            <p className="muted small">
              {plural(vault.items.length, 'entrada cifrada', 'entradas cifradas')}.{' '}
              {reason === 'idle' ? 'Se bloqueó tras 5 minutos sin actividad.' : reason === 'manual' ? 'La has bloqueado.' : 'Escribe tu contraseña maestra para verlas.'}
            </p>
          </div>
        </div>
        <TextField
          label="Contraseña maestra"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          autoComplete="current-password"
          maxLength={200}
          autoFocus
          required
          error={error}
        />
        <button type="submit" className="btn" disabled={!password || busy}>
          {busy ? 'Desbloqueando…' : 'Desbloquear'}
        </button>
        <button type="button" className="btn btn--ghost btn--sm vault-forgot" onClick={() => setForgot(true)}>
          ¿Olvidaste la contraseña maestra?
        </button>
      </form>
      <Dialog open={forgot} onClose={() => setForgot(false)} title="Olvidé la contraseña maestra">
        {forgot && <DestroyVault count={vault.items.length} onDone={() => setForgot(false)} />}
      </Dialog>
    </>
  );
}

function DestroyVault({ count, onDone }: { count: number; onDone: () => void }) {
  const actions = useVault();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const destroy = async () => {
    setBusy(true);
    if (await actions.destroy()) {
      toast('Bóveda borrada. Puedes crear una nueva.');
      onDone();
    } else setBusy(false);
  };
  return (
    <div className="stack">
      <p>
        Sin la contraseña maestra no hay forma de descifrar {count === 1 ? 'la entrada' : `las ${count} entradas`}: no se guarda en ningún sitio y nadie puede restablecerla.
      </p>
      <p>
        Si no la recuerdas, puedes borrar la bóveda cifrada y crear una nueva con otra contraseña. <strong>Se perderán {plural(count, 'entrada', 'entradas')}.</strong> Lo que quede de la app anterior no se toca.
      </p>
      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onDone} autoFocus>
          Cancelar
        </button>
        <button type="button" className="btn btn--danger" onClick={destroy} disabled={busy}>
          <Trash2 size={16} aria-hidden="true" /> {busy ? 'Borrando…' : 'Borrar la bóveda'}
        </button>
      </div>
    </div>
  );
}

function DamagedVault() {
  const [asking, setAsking] = useState(false);
  return (
    <div className="card stack-sm">
      <div className="alert alert--danger" role="alert">
        La bóveda guardada no tiene un formato válido y no se puede abrir.
      </div>
      <button type="button" className="btn btn--secondary" onClick={() => setAsking(true)}>
        Borrarla y empezar de cero
      </button>
      <Dialog open={asking} onClose={() => setAsking(false)} title="Borrar la bóveda dañada">
        {asking && <DestroyVault count={0} onDone={() => setAsking(false)} />}
      </Dialog>
    </div>
  );
}

// ---------- Contraseñas de la app anterior ----------

function LegacyNotice({ entries, vault, cryptoKey }: { entries: LegacyVaultEntry[]; vault: VaultSecure | null; cryptoKey: CryptoKey | null }) {
  const plain = entries.filter((e) => e.pass).length;
  const [asking, setAsking] = useState(false);
  const title =
    plain > 0
      ? `${plain === 1 ? 'Hay 1 contraseña' : `Hay ${plain} contraseñas`} de la app anterior guardadas sin cifrar`
      : `${plural(entries.length, 'entrada', 'entradas')} de la app anterior sin cifrar`;
  return (
    <>
      <section className="alert alert--warning vault-legacy stack-sm" aria-labelledby="vault-legacy">
        <h2 id="vault-legacy" className="vault-legacy__title">
          <ShieldAlert size={18} aria-hidden="true" /> {title}
        </h2>
        <p>La app anterior las guardaba tal cual en tus datos, que se envían y se guardan sin cifrar. Puedes pasarlas a esta bóveda cifrada; después, la bóveda de la app anterior quedará vacía.</p>
        {cryptoKey ? (
          <div>
            <button type="button" className="btn btn--sm" onClick={() => setAsking(true)}>
              <ShieldCheck size={16} aria-hidden="true" /> Cifrar y borrar las copias sin cifrar
            </button>
          </div>
        ) : (
          <p>
            <strong>{vault ? 'Desbloquea la bóveda para cifrarlas.' : 'Crea tu bóveda para cifrarlas.'}</strong>
          </p>
        )}
      </section>
      {/* Fuera del aviso: el diálogo no hereda su color. */}
      <Dialog open={asking && !!cryptoKey} onClose={() => setAsking(false)} title="Cifrar las contraseñas de la app anterior">
        {asking && cryptoKey && <MigrateDialog entries={entries} cryptoKey={cryptoKey} onDone={() => setAsking(false)} />}
      </Dialog>
    </>
  );
}

function MigrateDialog({ entries, cryptoKey, onDone }: { entries: LegacyVaultEntry[]; cryptoKey: CryptoKey; onDone: () => void }) {
  const actions = useVault();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const migrate = async () => {
    setBusy(true);
    try {
      const { items, legacyIds } = await encryptLegacy(cryptoKey, entries, newId);
      if (await actions.migrate(items, legacyIds)) {
        const left = entries.length - legacyIds.length;
        toast(
          left === 0
            ? `${plural(items.length, 'entrada cifrada', 'entradas cifradas')}. Ya no quedan copias sin cifrar en tus datos.`
            : `${plural(items.length, 'entrada cifrada', 'entradas cifradas')}. ${plural(left, 'entrada sin id no se pudo quitar', 'entradas sin id no se pudieron quitar')} de la lista antigua.`,
        );
        onDone();
        return;
      }
    } catch {
      toast('No se pudieron cifrar las entradas en este navegador.', { tone: 'error' });
    }
    setBusy(false);
  };
  return (
    <div className="stack">
      <p>Se hará en este orden:</p>
      <ol className="vault-steps">
        <li>Se cifran {entries.length === 1 ? 'la entrada' : `las ${entries.length} entradas`} en este dispositivo con tu contraseña maestra y se añaden a esta bóveda.</li>
        <li>Se borra la lista sin cifrar de la app anterior.</li>
      </ol>
      <div className="alert alert--warning" role="note">
        <strong>Después, la bóveda de la app anterior aparecerá vacía.</strong> Tus contraseñas solo se verán aquí, con la contraseña maestra.
      </div>
      <p className="muted small">
        Si otro navegador aún tiene abierta la app anterior con una copia vieja y la vuelve a subir, este aviso aparecerá de nuevo y podrás repetir el paso.
      </p>
      <ul className="vault-migrate-list small" aria-label="Entradas que se cifrarán">
        {entries.slice(0, 8).map((e, i) => (
          <li key={e.id || i}>
            <strong>{e.name || 'Sin nombre'}</strong> {e.user && <span className="muted">· {e.user}</span>}
          </li>
        ))}
        {entries.length > 8 && <li className="muted">y {plural(entries.length - 8, 'más', 'más')}</li>}
      </ul>
      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onDone} autoFocus>
          Cancelar
        </button>
        <button type="button" className="btn" onClick={migrate} disabled={busy}>
          {busy ? 'Cifrando…' : 'Cifrar y borrar las copias sin cifrar'}
        </button>
      </div>
    </div>
  );
}

// ---------- Desbloqueada ----------

type Decrypted = { sig: string; entry: VaultEntry | null };
const sigOf = (i: VaultItem) => `${i.iv}:${i.ct}`;

function Unlocked({ vault, cryptoKey }: { vault: VaultSecure; cryptoKey: CryptoKey }) {
  const actions = useVault();
  const toast = useToast();
  const [plain, setPlain] = useState<Record<string, Decrypted>>({});
  const [query, setQuery] = useState('');
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ id: string; entry: VaultEntry | null } | null>(null);

  // Descifra lo que falte (o lo que cambió); lo ya descifrado se reutiliza.
  useEffect(() => {
    let alive = true;
    const todo = vault.items.filter((i) => plain[i.id]?.sig !== sigOf(i));
    if (!todo.length) return;
    Promise.all(todo.map(async (i) => [i.id, { sig: sigOf(i), entry: await decryptEntry(cryptoKey, i).catch(() => null) }] as const)).then((pairs) => {
      if (alive) setPlain((p) => ({ ...p, ...Object.fromEntries(pairs) }));
    });
    return () => {
      alive = false;
    };
  }, [vault.items, cryptoKey, plain]);

  const loading = vault.items.some((i) => plain[i.id]?.sig !== sigOf(i));
  const rows = useMemo(() => {
    const q = norm(query.trim());
    return vault.items
      .map((i) => ({ item: i, entry: plain[i.id]?.sig === sigOf(i) ? plain[i.id].entry : undefined }))
      .filter((r) => r.entry !== undefined)
      .filter((r) => !q || (r.entry ? norm(`${r.entry.name} ${r.entry.user} ${r.entry.url ?? ''}`).includes(q) : false))
      .sort((a, b) => byName(a.entry?.name ?? '', b.entry?.name ?? ''));
  }, [vault.items, plain, query]);

  const save = async (id: string, entry: VaultEntry, isNew: boolean) => {
    const item = await encryptEntry(cryptoKey, id, entry);
    // Ya se conoce el texto: se muestra sin esperar a descifrarlo.
    setPlain((p) => ({ ...p, [id]: { sig: sigOf(item), entry } }));
    return isNew ? actions.add(item) : actions.update(item);
  };

  const copy = async (text: string, what: string) => {
    if (await copyText(text)) toast(`${what} copiado.`);
    else toast('No se pudo copiar en este navegador. Muestra la contraseña y cópiala a mano.', { tone: 'error' });
  };

  const toggle = (id: string) =>
    setRevealed((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="stack-lg">
      <div className="vault-toolbar">
        <div className="search-field">
          <Search size={18} aria-hidden="true" />
          <label className="visually-hidden" htmlFor="vault-search">
            Buscar en la bóveda
          </label>
          <input id="vault-search" type="search" className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, usuario o web…" />
        </div>
        <button type="button" className="btn" onClick={() => setEditing({ id: newId(), entry: null })}>
          <Plus size={18} aria-hidden="true" /> Nueva entrada
        </button>
      </div>

      <section className="card card--list" aria-labelledby="vault-list">
        <h2 id="vault-list" className="list-count">
          <ShieldCheck size={16} aria-hidden="true" /> {plural(vault.items.length, 'entrada', 'entradas')} · desbloqueada
        </h2>
        {loading && rows.length === 0 ? (
          <p className="muted small" role="status">
            Descifrando…
          </p>
        ) : vault.items.length === 0 ? (
          <EmptyState title="Tu bóveda está vacía">Guarda aquí usuarios y contraseñas. Se cifran en este dispositivo antes de guardarse.</EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState title="Ninguna entrada coincide">Prueba con otra palabra.</EmptyState>
        ) : (
          <ul className="vault-list">
            {rows.map(({ item, entry }) =>
              entry ? (
                <VaultRow
                  key={item.id}
                  entry={entry}
                  shown={revealed.has(item.id)}
                  onToggle={() => toggle(item.id)}
                  onCopy={copy}
                  onEdit={() => setEditing({ id: item.id, entry })}
                />
              ) : (
                <li key={item.id} className="vault-row vault-row--damaged">
                  <span className="vault-mono" aria-hidden="true">
                    ?
                  </span>
                  <span className="vault-row__text">
                    <strong>No se pudo descifrar esta entrada</strong>
                    <span className="muted small">Los datos están dañados o no son de esta bóveda.</span>
                  </span>
                  <span className="vault-row__actions">
                    <button type="button" className="icon-btn" onClick={() => actions.remove(item.id)} aria-label="Borrar la entrada dañada">
                      <Trash2 size={18} aria-hidden="true" />
                    </button>
                  </span>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <Generator onCopy={(p) => copy(p, 'Contraseña')} />

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing?.entry ? 'Editar entrada' : 'Nueva entrada'}>
        {editing && (
          <EntryForm
            entry={editing.entry}
            onSave={async (entry) => {
              const isNew = !editing.entry;
              setEditing(null);
              await save(editing.id, entry, isNew);
            }}
            onDelete={
              editing.entry
                ? () => {
                    actions.remove(editing.id);
                    setEditing(null);
                  }
                : undefined
            }
          />
        )}
      </Dialog>
    </div>
  );
}

function VaultRow({ entry, shown, onToggle, onCopy, onEdit }: { entry: VaultEntry; shown: boolean; onToggle: () => void; onCopy: (text: string, what: string) => void; onEdit: () => void }) {
  const name = entry.name || 'Sin nombre';
  const url = safeUrl(entry.url);
  return (
    <li className="vault-row">
      <span className="vault-mono" style={{ ['--c' as string]: noteTag(name) }} aria-hidden="true">
        {entry.mono || vaultMono(name)}
      </span>
      <span className="vault-row__text">
        <strong>{name}</strong>
        {entry.user && <span className="muted small vault-row__user">{entry.user}</span>}
        <span className="vault-row__pass">
          {shown ? (
            <code className="vault-pass">{entry.pass || '(sin contraseña)'}</code>
          ) : (
            <span className="vault-pass vault-pass--hidden">
              <span aria-hidden="true">••••••••••</span>
              <span className="visually-hidden">Contraseña oculta</span>
            </span>
          )}
        </span>
        {url && (
          <a className="small vault-row__url" href={url} target="_blank" rel="noopener noreferrer nofollow">
            {entry.url}
            <span className="visually-hidden"> (se abre en otra pestaña)</span>
          </a>
        )}
      </span>
      <span className="vault-row__actions">
        <button type="button" className="icon-btn" onClick={onToggle} aria-pressed={shown} aria-label={`Mostrar la contraseña de «${name}»`}>
          {shown ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
        <button type="button" className="icon-btn" onClick={() => onCopy(entry.pass, 'Contraseña')} disabled={!entry.pass} aria-label={`Copiar la contraseña de «${name}»`}>
          <Copy size={18} aria-hidden="true" />
        </button>
        <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Editar «${name}»`}>
          <Pencil size={18} aria-hidden="true" />
        </button>
      </span>
      {entry.user && (
        <button type="button" className="btn btn--ghost btn--sm vault-row__copy-user" onClick={() => onCopy(entry.user, 'Usuario')} aria-label={`Copiar el usuario de «${name}»`}>
          <Copy size={14} aria-hidden="true" /> Copiar usuario
        </button>
      )}
    </li>
  );
}

function EntryForm({ entry, onSave, onDelete }: { entry: VaultEntry | null; onSave: (e: VaultEntry) => void; onDelete?: () => void }) {
  const [name, setName] = useState(entry?.name ?? '');
  const [user, setUser] = useState(entry?.user ?? '');
  const [pass, setPass] = useState(entry?.pass ?? '');
  const [url, setUrl] = useState(entry?.url ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [show, setShow] = useState(!entry);
  const passId = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const clean = name.trim();
    // Iniciales nuevas solo si cambia el nombre (se conservan las de la app anterior).
    const mono = entry && entry.name === clean && entry.mono ? entry.mono : vaultMono(clean);
    onSave({ name: clean, mono, user: user.trim(), pass, url: url.trim() || undefined, note: note.trim() ? note : undefined });
  };
  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} maxLength={ENTRY_LIMITS.name} required autoFocus placeholder="Banco, correo, GitHub…" autoComplete="off" />
      <TextField label="Usuario o correo" value={user} onChange={(e) => setUser(e.target.value)} maxLength={ENTRY_LIMITS.user} autoComplete="off" autoCapitalize="none" spellCheck={false} />
      <div className="field">
        <label className="field__label" htmlFor={passId}>
          Contraseña
        </label>
        <div className="vault-pass-field">
          <input
            id={passId}
            className="input"
            type={show ? 'text' : 'password'}
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            maxLength={ENTRY_LIMITS.pass}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby={`${passId}-hint`}
          />
          <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-pressed={show} aria-label="Mostrar la contraseña">
            {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => {
              setPass(generatePassword(20));
              setShow(true);
            }}
          >
            <Wand2 size={16} aria-hidden="true" /> Generar
          </button>
        </div>
        <span className="field__hint" id={`${passId}-hint`}>
          <StrengthHint password={pass} />
        </span>
      </div>
      <TextField label="Web (opcional)" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={ENTRY_LIMITS.url} inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="ejemplo.com" />
      <TextArea label="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={ENTRY_LIMITS.note} rows={3} />
      <FormActions submitLabel={entry ? 'Guardar' : 'Añadir a la bóveda'} disabled={!name.trim()} onDelete={onDelete} confirm={`Se borrará «${entry?.name || 'esta entrada'}» de la bóveda.`} />
    </form>
  );
}

const LENGTHS = ['16', '20', '32'] as const;

function Generator({ onCopy }: { onCopy: (password: string) => void }) {
  const [length, setLength] = useState<(typeof LENGTHS)[number]>('20');
  const [symbols, setSymbols] = useState(true);
  const [value, setValue] = useState(() => generatePassword(20));
  const regen = (len = length, sym = symbols) => setValue(generatePassword(Number(len), { symbols: sym }));
  return (
    <section className="card stack-sm" aria-labelledby="vault-gen">
      <h2 id="vault-gen" className="list-count">
        <Wand2 size={16} aria-hidden="true" /> Generador de contraseñas
      </h2>
      <output className="vault-generated" aria-live="polite" aria-label="Contraseña generada">
        {value}
      </output>
      <div className="vault-gen-options">
        <span className="small muted" aria-hidden="true">
          Caracteres
        </span>
        <Segmented
          label="Longitud en caracteres"
          value={length}
          onChange={(v) => {
            setLength(v);
            regen(v);
          }}
          options={LENGTHS.map((l) => ({ value: l, label: l }))}
        />
        <label className="toggle-line">
          <input
            type="checkbox"
            checked={symbols}
            onChange={(e) => {
              setSymbols(e.target.checked);
              regen(length, e.target.checked);
            }}
          />{' '}
          Incluir símbolos
        </label>
      </div>
      <div className="row">
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => regen()}>
          <RefreshCw size={16} aria-hidden="true" /> Otra
        </button>
        <button type="button" className="btn btn--sm" onClick={() => onCopy(value)}>
          <Copy size={16} aria-hidden="true" /> Copiar
        </button>
      </div>
    </section>
  );
}
