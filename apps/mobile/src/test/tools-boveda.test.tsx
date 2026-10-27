import { applyVaultOp, fromB64, toB64, VAULT_CHECK_TEXT, vaultSecureOf, type LegacyData, type VaultEntry, type VaultItem, type VaultSecure } from '@dyc/core';
import { act, cleanup, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { AppState, Share } from 'react-native';
import { auth } from '../lib/api';
import { queryClient } from '../lib/queryClient';
import { createVault, decryptEntry, encryptEntry, unlockVault } from '../lib/vaultCrypto';
import { fakeFetch, profile, tokens } from './fakeApi';

// Bóveda nativa en el móvil: el mismo cifrado que la web (se comprueba contra
// Web Crypto de Node), huella o Face ID tras la primera apertura y bloqueo al
// salir de la app.

// Web Crypto de Node, como el del navegador.
const { webcrypto } = require('node:crypto') as { webcrypto: Crypto };
const reset = () => (SecureStore as unknown as { __reset: () => void }).__reset();
const subtle = webcrypto.subtle;
const enc = new TextEncoder();
const MASTER = 'frase larga de prueba';

// ---------- La web, con Web Crypto (como apps/web/src/lib/vaultCrypto.ts) ----------

async function webKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function webSeal(key: CryptoKey, text: string, aad: string) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, enc.encode(text));
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}
async function webVault(password: string, entries: Array<[string, VaultEntry]>, iterations = 600_000): Promise<VaultSecure> {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const key = await webKey(password, salt, iterations);
  const items: VaultItem[] = [];
  for (const [id, e] of entries) items.push({ id, ...(await webSeal(key, JSON.stringify(e), `item:${id}`)) });
  return { v: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toB64(salt) }, check: await webSeal(key, VAULT_CHECK_TEXT, 'check'), items };
}
async function webOpen(vault: VaultSecure, password: string, item: VaultItem) {
  const key = await webKey(password, fromB64(vault.kdf.salt), vault.kdf.iterations);
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(item.iv), additionalData: enc.encode(`item:${item.id}`) }, key, fromB64(item.ct));
  return JSON.parse(new TextDecoder().decode(plain)) as VaultEntry;
}

const GITHUB: VaultEntry = { name: 'GitHub', mono: 'GI', user: 'ana@example.com', pass: 'clave-ñandú-1' };
const BANCO: VaultEntry = { name: 'Banco Sol', mono: 'BS', user: 'ana', pass: 'otra', url: 'banco.example', note: 'Tarjeta azul' };

describe('cifrado de la Bóveda en el móvil', () => {
  it('abre lo que cifra la web y la web abre lo que cifra el móvil', async () => {
    const vault = await webVault(MASTER, [['g1', GITHUB]], 1000);
    const key = await unlockVault(vault, MASTER);
    expect(decryptEntry(key, vault.items[0])).toEqual(GITHUB);
    const item = encryptEntry(key, 'b1', BANCO);
    expect(await webOpen(vault, MASTER, item)).toEqual(BANCO);
    await expect(unlockVault(vault, 'otra contraseña')).rejects.toThrow('La contraseña maestra no es correcta.');
    // Un cifrado no se puede mover a otra entrada (el id va autenticado).
    expect(() => decryptEntry(key, { ...item, id: 'otro' })).toThrow('No se pudo descifrar esta entrada');
  });

  it('una bóveda creada en el móvil la abre la web', async () => {
    const { vault, key } = await createVault(MASTER);
    const item = encryptEntry(key, 'g1', GITHUB);
    expect(vaultSecureOf({ vaultSecure: { ...vault, items: [item] } })).not.toBeNull();
    expect(await webOpen(vault, MASTER, item)).toEqual(GITHUB);
  });
});

// ---------- Pantalla ----------

function fakeVaultApi(initial: LegacyData) {
  let doc = initial as Record<string, unknown>;
  const item = (url: URL) => decodeURIComponent(url.pathname.split('/').pop() ?? '');
  const api = fakeFetch({
    'GET /api/v2/profile': () => ({ profile: profile() }),
    'GET /api/v2/modules': () => ({ data: doc, updatedAt: '2026-10-24T10:00:00.000Z' }),
    'PUT /api/v2/modules/vaultSecure': (b) => {
      doc = applyVaultOp(doc, { type: 'create', vault: b as VaultSecure });
      return { value: b, updatedAt: 'x' };
    },
    'POST /api/v2/modules/vaultSecure/items': (b) => {
      doc = applyVaultOp(doc, { type: 'add', item: (b as { item: VaultItem }).item });
      return [201, { item: (b as { item: VaultItem }).item, updatedAt: 'x' }];
    },
    'PUT /api/v2/modules/vaultSecure/items/:id': (b, url) => {
      doc = applyVaultOp(doc, { type: 'update', item: { id: item(url), ...(b as { iv: string; ct: string }) } });
      return { item: b, updatedAt: 'x' };
    },
    'DELETE /api/v2/modules/vaultSecure/items/:id': (_b, url) => {
      doc = applyVaultOp(doc, { type: 'remove', id: item(url) });
      return { ok: true, updatedAt: 'x' };
    },
  });
  return { ...api, vault: () => vaultSecureOf(doc) };
}

async function open() {
  renderRouter('./src/app', { initialUrl: '/boveda' });
  expect((await screen.findAllByText('Bóveda'))[0]).toBeOnTheScreen();
}

describe('Bóveda en el móvil', () => {
  let shared: VaultSecure;
  beforeAll(async () => {
    shared = await webVault(MASTER, [
      ['g1', GITHUB],
      ['b1', BANCO],
    ]);
    reset();
    await auth.signIn(tokens());
    fakeVaultApi({} as LegacyData);
    await open();
    cleanup();
    queryClient.clear();
  }, 120_000);

  beforeEach(async () => {
    queryClient.clear();
    reset();
    await auth.signIn(tokens());
  });
  afterEach(() => jest.restoreAllMocks());

  it('se crea en el teléfono con contraseña maestra y aviso, y queda abierta', async () => {
    const api = fakeVaultApi({} as LegacyData);
    await open();
    expect(await screen.findByText('Crea tu bóveda')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Contraseña maestra'), MASTER);
    fireEvent.changeText(screen.getByLabelText('Repite la contraseña maestra'), 'otra cosa');
    expect(screen.getByText('Las dos contraseñas no coinciden.')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Repite la contraseña maestra'), MASTER);
    // Sin aceptar el aviso no se puede crear.
    expect(screen.getByRole('button', { name: 'Crear la bóveda' })).toBeDisabled();
    fireEvent(screen.getByRole('switch', { name: 'Entiendo que, si la olvido, pierdo las entradas' }), 'valueChange', true);
    fireEvent.press(screen.getByRole('button', { name: 'Crear la bóveda' }));
    expect(await screen.findByText('Tu bóveda está vacía', {}, { timeout: 15_000 })).toBeOnTheScreen();
    const created = api.vault()!;
    expect(created.kdf.iterations).toBe(600_000);
    // La clave quedó en el llavero para la huella o Face ID, nunca la contraseña.
    expect(await SecureStore.getItemAsync('dyc.vault.key.salt')).toBe(created.kdf.salt);
    expect(await SecureStore.getItemAsync('dyc.vault.key')).not.toContain(MASTER);
  }, 60_000);

  it('abre con la contraseña la bóveda de la web, muestra, añade y se bloquea al salir de la app', async () => {
    const appState = jest.spyOn(AppState, 'addEventListener');
    const api = fakeVaultApi({ vaultSecure: shared } as unknown as LegacyData);
    await open();
    expect(await screen.findByText('Bóveda bloqueada')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Contraseña maestra'), 'no es esta');
    fireEvent.press(screen.getByRole('button', { name: 'Desbloquear' }));
    expect(await screen.findByText('La contraseña maestra no es correcta.', {}, { timeout: 15_000 })).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Contraseña maestra'), MASTER);
    fireEvent(screen.getByRole('switch', { name: 'Abrir con huella o Face ID la próxima vez' }), 'valueChange', false);
    fireEvent.press(screen.getByRole('button', { name: 'Desbloquear' }));
    expect(await screen.findByText('2 entradas · desbloqueada', {}, { timeout: 15_000 })).toBeOnTheScreen();
    expect(await SecureStore.getItemAsync('dyc.vault.key')).toBeNull();

    // Por nombre, con la contraseña oculta hasta pedirla.
    const names = screen.getAllByText(/^(Banco Sol|GitHub)$/).map((n) => n.props.children);
    expect(names).toEqual(['Banco Sol', 'GitHub']);
    expect(screen.queryByText('clave-ñandú-1')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Mostrar la contraseña de «GitHub»' }));
    expect(screen.getByText('clave-ñandú-1')).toBeOnTheScreen();
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    fireEvent.press(screen.getByRole('button', { name: 'Copiar la contraseña de «GitHub»' }));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ message: 'clave-ñandú-1' }));

    fireEvent.changeText(screen.getByLabelText('Buscar en la bóveda'), 'banco');
    expect(screen.queryByText('GitHub')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Buscar en la bóveda'), '');

    fireEvent.press(screen.getByRole('button', { name: 'Nueva entrada' }));
    fireEvent.changeText(await screen.findByLabelText('Nombre'), 'Correo');
    fireEvent.changeText(screen.getByLabelText('Usuario o correo'), ' ana@correo.example ');
    fireEvent.press(screen.getByRole('button', { name: 'Generar' }));
    fireEvent.press(screen.getByRole('button', { name: 'Añadir a la bóveda' }));
    await waitFor(() => expect(api.vault()?.items).toHaveLength(3));
    const added = api.vault()!.items[2];
    const plain = await webOpen(shared, MASTER, added);
    expect(plain).toMatchObject({ name: 'Correo', mono: 'CO', user: 'ana@correo.example' });
    expect(plain.pass).toHaveLength(20);
    expect(await screen.findByText('3 entradas · desbloqueada')).toBeOnTheScreen();

    // Al pasar la app a segundo plano se bloquea.
    const listener = appState.mock.calls.filter(([t]) => t === 'change').at(-1)![1];
    act(() => listener('background'));
    expect(await screen.findByText('Bóveda bloqueada')).toBeOnTheScreen();
  }, 90_000);

  it('tras la primera vez se abre con la huella o Face ID, sin la contraseña', async () => {
    const key = await unlockVault(shared, MASTER);
    await SecureStore.setItemAsync('dyc.vault.key', toB64(key));
    await SecureStore.setItemAsync('dyc.vault.key.salt', shared.kdf.salt);
    fakeVaultApi({ vaultSecure: shared } as unknown as LegacyData);
    await open();
    expect(await screen.findByText('2 entradas · desbloqueada')).toBeOnTheScreen();
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('dyc.vault.key', expect.objectContaining({ requireAuthentication: true }));
  }, 60_000);

  it('una clave guardada de otra bóveda no sirve: se pide la contraseña', async () => {
    const other = await createVault('otra frase distinta', 1000);
    await SecureStore.setItemAsync('dyc.vault.key', toB64(other.key));
    await SecureStore.setItemAsync('dyc.vault.key.salt', shared.kdf.salt);
    fakeVaultApi({ vaultSecure: shared } as unknown as LegacyData);
    await open();
    expect(await screen.findByText('Bóveda bloqueada')).toBeOnTheScreen();
    await act(async () => {});
    expect(screen.queryByText(/desbloqueada/)).toBeNull();
  });
});
