import type { LegacyData } from '@dyc/core';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';
import { auth } from '../lib/api';
import { queryClient } from '../lib/queryClient';
import { fakeModules, tokens } from './fakeApi';

// Emprendimientos (notas, fotos, archivos y enlaces por proyecto), los
// adjuntos y el historial del Asistente, y las sugerencias con «Hacer» de cada sección.

const reset = () => (SecureStore as unknown as { __reset: () => void }).__reset();
const writes = (api: ReturnType<typeof fakeModules>) => api.calls.filter((c) => c.method !== 'GET');
const GEMINI = 'POST /v1beta/openai/chat/completions';
const KEY = JSON.stringify({ apiKey: 'AIzaClaveDePrueba1234', model: 'gemini-flash-latest', seenPrivacy: true });

const venture = { id: 've1', name: 'Café de barrio', description: 'Café y postres', stage: 'validando', color: '#4F7CFF' };
const items = [
  { id: 'vi1', ventureId: 've1', kind: 'note', title: 'Plan', text: 'Abrir en **marzo**', url: '', ref: '', mime: '', size: 0, date: '2026-10-30' },
  { id: 'vi2', ventureId: 've1', kind: 'file', title: 'presupuesto.csv', text: '', url: '', ref: 'vf_p1', mime: 'text/csv', size: 2048, date: '2026-10-30' },
];

describe('Emprendimientos, Asistente y sugerencias en el móvil', () => {
  beforeEach(async () => {
    reset();
    queryClient.clear();
    await auth.signIn(tokens());
  });
  afterEach(() => {
    jest.restoreAllMocks();
    queryClient.clear();
  });

  it('Emprendimientos: crea uno y guarda notas, fotos, archivos y enlaces', async () => {
    const api = fakeModules({ ventures: [], ventureItems: [] } as unknown as LegacyData);
    renderRouter('./src/app', { initialUrl: '/emprendimientos' });
    expect(await screen.findByText('Guarda aquí cada negocio o proyecto')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Crear el primero' }));
    fireEvent.changeText(await screen.findByLabelText('Nombre'), 'Tienda de velas');
    fireEvent.press(screen.getByRole('radio', { name: 'Validando' }));
    fireEvent.press(screen.getByRole('button', { name: 'Crear emprendimiento' }));
    await waitFor(() => expect(writes(api).at(-1)).toMatchObject({ path: '/api/v2/modules/ventures', body: { item: { name: 'Tienda de velas', stage: 'validando' } } }));
    expect(await screen.findByText('Todavía está vacío')).toBeOnTheScreen();

    // Nota
    fireEvent.press(screen.getByRole('button', { name: 'Añadir nota' }));
    fireEvent.changeText(await screen.findByLabelText('Título'), 'Proveedores');
    fireEvent.changeText(screen.getByLabelText('Texto'), 'Cera de soya');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar nota' }));
    expect(await screen.findByText('Proveedores')).toBeOnTheScreen();

    // Foto: se reduce a JPEG y se sube a la nube antes de guardarla.
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file://vela.png', width: 3000, height: 2000, fileName: 'vela.png', fileSize: 900_000 }] } as never);
    fireEvent.press(screen.getByRole('button', { name: 'Añadir imágenes' }));
    expect(await screen.findByRole('button', { name: 'Ver «vela»' })).toBeOnTheScreen();
    const [imgRef, imgData] = Object.entries(api.files())[0];
    expect(imgRef).toMatch(/^vf_/);
    expect(imgData).toBe('data:image/jpeg;base64,/9j/AAAA');

    // Archivo: demasiado grande se rechaza; uno pequeño se guarda.
    (File as unknown as { contents: Map<string, string> }).contents.set('file://costos.csv', 'vela,30');
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [
        { uri: 'file://video.mp4', name: 'video.mp4', mimeType: 'video/mp4', size: 50_000_000 },
        { uri: 'file://costos.csv', name: 'costos.csv', mimeType: 'text/csv', size: 7 },
      ],
    } as never);
    fireEvent.press(screen.getByRole('button', { name: 'Añadir archivos' }));
    expect(await screen.findByText('costos.csv')).toBeOnTheScreen();
    expect(screen.getByText(/«video\.mp4» pesa .* el máximo es 3 MB\./)).toBeOnTheScreen();
    expect(Object.values(api.files())).toContain('data:text/csv;base64,dmVsYSwzMA==');

    // Enlace: se completa con https://
    fireEvent.press(screen.getByRole('button', { name: 'Añadir enlace' }));
    fireEvent.changeText(await screen.findByLabelText('Enlace'), 'instagram.com/velas');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar enlace' }));
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    fireEvent.press(await screen.findByRole('link', { name: 'instagram.com/velas (se abre en el navegador)' }));
    expect(openURL).toHaveBeenCalledWith('https://instagram.com/velas');
    expect(screen.getByText('1 nota · 1 imagen · 1 archivo · 1 enlace')).toBeOnTheScreen();
  });

  it('Emprendimientos: comparte un archivo y al borrar el emprendimiento borra sus archivos', async () => {
    const api = fakeModules({ ventures: [venture], ventureItems: items } as unknown as LegacyData, {}, { vf_p1: 'data:text/csv;base64,YQ==' });
    renderRouter('./src/app', { initialUrl: '/emprendimientos' });
    fireEvent.press(await screen.findByRole('button', { name: 'Café de barrio. Validando. 1 nota · 1 archivo' }));
    expect(await screen.findByText('Café y postres')).toBeOnTheScreen();
    expect(screen.getByText('marzo')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Abrir o compartir «presupuesto.csv»' }));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/presupuesto.csv', { mimeType: 'text/csv', dialogTitle: 'presupuesto.csv' }));

    fireEvent.press(screen.getByRole('button', { name: 'Editar emprendimiento' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Borrar' }));
    expect(screen.getByText('Se borrará «Café de barrio» con todas sus notas, imágenes, archivos y enlaces.')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Borrar definitivamente' }));
    await waitFor(() => expect(api.calls.some((c) => c.path === '/api/images/delete')).toBe(true));
    expect(api.files()).toEqual({});
    expect(api.doc().ventureItems).toEqual([]);
    expect(await screen.findByText('Guarda aquí cada negocio o proyecto')).toBeOnTheScreen();
  });

  it('Sugerencias: sin clave lleva al Asistente; con clave propone y solo escribe al pulsar «Hacer»', async () => {
    const suggestion = {
      choices: [
        {
          message: {
            content: 'Una idea para hoy.',
            tool_calls: [{ id: 's1', type: 'function', function: { name: 'suggest_change', arguments: JSON.stringify({ title: 'Divide la tarea', reason: 'Es más fácil empezar', action: 'add', key: 'subtasks', fields: JSON.stringify([{ todoId: 't1', title: 'Buscar el número' }]) }) } }],
          },
        },
      ],
    };
    const api = fakeModules({ todos: [{ id: 't1', title: 'Llamar al dentista', done: false }], subtasks: [] } as unknown as LegacyData, { [GEMINI]: () => suggestion });
    renderRouter('./src/app', { initialUrl: '/pendientes' });
    fireEvent.press(await screen.findByRole('button', { name: 'Sugerencias' }));
    expect(await screen.findByRole('button', { name: 'Ir al Asistente' })).toBeOnTheScreen();
    fireEvent.press(screen.UNSAFE_getAllByProps({ accessibilityLabel: 'Cerrar' }).at(-1)!);

    await SecureStore.setItemAsync('dyc.assistant', KEY);
    fireEvent.press(screen.getByRole('button', { name: 'Sugerencias' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Pedir sugerencias' }));
    expect(await screen.findByText('Divide la tarea')).toBeOnTheScreen();
    expect(screen.getByText('Es más fácil empezar')).toBeOnTheScreen();
    const sent = api.calls.find((c) => c.path === '/v1beta/openai/chat/completions')!.body as { messages: Array<{ content: string }> };
    expect(sent.messages[1].content).toContain('Llamar al dentista');
    expect(writes(api).filter((c) => c.path.startsWith('/api/v2/modules'))).toEqual([]);

    fireEvent.press(screen.getByRole('button', { name: 'Hacer: Divide la tarea' }));
    await waitFor(() => expect(writes(api).at(-1)).toMatchObject({ path: '/api/v2/modules/subtasks', body: { item: { todoId: 't1', title: 'Buscar el número', done: false } } }));
    expect(await screen.findByText('Hecho')).toBeOnTheScreen();
  });

  it('Asistente: adjunta una foto, la envía a Gemini y la conversación queda en el Historial', async () => {
    await SecureStore.setItemAsync('dyc.assistant', KEY);
    const api = fakeModules({ chats: [] } as unknown as LegacyData, { [GEMINI]: () => ({ choices: [{ message: { content: 'Es un recibo de 20 €.' } }] }) });
    renderRouter('./src/app', { initialUrl: '/asistente' });
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file://recibo.jpg', width: 800, height: 600, fileName: 'recibo.jpg', fileSize: 1000 }] } as never);
    fireEvent.press(await screen.findByRole('button', { name: 'Adjuntar foto' }));
    expect(await screen.findByRole('button', { name: 'Quitar «recibo.jpg»' })).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Mensaje para el asistente'), '¿Qué es esto?');
    fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Es un recibo de 20 €.')).toBeOnTheScreen();

    const body = api.calls.find((c) => c.path === '/v1beta/openai/chat/completions')!.body as { messages: Array<{ content: unknown }> };
    expect(body.messages.at(-1)!.content).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/AAAA' } },
      { type: 'text', text: '¿Qué es esto?' },
    ]);
    // Se guarda en la cuenta sin los bytes: la foto va aparte, a /api/images.
    await waitFor(() => expect(api.doc().chats).toHaveLength(1));
    const saved = JSON.stringify(api.doc().chats);
    expect(saved).not.toContain('base64');
    expect(Object.keys(api.files())[0]).toMatch(/^ai_/);

    fireEvent.press(screen.getByRole('button', { name: 'Historial' }));
    expect(await screen.findByRole('button', { name: /^¿Qué es esto\?, / })).toBeOnTheScreen();
  });
});
