import { utcDayKey, type LegacyData } from '@dyc/core';
import { act, cleanup, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { auth } from '../lib/api';
import { queryClient } from '../lib/queryClient';
import { fakeModules, tokens, type Handler } from './fakeApi';

// Asistente nativo en el móvil: la clave de Gemini va al llavero del
// teléfono, cada mensaje va directo a Google y las acciones solo se escriben
// al pulsar «Hacer».

const reset = () => (SecureStore as unknown as { __reset: () => void }).__reset();
const today = utcDayKey();
const GEMINI = 'POST /v1beta/openai/chat/completions';

const doc = (): LegacyData => ({ todos: [{ id: 't1', title: 'Llamar al dentista', done: false }], dayLog: { dateKey: today, water: 3, waterGoal: 8 } }) as unknown as LegacyData;

const reply = (message: Record<string, unknown>) => ({ choices: [{ message }] });
const waterCall = reply({ content: 'Te propongo anotarlo.', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'log_water', arguments: '{"glasses":2}' } }] });

const setup = (gemini: Handler) => fakeModules(doc(), { [GEMINI]: gemini });
type Api = ReturnType<typeof setup>;
const geminiCalls = (api: Api) => api.calls.filter((c) => c.path === '/v1beta/openai/chat/completions');

async function open() {
  renderRouter('./src/app', { initialUrl: '/asistente' });
  expect(await screen.findByText('Tu clave de Gemini')).toBeOnTheScreen();
}

async function saveKeyAndAccept() {
  fireEvent.changeText(screen.getByLabelText('Clave de la API de Gemini'), '  AIzaClaveDePrueba1234 ');
  fireEvent.press(screen.getByRole('button', { name: 'Guardar en este teléfono' }));
  expect(await screen.findByText('••••1234')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Entendido' }));
}

describe('Asistente en el móvil', () => {
  beforeAll(async () => {
    reset();
    await auth.signIn(tokens());
    setup(() => waterCall);
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

  it('guarda la clave en el llavero, propone la acción y solo la escribe al pulsar «Hacer»', async () => {
    const api = setup(() => waterCall);
    await open();
    // Sin clave ni aviso leído no se puede escribir.
    expect(screen.getByText('Guarda tu clave de Gemini para empezar.')).toBeOnTheScreen();
    await saveKeyAndAccept();
    expect(JSON.parse((await SecureStore.getItemAsync('dyc.assistant'))!)).toEqual({ apiKey: 'AIzaClaveDePrueba1234', model: 'gemini-flash-latest', seenPrivacy: true });

    fireEvent.changeText(screen.getByLabelText('Mensaje para el asistente'), 'Bebí 2 vasos de agua');
    fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Registrar agua')).toBeOnTheScreen();
    expect(screen.getByText('Te propongo anotarlo.')).toBeOnTheScreen();
    expect(screen.getByText('+2')).toBeOnTheScreen();
    expect(screen.getByText('5')).toBeOnTheScreen();

    // Va directo a Google con la clave; sin el interruptor no lleva datos.
    const [first] = geminiCalls(api);
    expect(first.auth).toBe('Bearer AIzaClaveDePrueba1234');
    const sent = first.body as { model: string; messages: Array<{ role: string; content: string }> };
    expect(sent.model).toBe('gemini-flash-latest');
    expect(sent.messages[0].content).toContain('No tienes acceso a los datos de la persona');
    expect(api.calls.some((c) => c.method === 'PATCH')).toBe(false);
    expect(screen.getByText('Elige «Hacer» o «Descartar» en la acción propuesta para seguir.')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Hacer: Registrar agua' }));
    await waitFor(() => expect(api.calls.find((c) => c.method === 'PATCH' && c.path === '/api/v2/modules/dayLog')?.body).toEqual({ dateKey: today, water: 5 }));
    expect(await screen.findByText('Hecho')).toBeOnTheScreen();
  });

  it('con el resumen activado lo envía, y «Descartar» no escribe nada', async () => {
    const api = setup(() => reply({ content: '', tool_calls: [{ id: 'c2', type: 'function', function: { name: 'add_todo', arguments: '{"title":"Comprar pan"}' } }] }));
    await open();
    await saveKeyAndAccept();
    fireEvent(screen.getByRole('switch', { name: 'Incluir un resumen de mis datos' }), 'valueChange', true);
    fireEvent.press(await screen.findByRole('button', { name: 'Ver exactamente lo que se enviará' }));
    expect(await screen.findByText(/Pendientes por hacer \(1\): Llamar al dentista\./)).toBeOnTheScreen();

    fireEvent.changeText(screen.getByLabelText('Mensaje para el asistente'), 'Añade comprar pan');
    fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Añadir pendiente')).toBeOnTheScreen();
    const sent = geminiCalls(api)[0].body as { messages: Array<{ content: string }> };
    expect(sent.messages[0].content).toContain('Pendientes por hacer (1): Llamar al dentista.');

    fireEvent.press(screen.getByRole('button', { name: 'Descartar: Añadir pendiente' }));
    expect(await screen.findByText('Descartado')).toBeOnTheScreen();
    await act(async () => {});
    expect(api.calls.some((c) => c.method === 'POST' && c.path.startsWith('/api/v2/modules'))).toBe(false);
  });

  it('un error de la clave se explica y el mensaje vuelve al cuadro; «Quitar» la borra del llavero', async () => {
    setup(() => [401, { error: { message: 'API key not valid' } }]);
    await open();
    await saveKeyAndAccept();
    fireEvent.changeText(screen.getByLabelText('Mensaje para el asistente'), 'hola');
    fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText(/Google no aceptó tu clave/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Mensaje para el asistente')).toHaveDisplayValue('hola');

    fireEvent.press(screen.getByRole('button', { name: 'Quitar' }));
    expect(await screen.findByText('Clave quitada de este teléfono.')).toBeOnTheScreen();
    await waitFor(async () => expect(await SecureStore.getItemAsync('dyc.assistant')).toBeNull());
  });
});
