import {
  ENTRY_LIMITS,
  generatePassword,
  legacyVault,
  noteTag,
  passwordStrength,
  plural,
  vaultMono,
  vaultSecureOf,
  WrongPasswordError,
  type VaultEntry,
  type VaultItem,
  type VaultSecure,
} from '@dyc/core';
import { radius, space } from '@dyc/tokens';
import { Copy, Eye, EyeOff, Fingerprint, KeyRound, Lock, Pencil, Plus, RefreshCw, Search, ShieldAlert, ShieldCheck, Trash2, Wand2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { FormActions, IconButton, Toggle, ToolScreen } from '../../components/tools';
import { Button, Card, EmptyState, ErrorState, Field, Loading, Segmented, T, fonts, type as typo } from '../../components/ui';
import { newId, useLegacyData } from '../../lib/legacy';
import { useTheme } from '../../lib/theme';
import { useToast } from '../../lib/toast';
import { copyOrShare } from '../../lib/tools';
import { useVault } from '../../lib/vault';
import { createVault, decryptEntry, encryptEntry, unlockVault, type VaultKey } from '../../lib/vaultCrypto';
import { biometricsAvailable, forgetKey, hasSavedKey, loadKey, saveKey } from '../../lib/vaultKey';
import { openOnWeb } from '../../lib/web';

/**
 * Bóveda en el móvil: la misma bóveda cifrada que la web (se abre en los dos
 * sitios con la misma contraseña maestra). La primera apertura en cada
 * teléfono tarda cerca de un minuto; después se abre con huella o Face ID.
 * Borrar la bóveda y cifrar las contraseñas de la app anterior se hacen en la web.
 */

/** Se bloquea sola tras 5 minutos sin tocar la pantalla y al pasar la app a segundo plano. */
const VAULT_IDLE_MS = 5 * 60_000;
const MASTER_MIN = 8;
const byName = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' });
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type LockReason = 'idle' | 'manual' | null;
const identityOf = (v: VaultSecure) => `${v.kdf.salt}:${v.check.ct}`;

export default function Vault() {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const data = legacy.data?.data;
  const vault = useMemo(() => vaultSecureOf(data), [data]);
  const damaged = !vault && data?.vaultSecure !== undefined && data?.vaultSecure !== null;
  const oldEntries = useMemo(() => legacyVault(data), [data]);
  // La clave vale solo para la bóveda con la que se abrió.
  const [session, setSession] = useState<{ key: VaultKey; id: string } | null>(null);
  const key = vault && session?.id === identityOf(vault) ? session.key : null;
  const [reason, setReason] = useState<LockReason>(null);
  const open = useCallback((k: VaultKey, v: VaultSecure) => {
    setReason(null);
    setSession({ key: k, id: identityOf(v) });
  }, []);
  const lock = useCallback((why: LockReason) => {
    setSession(null);
    setReason(why);
  }, []);
  const touch = useAutoLock(key !== null, () => lock('idle'));

  return (
    <ToolScreen
      title="Bóveda"
      eyebrow="Conocimiento"
      refreshing={legacy.isRefetching}
      onRefresh={() => legacy.refetch()}
      right={key ? <Button small variant="secondary" label="Bloquear" icon={<Lock size={16} color={colors.primary} />} onPress={() => lock('manual')} /> : undefined}
    >
      <View onTouchStart={touch} style={{ gap: space[6] }}>
        {legacy.isPending ? (
          <Loading label="Cargando tu bóveda" />
        ) : legacy.isError ? (
          <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
        ) : (
          <>
            {oldEntries.length > 0 && <LegacyNotice count={oldEntries.length} />}
            {damaged ? (
              <Card>
                <T v="body" tint="danger" accessibilityRole="alert">
                  La bóveda guardada no tiene un formato válido y no se puede abrir.
                </T>
                <Button variant="secondary" label="Revisarla en la web" onPress={() => openOnWeb('/boveda')} />
              </Card>
            ) : !vault ? (
              <CreateVault onCreated={open} />
            ) : !key ? (
              <UnlockVault vault={vault} reason={reason} onUnlock={(k) => open(k, vault)} />
            ) : (
              <Unlocked vault={vault} cryptoKey={key} />
            )}
            <HowItWorks />
          </>
        )}
      </View>
    </ToolScreen>
  );
}

/** Bloquea tras VAULT_IDLE_MS sin tocar la pantalla y en cuanto la app deja de estar delante. */
function useAutoLock(active: boolean, lock: () => void) {
  const lockRef = useRef(lock);
  lockRef.current = lock;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touch = useCallback(() => {
    clearTimeout(timer.current);
    if (active) timer.current = setTimeout(() => lockRef.current(), VAULT_IDLE_MS);
  }, [active]);
  useEffect(() => {
    if (!active) return;
    touch();
    const sub = AppState.addEventListener('change', (s) => s !== 'active' && lockRef.current());
    return () => {
      clearTimeout(timer.current);
      sub.remove();
    };
  }, [active, touch]);
  return touch;
}

function LockHead({ icon, title, children }: { icon: React.ReactNode; title: string; children: string }) {
  const { colors } = useTheme();
  return (
    <View style={st.lockHead}>
      <View style={[st.lockIcon, { backgroundColor: colors.primarySoft }]}>{icon}</View>
      <View style={{ flex: 1, gap: space[1] }}>
        <T v="heading" accessibilityRole="header">
          {title}
        </T>
        <T v="small" tint="muted">
          {children}
        </T>
      </View>
    </View>
  );
}

function HowItWorks() {
  const facts = [
    'Tus entradas se cifran en este teléfono antes de guardarse, con una clave que sale de tu contraseña maestra (AES-GCM de 256 bits). Es la misma bóveda que en la web.',
    'El servidor solo guarda datos cifrados: no ve tus contraseñas ni tu contraseña maestra.',
    'Con huella o Face ID, lo que se guarda en el llavero del teléfono es la clave, nunca la contraseña maestra. Se borra al cerrar sesión.',
    'Si pierdes la contraseña maestra, pierdes las entradas: nadie puede recuperarlas, tampoco nosotros.',
    'Se bloquea sola tras 5 minutos sin tocar la pantalla y al salir de la app.',
  ];
  return (
    <Card tone="sunken">
      <T v="label" accessibilityRole="header">
        Cómo se protege
      </T>
      {facts.map((f) => (
        <T key={f} v="small" tint="muted">
          {f}
        </T>
      ))}
    </Card>
  );
}

function LegacyNotice({ count }: { count: number }) {
  const { colors } = useTheme();
  return (
    <Card style={{ borderColor: colors.warning, borderWidth: 1 }}>
      <View style={st.row}>
        <ShieldAlert size={18} color={colors.warning} />
        <T v="label" style={{ flex: 1 }}>
          {plural(count, 'entrada', 'entradas')} de la app anterior sin cifrar
        </T>
      </View>
      <T v="small" tint="muted">
        La app anterior las guardaba tal cual en tus datos. Puedes pasarlas a esta bóveda cifrada desde la web.
      </T>
      <Button small variant="secondary" label="Cifrarlas en la web" onPress={() => openOnWeb('/boveda')} style={{ alignSelf: 'flex-start' }} />
    </Card>
  );
}

/** Segundos que lleva la derivación de la clave (la primera vez tarda cerca de un minuto). */
function useElapsed(running: boolean) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!running) return setS(0);
    const start = Date.now();
    const t = setInterval(() => setS(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running]);
  return s;
}

function SlowNote({ busy, label }: { busy: boolean; label: string }) {
  const s = useElapsed(busy);
  if (!busy) return null;
  return (
    <T v="small" tint="muted" accessibilityLiveRegion="polite">
      {label}
      {s > 0 ? ` (${s} s)` : ''}. En el teléfono tarda cerca de un minuto: la clave se calcula con 600 000 vueltas para que nadie pueda adivinarla.
    </T>
  );
}

function StrengthHint({ password }: { password: string }) {
  const { colors } = useTheme();
  const s = passwordStrength(password);
  return (
    <View style={st.row} accessible accessibilityLabel={`Seguridad: ${password ? s.label.toLowerCase() : 'escribe una contraseña'}`}>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {[1, 2, 3, 4].map((n) => (
          <View key={n} style={[st.bar, { backgroundColor: s.score >= n ? (s.score >= 3 ? colors.primary : colors.warning) : colors.lineStrong }]} />
        ))}
      </View>
      <T v="small" tint="muted">
        Seguridad: {password ? s.label.toLowerCase() : 'escribe una contraseña'}
      </T>
    </View>
  );
}

/** «Abrir con huella o Face ID la próxima vez», encendido por defecto si el teléfono puede. */
function RememberToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  if (!biometricsAvailable()) return null;
  return (
    <View style={st.row}>
      <T v="body" style={{ flex: 1 }}>
        Abrir con huella o Face ID la próxima vez
      </T>
      <Toggle label="Abrir con huella o Face ID la próxima vez" value={value} onChange={onChange} />
    </View>
  );
}

// ---------- Crear ----------

function CreateVault({ onCreated }: { onCreated: (key: VaultKey, vault: VaultSecure) => void }) {
  const { colors } = useTheme();
  const actions = useVault();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [show, setShow] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mismatch = repeat.length > 0 && repeat !== password;
  const valid = password.length >= MASTER_MIN && repeat === password && understood;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { vault, key } = await createVault(password);
      if (await actions.create(vault)) {
        if (remember && biometricsAvailable()) await saveKey(vault, key);
        onCreated(key, vault);
        return;
      }
    } catch {
      setError('No se pudo crear la bóveda en este teléfono.');
    }
    setBusy(false);
  };

  return (
    <Card style={{ gap: space[4] }}>
      <LockHead icon={<KeyRound size={24} color={colors.primary} />} title="Crea tu bóveda">
        Elige una contraseña maestra. Con ella se cifran y se abren tus contraseñas guardadas, aquí y en la web.
      </LockHead>
      <Field label="Contraseña maestra" value={password} onChangeText={setPassword} secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} maxLength={200} textContentType="newPassword" editable={!busy} />
      <StrengthHint password={password} />
      <T v="small" tint="muted" style={{ marginTop: -space[2] }}>
        Al menos {MASTER_MIN} caracteres. Una frase de varias palabras es fácil de recordar y difícil de adivinar.
      </T>
      <Field
        label="Repite la contraseña maestra"
        value={repeat}
        onChangeText={setRepeat}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={200}
        textContentType="newPassword"
        editable={!busy}
        error={mismatch ? 'Las dos contraseñas no coinciden.' : null}
      />
      <View style={st.row}>
        <T v="body" style={{ flex: 1 }}>
          Mostrar lo que escribo
        </T>
        <Toggle label="Mostrar lo que escribo" value={show} onChange={setShow} />
      </View>
      <View accessibilityRole="alert" style={[st.warning, { borderColor: colors.warning }]}>
        <ShieldAlert size={18} color={colors.warning} />
        <T v="small" style={{ flex: 1 }}>
          <T v="small" style={{ fontFamily: fonts.semibold }}>
            No se puede recuperar.
          </T>{' '}
          Si olvidas la contraseña maestra, perderás todas las entradas de la bóveda: ni tú ni nadie podrá descifrarlas.
        </T>
      </View>
      <View style={st.row}>
        <T v="body" style={{ flex: 1 }}>
          Entiendo que, si la olvido, pierdo las entradas
        </T>
        <Toggle label="Entiendo que, si la olvido, pierdo las entradas" value={understood} onChange={setUnderstood} />
      </View>
      <RememberToggle value={remember} onChange={setRemember} />
      {error && (
        <T v="small" tint="danger" accessibilityRole="alert">
          {error}
        </T>
      )}
      <Button label={busy ? 'Creando la bóveda…' : 'Crear la bóveda'} onPress={submit} disabled={!valid} busy={busy} />
      <SlowNote busy={busy} label="Creando la clave" />
    </Card>
  );
}

// ---------- Desbloquear ----------

function UnlockVault({ vault, reason, onUnlock }: { vault: VaultSecure; reason: LockReason; onUnlock: (key: VaultKey) => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [remember, setRemember] = useState(true);
  const tried = useRef(false);

  const withBiometrics = useCallback(async () => {
    const key = await loadKey(vault);
    if (key) return onUnlock(key);
    // Cancelado o ya no vale (cambiaron las huellas, o la bóveda es otra): se pide la contraseña.
    if (!(await hasSavedKey(vault))) setSaved(false);
  }, [vault, onUnlock]);

  useEffect(() => {
    let live = true;
    hasSavedKey(vault).then((has) => {
      if (!live) return;
      setSaved(has);
      // Al entrar se pide la huella una vez; tras bloquearla a mano, no.
      if (has && !tried.current && reason === null) {
        tried.current = true;
        void withBiometrics();
      }
    });
    return () => {
      live = false;
    };
  }, [vault, reason, withBiometrics]);

  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const key = await unlockVault(vault, password);
      setPassword('');
      if (remember && biometricsAvailable() && !(await saveKey(vault, key))) toast('No se pudo guardar para la huella o Face ID. La próxima vez pide la contraseña.', { tone: 'error' });
      onUnlock(key);
    } catch (err) {
      setError(err instanceof WrongPasswordError ? err.message : 'No se pudo abrir la bóveda en este teléfono.');
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: space[4] }}>
      <LockHead icon={<Lock size={24} color={colors.primary} />} title="Bóveda bloqueada">
        {`${plural(vault.items.length, 'entrada cifrada', 'entradas cifradas')}. ${
          reason === 'idle' ? 'Se bloqueó tras 5 minutos sin actividad.' : reason === 'manual' ? 'La has bloqueado.' : saved ? 'Ábrela con tu huella o Face ID, o con la contraseña maestra.' : 'Escribe tu contraseña maestra para verlas.'
        }`}
      </LockHead>
      {saved && !busy && <Button label="Abrir con huella o Face ID" icon={<Fingerprint size={18} color={colors.onPrimary} />} onPress={withBiometrics} />}
      <Field
        label="Contraseña maestra"
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          setError(null);
        }}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={200}
        textContentType="password"
        editable={!busy}
        returnKeyType="done"
        onSubmitEditing={submit}
        error={error}
      />
      {!saved && <RememberToggle value={remember} onChange={setRemember} />}
      <Button variant={saved ? 'secondary' : 'primary'} label={busy ? 'Desbloqueando…' : 'Desbloquear'} onPress={submit} disabled={!password} busy={busy} />
      <SlowNote busy={busy} label="Abriendo la bóveda" />
      {saved && !busy && (
        <Button
          small
          variant="ghost"
          label="Dejar de usar la huella o Face ID aquí"
          onPress={async () => {
            await forgetKey();
            setSaved(false);
            toast('La próxima vez se pedirá la contraseña maestra.');
          }}
        />
      )}
      <Button small variant="ghost" label="¿Olvidaste la contraseña maestra?" onPress={() => openOnWeb('/boveda')} accessibilityHint="Se abre en la web: allí puedes borrar la bóveda y crear otra" />
    </Card>
  );
}

// ---------- Desbloqueada ----------

type Decrypted = { sig: string; entry: VaultEntry | null };
const sigOf = (i: VaultItem) => `${i.iv}:${i.ct}`;

function Unlocked({ vault, cryptoKey }: { vault: VaultSecure; cryptoKey: VaultKey }) {
  const { colors } = useTheme();
  const actions = useVault();
  const toast = useToast();
  const [plain, setPlain] = useState<Record<string, Decrypted>>({});
  const [query, setQuery] = useState('');
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ id: string; entry: VaultEntry | null } | null>(null);

  // Descifra lo que falte (o lo que cambió); lo ya descifrado se reutiliza. AES-GCM es rápido: no hace falta esperar.
  useEffect(() => {
    const todo = vault.items.filter((i) => plain[i.id]?.sig !== sigOf(i));
    if (!todo.length) return;
    const pairs = todo.map((i) => {
      let entry: VaultEntry | null = null;
      try {
        entry = decryptEntry(cryptoKey, i);
      } catch {
        /* entrada dañada */
      }
      return [i.id, { sig: sigOf(i), entry }] as const;
    });
    setPlain((p) => ({ ...p, ...Object.fromEntries(pairs) }));
  }, [vault.items, cryptoKey, plain]);

  const rows = useMemo(() => {
    const q = norm(query.trim());
    return vault.items
      .map((i) => ({ item: i, entry: plain[i.id]?.sig === sigOf(i) ? plain[i.id].entry : undefined }))
      .filter((r) => r.entry !== undefined)
      .filter((r) => !q || (r.entry ? norm(`${r.entry.name} ${r.entry.user} ${r.entry.url ?? ''}`).includes(q) : false))
      .sort((a, b) => byName(a.entry?.name ?? '', b.entry?.name ?? ''));
  }, [vault.items, plain, query]);

  const save = (id: string, entry: VaultEntry, isNew: boolean) => {
    const item = encryptEntry(cryptoKey, id, entry);
    setPlain((p) => ({ ...p, [id]: { sig: sigOf(item), entry } }));
    return isNew ? actions.add(item) : actions.update(item);
  };

  const copy = async (text: string, what: string) => {
    const r = await copyOrShare(text);
    if (r === 'copied') toast(`${what} copiado.`);
    else if (r === 'failed') toast('No se pudo copiar. Muestra la contraseña y cópiala a mano.', { tone: 'error' });
  };

  const toggle = (id: string) =>
    setRevealed((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <View style={{ gap: space[5] }}>
      <View style={[st.search, { borderColor: colors.lineStrong, backgroundColor: colors.surface }]}>
        <Search size={18} color={colors.inkMuted} />
        <TextInput
          accessibilityLabel="Buscar en la bóveda"
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por nombre, usuario o web…"
          placeholderTextColor={colors.inkSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          style={[typo.body, { flex: 1, color: colors.ink, minHeight: 44 }]}
        />
      </View>
      <Button label="Nueva entrada" icon={<Plus size={18} color={colors.onPrimary} />} onPress={() => setEditing({ id: newId(), entry: null })} />

      <View style={{ gap: space[3] }}>
        <View style={st.row}>
          <ShieldCheck size={16} color={colors.primary} />
          <T v="eyebrow" tint="muted">
            {plural(vault.items.length, 'entrada', 'entradas')} · desbloqueada
          </T>
        </View>
        {vault.items.length === 0 ? (
          <EmptyState title="Tu bóveda está vacía">Guarda aquí usuarios y contraseñas. Se cifran en este teléfono antes de guardarse.</EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState title="Ninguna entrada coincide">Prueba con otra palabra.</EmptyState>
        ) : (
          rows.map(({ item, entry }) =>
            entry ? (
              <VaultRow key={item.id} entry={entry} shown={revealed.has(item.id)} onToggle={() => toggle(item.id)} onCopy={copy} onEdit={() => setEditing({ id: item.id, entry })} />
            ) : (
              <Card key={item.id} style={st.entry}>
                <View style={[st.mono, { backgroundColor: colors.surfaceSunken }]}>
                  <T v="label" tint="muted">
                    ?
                  </T>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="label">No se pudo descifrar esta entrada</T>
                  <T v="small" tint="muted">
                    Los datos están dañados o no son de esta bóveda.
                  </T>
                </View>
                <IconButton label="Borrar la entrada dañada" onPress={() => actions.remove(item.id)}>
                  <Trash2 size={18} color={colors.inkMuted} />
                </IconButton>
              </Card>
            ),
          )
        )}
      </View>

      <Generator onCopy={(p) => copy(p, 'Contraseña')} />

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.entry ? 'Editar entrada' : 'Nueva entrada'}>
        {editing && (
          <EntryForm
            entry={editing.entry}
            onSave={(entry) => {
              const isNew = !editing.entry;
              setEditing(null);
              void save(editing.id, entry, isNew);
            }}
            onDelete={
              editing.entry
                ? () => {
                    void actions.remove(editing.id);
                    setEditing(null);
                  }
                : undefined
            }
          />
        )}
      </Sheet>
    </View>
  );
}

function VaultRow({ entry, shown, onToggle, onCopy, onEdit }: { entry: VaultEntry; shown: boolean; onToggle: () => void; onCopy: (text: string, what: string) => void; onEdit: () => void }) {
  const { colors } = useTheme();
  const name = entry.name || 'Sin nombre';
  const color = noteTag(name);
  return (
    <Card style={{ gap: space[3] }}>
      <View style={st.entry}>
        <View style={[st.mono, { backgroundColor: `${color}2E` }]}>
          <T v="label" style={{ color }}>
            {entry.mono || vaultMono(name)}
          </T>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="label">{name}</T>
          {!!entry.user && (
            <T v="small" tint="muted" numberOfLines={1}>
              {entry.user}
            </T>
          )}
          <T v="body" style={{ fontVariant: ['tabular-nums'], letterSpacing: shown ? 0 : 2 }} accessibilityLabel={shown ? undefined : 'Contraseña oculta'} selectable={shown}>
            {shown ? entry.pass || '(sin contraseña)' : '••••••••••'}
          </T>
          {!!entry.url && (
            <T v="small" tint="subtle" numberOfLines={1}>
              {entry.url}
            </T>
          )}
        </View>
      </View>
      <View style={[st.actions, { borderTopColor: colors.line }]}>
        <IconButton label={`${shown ? 'Ocultar' : 'Mostrar'} la contraseña de «${name}»`} onPress={onToggle}>
          {shown ? <EyeOff size={18} color={colors.inkMuted} /> : <Eye size={18} color={colors.inkMuted} />}
        </IconButton>
        <IconButton label={`Copiar la contraseña de «${name}»`} onPress={() => onCopy(entry.pass, 'Contraseña')} disabled={!entry.pass}>
          <Copy size={18} color={colors.inkMuted} />
        </IconButton>
        {!!entry.user && (
          <Button small variant="ghost" label="Copiar usuario" accessibilityLabel={`Copiar el usuario de «${name}»`} onPress={() => onCopy(entry.user, 'Usuario')} />
        )}
        <View style={{ flex: 1 }} />
        <IconButton label={`Editar «${name}»`} onPress={onEdit}>
          <Pencil size={18} color={colors.inkMuted} />
        </IconButton>
      </View>
    </Card>
  );
}

function EntryForm({ entry, onSave, onDelete }: { entry: VaultEntry | null; onSave: (e: VaultEntry) => void; onDelete?: () => void }) {
  const { colors } = useTheme();
  const [name, setName] = useState(entry?.name ?? '');
  const [user, setUser] = useState(entry?.user ?? '');
  const [pass, setPass] = useState(entry?.pass ?? '');
  const [url, setUrl] = useState(entry?.url ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [show, setShow] = useState(!entry);
  const submit = () => {
    const clean = name.trim();
    if (!clean) return;
    // Iniciales nuevas solo si cambia el nombre (se conservan las de la app anterior).
    const mono = entry && entry.name === clean && entry.mono ? entry.mono : vaultMono(clean);
    onSave({ name: clean, mono, user: user.trim(), pass, url: url.trim() || undefined, note: note.trim() ? note : undefined });
  };
  return (
    <ScrollView style={{ maxHeight: 600 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <Field label="Nombre" value={name} onChangeText={setName} maxLength={ENTRY_LIMITS.name} placeholder="Banco, correo, GitHub…" />
      <Field label="Usuario o correo" value={user} onChangeText={setUser} maxLength={ENTRY_LIMITS.user} autoCapitalize="none" autoCorrect={false} />
      <View style={{ gap: space[2] }}>
        <View style={st.row}>
          <View style={{ flex: 1 }}>
            <Field label="Contraseña" value={pass} onChangeText={setPass} maxLength={ENTRY_LIMITS.pass} secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} />
          </View>
          <IconButton label={show ? 'Ocultar la contraseña' : 'Mostrar la contraseña'} onPress={() => setShow(!show)} style={{ marginTop: space[5] }}>
            {show ? <EyeOff size={18} color={colors.inkMuted} /> : <Eye size={18} color={colors.inkMuted} />}
          </IconButton>
        </View>
        <View style={st.row}>
          <View style={{ flex: 1 }}>
            <StrengthHint password={pass} />
          </View>
          <Button
            small
            variant="secondary"
            label="Generar"
            icon={<Wand2 size={16} color={colors.primary} />}
            onPress={() => {
              setPass(generatePassword(20));
              setShow(true);
            }}
          />
        </View>
      </View>
      <Field label="Web (opcional)" value={url} onChangeText={setUrl} maxLength={ENTRY_LIMITS.url} keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="ejemplo.com" />
      <Field label="Nota (opcional)" value={note} onChangeText={setNote} maxLength={ENTRY_LIMITS.note} multiline />
      <FormActions submitLabel={entry ? 'Guardar' : 'Añadir a la bóveda'} onSubmit={submit} disabled={!name.trim()} onDelete={onDelete} confirm={`Se borrará «${entry?.name || 'esta entrada'}» de la bóveda.`} />
    </ScrollView>
  );
}

const LENGTHS = ['16', '20', '32'] as const;

function Generator({ onCopy }: { onCopy: (password: string) => void }) {
  const { colors } = useTheme();
  const [length, setLength] = useState<(typeof LENGTHS)[number]>('20');
  const [symbols, setSymbols] = useState(true);
  const [value, setValue] = useState(() => generatePassword(20));
  const regen = (len = length, sym = symbols) => setValue(generatePassword(Number(len), { symbols: sym }));
  return (
    <Card>
      <View style={st.row}>
        <Wand2 size={16} color={colors.primary} />
        <T v="label" accessibilityRole="header">
          Generador de contraseñas
        </T>
      </View>
      <View style={[st.generated, { backgroundColor: colors.surfaceSunken }]}>
        <T v="body" selectable accessibilityLabel={`Contraseña generada: ${value}`} accessibilityLiveRegion="polite" style={{ fontFamily: fonts.medium, fontVariant: ['tabular-nums'] }}>
          {value}
        </T>
      </View>
      <Segmented
        label="Longitud en caracteres"
        value={length}
        onChange={(v) => {
          setLength(v);
          regen(v);
        }}
        options={LENGTHS.map((l) => ({ value: l, label: `${l} caracteres`, a11yLabel: `${l} caracteres` }))}
      />
      <View style={st.row}>
        <T v="body" style={{ flex: 1 }}>
          Incluir símbolos
        </T>
        <Toggle
          label="Incluir símbolos"
          value={symbols}
          onChange={(v) => {
            setSymbols(v);
            regen(length, v);
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <Button small variant="secondary" label="Otra" icon={<RefreshCw size={16} color={colors.primary} />} onPress={() => regen()} />
        <Button small label="Copiar" icon={<Copy size={16} color={colors.onPrimary} />} onPress={() => onCopy(value)} />
      </View>
    </Card>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  lockHead: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  lockIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  warning: { flexDirection: 'row', gap: space[2], borderWidth: 1, borderRadius: radius.md, padding: space[3] },
  bar: { width: 22, height: 4, borderRadius: 2 },
  search: { flexDirection: 'row', alignItems: 'center', gap: space[2], borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space[3] },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  mono: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space[1], borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space[2], marginBottom: -space[2] },
  generated: { borderRadius: radius.md, padding: space[3] },
});
