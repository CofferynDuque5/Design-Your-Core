import { addDays, localDayKey, periodReminder, shortDay, utcDayKey, type LegacyData } from '@dyc/core';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { auth } from '../lib/api';
import { queryClient } from '../lib/queryClient';
import { fakeModules, tokens, USER, type Handler } from './fakeApi';

// Herramientas de la tanda 3 en el móvil: Finanzas, Metas, Mascotas, Ciclo
// (y sus marcas en el Calendario), Ejercicio, Sueño, Diario y Rutina, con el
// enrutador real y una API falsa que aplica cada cambio como el servidor.

const reset = () => (SecureStore as unknown as { __reset: () => void }).__reset();
// Días como la app anterior: UTC en Finanzas, Ejercicio, Sueño, Diario, Rutina
// y Mascotas; local en Metas, Ciclo y Calendario.
const utc = utcDayKey();
const local = localDayKey(new Date());

function legacyDoc(): LegacyData {
  return {
    transactions: [
      { id: 'x1', date: utc, amount: 1200, type: 'income', category: 'Sueldo', note: '' },
      { id: 'x2', date: utc, amount: 45.5, type: 'expense', category: 'Comida', note: 'Mercado' },
      { id: 'x3', date: '2020-01-15', amount: 30, type: 'expense', category: 'Ocio', note: 'Cine' },
    ],
    goals: [
      { id: 'g1', title: 'Publicar 8 videos', target: 8, current: 7, unit: 'videos', deadline: addDays(local, 3), category: 'creador', done: false },
      { id: 'g2', title: 'Leer 12 libros', target: 12, current: 12, unit: 'libros', deadline: '', category: 'personal', done: true },
    ],
    pets: [{ id: 'pet1', name: 'Luna', species: 'cat', note: '3 años' }],
    petCares: [
      { id: 'pc1', petId: 'pet1', kind: 'comida', title: 'Darle de comer', time: '08:00', days: '1234567', sound: true, enabled: true, lastDone: '' },
      { id: 'pc2', petId: 'pet1', kind: 'vet', title: 'Vacuna', time: '', days: '1', sound: true, enabled: false, lastDone: '' },
    ],
    workouts: [{ id: 'w1', date: '2026-09-20', plan: 'Core express', minutes: 15 }],
    sleep: [{ id: 'z1', date: '2026-09-20', bedtime: '23:30', waketime: '07:15', quality: 4, note: '' }],
    journal: [{ id: 'j1', date: '2026-09-19', mood: '😄', gratitude: '', note: 'Buen día' }],
    routines: [{ id: 'rt1', title: 'Tomar vitaminas', time: '08:00', days: '1234567', icon: 'bell', sound: true, enabled: true }],
    meals: [],
    dayLog: { dateKey: '2020-01-01', water: 5, waterGoal: 8 },
    reminders: [],
  } as unknown as LegacyData;
}

const setup = (over: Record<string, Handler> = {}, doc = legacyDoc()) => fakeModules(doc, over);
type Api = ReturnType<typeof setup>;
const writes = (api: Api) => api.calls.filter((c) => c.method !== 'GET');
async function waitForWrite(api: Api, method: string, path: string | RegExp, count = 1) {
  const match = (c: { method: string; path: string }) => c.method === method && (typeof path === 'string' ? c.path === path : path.test(c.path));
  await waitFor(() => expect(writes(api).filter(match).length).toBeGreaterThanOrEqual(count));
  return writes(api).filter(match).at(-1)!;
}
const itemOf = (c: { body: unknown }) => (c.body as { item: Record<string, unknown> }).item;
const switchValue = (name: string) => screen.getByRole('switch', { name }).props.value;

async function open(path: string, marker: string | RegExp) {
  renderRouter('./src/app', { initialUrl: path });
  expect((await screen.findAllByText(marker))[0]).toBeOnTheScreen();
}

describe('herramientas de la tanda 3 en el móvil', () => {
  beforeEach(async () => {
    queryClient.clear();
    reset();
    await auth.signIn(tokens());
  });
  afterEach(() => jest.restoreAllMocks());

  it('Finanzas: resumen del mes, presupuesto, añadir y editar movimientos y borrar con deshacer', async () => {
    const api = setup();
    await open('/finanzas', 'Balance del mes');
    expect(screen.getByLabelText('Balance del mes: 1154,5')).toBeOnTheScreen();
    expect(screen.getByLabelText('Ingresos: 1200')).toBeOnTheScreen();
    expect(screen.getByLabelText('Gastos: 45,5')).toBeOnTheScreen();
    // El movimiento de otro mes no cuenta.
    expect(screen.queryByText('Cine', { exact: false })).toBeNull();
    expect(screen.getByRole('progressbar', { name: 'Comida: 100 % de los gastos' })).toBeOnTheScreen();

    // Presupuesto: objeto `budget` con PATCH.
    fireEvent.press(screen.getByRole('button', { name: 'Definir un presupuesto' }));
    fireEvent.changeText(await screen.findByLabelText('Cuánto quieres gastar al mes'), '500');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/budget')).body).toEqual({ monthly: 500 });
    expect(await screen.findByRole('progressbar', { name: 'Presupuesto gastado' })).toHaveAccessibilityValue({ now: 9 });
    expect(screen.getByText(/Quedan 454,5/)).toBeOnTheScreen();

    // Nuevo gasto: monto con coma, siempre en positivo, fecha en UTC.
    fireEvent.press(screen.getByRole('button', { name: 'Nuevo movimiento' }));
    fireEvent.changeText(await screen.findByLabelText('Monto'), '12,3O');
    expect(screen.getByText('Escribe un monto mayor que 0, con hasta dos decimales (12,50).')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Añadir movimiento' })).toBeDisabled();
    fireEvent.changeText(screen.getByLabelText('Monto'), '12,30');
    fireEvent.press(screen.getByRole('radio', { name: 'Transporte' }));
    fireEvent.changeText(screen.getByLabelText('Nota (opcional)'), ' Metro ');
    fireEvent.press(screen.getByRole('button', { name: 'Añadir movimiento' }));
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/transactions'))).toEqual({ id: expect.any(String), type: 'expense', amount: 12.3, category: 'Transporte', note: 'Metro', date: utc });
    expect(await screen.findByRole('button', { name: 'Editar: Gasto de 12,3 en Transporte (Metro)' })).toBeOnTheScreen();

    // Editar (la app anterior no dejaba): pasar a ingreso cambia las categorías.
    fireEvent.press(screen.getByRole('button', { name: 'Editar: Gasto de 45,5 en Comida (Mercado)' }));
    fireEvent.press(await screen.findByRole('radio', { name: 'Ingreso' }));
    expect(screen.queryByRole('radio', { name: 'Comida' })).toBeNull();
    fireEvent.press(screen.getByRole('radio', { name: 'Regalo' }));
    fireEvent.press(screen.getByRole('button', { name: 'Día anterior' }));
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/transactions/x2')).body).toEqual({ type: 'income', amount: 45.5, category: 'Regalo', note: 'Mercado', date: addDays(utc, -1) });

    // Borrar se deshace desde el aviso y vuelve a su sitio.
    const order = (api.doc().transactions ?? []).map((t) => t.id);
    fireEvent.press(await screen.findByRole('button', { name: 'Borrar: Ingreso de 1200 en Sueldo' }));
    await waitForWrite(api, 'DELETE', '/api/v2/modules/transactions/x1');
    expect(await screen.findByText('Movimiento eliminado.')).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Deshacer' })));
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/transactions', 2))).toEqual({ id: 'x1', date: utc, amount: 1200, type: 'income', category: 'Sueldo', note: '' });
    expect((await waitForWrite(api, 'PUT', '/api/v2/modules/transactions/order')).body).toEqual({ ids: order });
    await waitFor(() => expect(api.doc().transactions?.map((t) => t.id)).toEqual(order));
  });

  it('Finanzas: si la API falla, el presupuesto se deshace y avisa', async () => {
    const api = setup({ 'PATCH /api/v2/modules/:key': () => [500, { error: 'No se pudo guardar.' }] });
    await open('/finanzas', 'Balance del mes');
    fireEvent.press(screen.getByRole('button', { name: 'Definir un presupuesto' }));
    fireEvent.changeText(await screen.findByLabelText('Cuánto quieres gastar al mes'), '300');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    await waitForWrite(api, 'PATCH', '/api/v2/modules/budget');
    expect(await screen.findByText('No se pudo guardar.')).toBeOnTheScreen();
    expect(await screen.findByRole('button', { name: 'Definir un presupuesto' })).toBeOnTheScreen();
    expect(screen.queryByRole('progressbar', { name: 'Presupuesto gastado' })).toBeNull();
  });

  it('Metas: sumar hasta lograrla, desmarcar, filtrar, crear con fecha límite y borrar', async () => {
    const api = setup();
    await open('/metas', 'Publicar 8 videos');
    expect(screen.getByLabelText('Logradas: 1/2')).toBeOnTheScreen();
    expect(screen.getByLabelText('En curso: 1')).toBeOnTheScreen();
    expect(screen.getByLabelText(`Próxima fecha límite: Publicar 8 videos, ${shortDay(addDays(local, 3))}`)).toBeOnTheScreen();
    expect(screen.getByText(`Faltan 3 días · ${shortDay(addDays(local, 3))}`)).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: 'Progreso de Publicar 8 videos' })).toHaveAccessibilityValue({ now: 88 });

    // Llegar al objetivo la marca como lograda, como la app anterior.
    fireEvent.press(screen.getByRole('button', { name: 'Sumar 1 a «Publicar 8 videos»' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/goals/g1')).body).toEqual({ current: 8, done: true });
    expect(await screen.findByLabelText('Logradas: 2/2')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('checkbox', { name: 'Lograda: «Leer 12 libros»' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/goals/g2')).body).toEqual({ done: false });

    // Una meta nueva toma la categoría del filtro.
    fireEvent.press(screen.getByRole('radio', { name: 'Estudio' }));
    expect(await screen.findByText('Nada por aquí con este filtro')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Nueva meta' }));
    fireEvent.changeText(await screen.findByLabelText('Meta'), ' Aprobar Cálculo ');
    fireEvent.changeText(screen.getByLabelText('Objetivo'), '0');
    expect(screen.getByText('Un número entero, 1 o más.')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Objetivo'), '1');
    fireEvent.press(screen.getByRole('button', { name: 'Poner fecha límite' }));
    fireEvent.press(screen.getByRole('button', { name: 'Día siguiente' }));
    fireEvent.press(screen.getByRole('button', { name: 'Añadir meta' }));
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/goals'))).toEqual({
      id: expect.any(String),
      title: 'Aprobar Cálculo',
      target: 1,
      current: 0,
      unit: '',
      deadline: addDays(local, 1),
      category: 'estudio',
      done: false,
    });
    expect(await screen.findByRole('button', { name: 'Editar «Aprobar Cálculo»' })).toBeOnTheScreen();

    // Borrar pide confirmación.
    fireEvent.press(screen.getByRole('radio', { name: 'Todas' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Editar «Publicar 8 videos»' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Borrar' }));
    expect(screen.getByText('Se borrará «Publicar 8 videos» con su progreso.')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Borrar definitivamente' }));
    await waitForWrite(api, 'DELETE', '/api/v2/modules/goals/g1');
    await waitFor(() => expect(screen.queryByText('Publicar 8 videos')).toBeNull());
  });

  it('Mascotas: hecho hoy en UTC, avisos, cuidados nuevos y borrar la mascota con sus cuidados', async () => {
    const api = setup();
    await open('/mascotas', 'Luna');
    expect(screen.getByText('Gato · 3 años')).toBeOnTheScreen();
    expect(screen.getByLabelText('Mascota: 1')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('checkbox', { name: 'Hecho hoy: «Darle de comer» de Luna' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/petCares/pc1')).body).toEqual({ lastDone: utc });
    expect(await screen.findByText('Hecho hoy · Todos los días')).toBeOnTheScreen();
    expect(screen.getByLabelText('Hecho hoy: 1')).toBeOnTheScreen();

    expect(screen.getByText('Aviso desactivado · Los lunes')).toBeOnTheScreen();
    fireEvent(screen.getByRole('switch', { name: 'Aviso activo: «Vacuna» de Luna' }), 'valueChange', true);
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/petCares/pc2')).body).toEqual({ enabled: true });

    // Cuidado nuevo: sin título se llama como su tipo; la hora se normaliza.
    fireEvent.press(screen.getByRole('button', { name: 'Añadir cuidado para Luna' }));
    expect(await screen.findByText('Nuevo cuidado de Luna')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('radio', { name: 'Paseo' }));
    fireEvent.press(screen.getByRole('checkbox', { name: 'sábado' }));
    fireEvent.press(screen.getByRole('checkbox', { name: 'domingo' }));
    expect(screen.getByText('Entre semana')).toBeOnTheScreen();
    const time = screen.getByLabelText('Hora (opcional)');
    fireEvent.changeText(time, '1830');
    fireEvent(time, 'blur');
    fireEvent.press(screen.getAllByRole('button', { name: 'Añadir cuidado' }).at(-1)!);
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/petCares'))).toEqual({
      id: expect.any(String),
      petId: 'pet1',
      kind: 'paseo',
      title: 'Paseo',
      time: '18:30',
      days: '12345',
      sound: true,
      enabled: true,
      lastDone: '',
    });

    fireEvent.press(await screen.findByRole('button', { name: 'Editar «Darle de comer» de Luna' }));
    fireEvent.changeText(await screen.findByLabelText('Qué hay que hacer'), 'Pienso');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/petCares/pc1', 2)).body).toEqual({ kind: 'comida', title: 'Pienso', time: '08:00', days: '1234567' });

    // Borrar la mascota borra sus cuidados (como el servidor).
    fireEvent.press(await screen.findByRole('button', { name: 'Editar a Luna' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Borrar' }));
    expect(screen.getByText('Se borrará a Luna con 3 cuidados.')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Borrar definitivamente' }));
    await waitForWrite(api, 'DELETE', '/api/v2/modules/pets/pet1');
    expect(await screen.findByText('Aún no tienes mascotas')).toBeOnTheScreen();
    await waitFor(() => expect(api.doc().petCares).toEqual([]));
  });

  it('Ciclo: registra un día con fecha local, estima el próximo periodo, duraciones, aviso y privacidad', async () => {
    const api = setup();
    await open('/ciclo', 'Registra tu primer día de regla');
    expect(screen.getByText(/se guardan en tu cuenta de Design Your Core y se sincronizan/)).toBeOnTheScreen();
    expect(screen.getByText('Es una estimación, no un consejo médico.')).toBeOnTheScreen();
    expect(switchValue('Mostrar Ciclo en el menú y en el Calendario')).toBe(false);
    expect(screen.getByText('Ahora está oculto: llegas aquí desde Más.')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Marcar como día de regla' }));
    const add = itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/period'));
    expect(add).toEqual({ id: expect.any(String), date: local, flow: 'medium', symptoms: '', mood: '', note: '' });
    const path = `/api/v2/modules/period/${add.id as string}`;
    expect(await screen.findByLabelText('Día 1 de tu ciclo actual')).toBeOnTheScreen();
    expect(screen.getByLabelText(`Próximo periodo estimado · ${shortDay(addDays(local, 28))}: En 28 días`)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Hoy, .*: regla, flujo medio$/ })).toBeOnTheScreen();

    // Flujo, síntomas (texto separado por «, »), ánimo y nota que se guarda sola.
    fireEvent.press(screen.getByRole('radio', { name: 'Abundante' }));
    expect((await waitForWrite(api, 'PATCH', path)).body).toEqual({ flow: 'heavy' });
    fireEvent.press(await screen.findByRole('button', { name: 'Cólicos' }));
    expect((await waitForWrite(api, 'PATCH', path, 2)).body).toEqual({ symptoms: 'Cólicos' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cólicos' })).toBeSelected());
    fireEvent.press(await screen.findByRole('button', { name: 'Fatiga' }));
    expect((await waitForWrite(api, 'PATCH', path, 3)).body).toEqual({ symptoms: 'Cólicos, Fatiga' });
    fireEvent.press(screen.getByRole('radio', { name: 'Bien' }));
    expect((await waitForWrite(api, 'PATCH', path, 4)).body).toEqual({ mood: '🙂' });
    fireEvent.changeText(screen.getByLabelText('Nota'), 'Ibuprofeno a las 9');
    expect((await waitForWrite(api, 'PATCH', path, 5)).body).toEqual({ note: 'Ibuprofeno a las 9' });

    // Duraciones: objeto `cycle` con PATCH; la estimación cambia al momento.
    fireEvent.press(screen.getByRole('button', { name: 'Ciclo un día más largo' }));
    fireEvent.press(screen.getByRole('button', { name: 'Ciclo un día más largo' }));
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/cycle')).body).toEqual({ cycleLength: 30, periodLength: 5 });
    expect(await screen.findByText('Duraciones guardadas.')).toBeOnTheScreen();
    expect(await screen.findByLabelText(`Próximo periodo estimado · ${shortDay(addDays(local, 30))}: En 30 días`)).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Recordarme el próximo periodo' }));
    const reminder = itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/reminders'));
    expect(reminder).toEqual({ ...periodReminder('x', addDays(local, 30)), id: expect.any(String) });
    expect(reminder).toMatchObject({ title: '🩸 Posible inicio del periodo', color: '#EC6A9C', icon: 'doc', on: true });

    // Mostrar Ciclo: el mismo ajuste de la cuenta que la web (PATCH /api/v2/me).
    fireEvent(screen.getByRole('switch', { name: 'Mostrar Ciclo en el menú y en el Calendario' }), 'valueChange', true);
    expect((await waitForWrite(api, 'PATCH', '/api/v2/me')).body).toEqual({ showCycle: true });
    expect(await screen.findByText('Ciclo aparece en el menú y en el Calendario.')).toBeOnTheScreen();
    expect(auth.get()).toMatchObject({ user: { showCycle: true } });
    expect(switchValue('Mostrar Ciclo en el menú y en el Calendario')).toBe(true);

    // Mantener pulsado un día lo quita (o lo marca) como día de regla.
    fireEvent(screen.getByRole('button', { name: /^Hoy, / }), 'longPress');
    await waitForWrite(api, 'DELETE', path);
    expect(await screen.findByRole('button', { name: 'Marcar como día de regla' })).toBeOnTheScreen();
  });

  it('Ciclo: si el ajuste no se guarda, vuelve a oculto y avisa', async () => {
    const api = setup({ 'PATCH /api/v2/me': () => [500, { error: 'No se pudo guardar el ajuste.' }] });
    await open('/ciclo', 'Tu ciclo');
    fireEvent(screen.getByRole('switch', { name: 'Mostrar Ciclo en el menú y en el Calendario' }), 'valueChange', true);
    await waitForWrite(api, 'PATCH', '/api/v2/me');
    expect(await screen.findByText('No se pudo guardar el ajuste.')).toBeOnTheScreen();
    await waitFor(() => expect(switchValue('Mostrar Ciclo en el menú y en el Calendario')).toBe(false));
    expect(auth.get()).toMatchObject({ user: { showCycle: false } });
  });

  it('Calendario: con Ciclo activado marca la regla registrada y la prevista y abre Ciclo', async () => {
    await auth.signIn({ ...tokens(), user: { ...USER, showCycle: true } });
    const period = [0, 1].map((i) => ({ id: `pd${i}`, date: addDays(local, -i), flow: 'medium', symptoms: '', mood: '', note: '' }));
    setup({}, { ...legacyDoc(), period } as unknown as LegacyData);
    await open('/calendario', 'Calendario');
    expect(await screen.findByRole('button', { name: /^Hoy, .*regla/ })).toBeOnTheScreen();
    expect(screen.getByText('Regla prevista')).toBeOnTheScreen();
    expect(screen.getByText('Flujo medio')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Ver en Ciclo' }));
    expect(await screen.findByText('Tus últimos periodos')).toBeOnTheScreen();
  });

  it('Calendario: sin Ciclo activado no muestra nada del ciclo', async () => {
    const period = [{ id: 'pd0', date: local, flow: 'medium', symptoms: '', mood: '', note: '' }];
    setup({}, { ...legacyDoc(), period } as unknown as LegacyData);
    await open('/calendario', 'Calendario');
    expect(await screen.findByText('Entreno')).toBeOnTheScreen();
    expect(screen.queryByText('Regla prevista')).toBeNull();
    expect(screen.queryByRole('button', { name: /regla/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ver en Ciclo' })).toBeNull();
  });

  it('Ejercicio: plan hecho hoy (UTC), agendar en la Rutina, registrar, editar y borrar con deshacer', async () => {
    const api = setup();
    await open('/ejercicio', 'Core express');
    fireEvent.press(screen.getByRole('button', { name: 'Hecho hoy: Full body' }));
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/workouts'))).toEqual({ id: expect.any(String), date: utc, plan: 'Full body', minutes: 30 });
    expect(await screen.findByText('Entreno registrado: Full body, 30 min.')).toBeOnTheScreen();
    expect(await screen.findByText('Otra vez')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Agendar Full body en tu Rutina' }));
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/routines'))).toEqual({ id: expect.any(String), title: '🏋️ Entreno: Full body', time: '18:00', days: '1234567', icon: 'bell', sound: true, enabled: true });
    expect(await screen.findByRole('button', { name: 'Ver rutina' })).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Registrar entreno' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Entreno: usar «Estiramientos»' }));
    fireEvent.changeText(screen.getByLabelText('Minutos'), '0');
    expect(screen.getByText('Entre 1 y 1440 minutos.')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Minutos'), '10');
    fireEvent.press(screen.getByRole('button', { name: 'Día anterior' }));
    fireEvent.press(screen.getByRole('button', { name: 'Registrar' }));
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/workouts', 2))).toEqual({ id: expect.any(String), plan: 'Estiramientos', minutes: 10, date: addDays(utc, -1) });

    fireEvent.press(await screen.findByRole('button', { name: 'Editar Core express del 20 sept' }));
    fireEvent.changeText(await screen.findByLabelText('Minutos'), '20');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/workouts/w1')).body).toEqual({ plan: 'Core express', minutes: 20, date: '2026-09-20' });
    expect(await screen.findByText(/20 sept · 20 min/)).toBeOnTheScreen();

    const order = (api.doc().workouts ?? []).map((w) => w.id);
    fireEvent.press(await screen.findByRole('button', { name: 'Borrar Core express del 20 sept' }));
    await waitForWrite(api, 'DELETE', '/api/v2/modules/workouts/w1');
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Deshacer' })));
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/workouts', 3))).toEqual({ id: 'w1', date: '2026-09-20', plan: 'Core express', minutes: 20 });
    expect((await waitForWrite(api, 'PUT', '/api/v2/modules/workouts/order')).body).toEqual({ ids: order });
  });

  it('Sueño: media, gráfica, registrar una noche que cruza la medianoche y borrar con deshacer', async () => {
    const api = setup();
    await open('/sueno', 'Horas por noche');
    expect(screen.getByLabelText('Media de las últimas 1 noche: 7 h 45 min')).toBeOnTheScreen();
    expect(screen.getByLabelText('20 sept: 7 h 45 min, calidad Buena (4/5)')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Registrar noche' }));
    const bed = await screen.findByLabelText('Te acostaste');
    fireEvent.changeText(bed, '030');
    fireEvent(bed, 'blur');
    expect(screen.getByText('Dormiste 6 h 30 min.')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('radio', { name: /^5/ }));
    fireEvent.changeText(screen.getByLabelText('Nota (opcional)'), 'Café tarde');
    fireEvent.press(screen.getByRole('button', { name: 'Registrar' }));
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/sleep'))).toEqual({ id: expect.any(String), date: utc, bedtime: '00:30', waketime: '07:00', quality: 5, note: 'Café tarde' });
    expect(await screen.findByLabelText('Media de las últimas 2 noches: 7 h 8 min')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Borrar la noche del 20 sept' }));
    await waitForWrite(api, 'DELETE', '/api/v2/modules/sleep/z1');
    expect(await screen.findByText('Noche eliminada.')).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Deshacer' })));
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/sleep', 2))).toMatchObject({ id: 'z1', quality: 4 });
  });

  it('Diario: la entrada de hoy se crea con lo primero que eliges, luego se guarda sola; abrir y borrar otras', async () => {
    const api = setup();
    await open('/diario', 'Aún no hay entrada de este día: se crea con lo primero que escribas.');
    expect(screen.getByLabelText('Ánimo más frecuente: genial: 😄')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('radio', { name: 'Genial' }));
    const created = itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/journal'));
    expect(created).toEqual({ id: expect.any(String), date: utc, mood: '😄', gratitude: '', note: '' });
    fireEvent.changeText(screen.getByLabelText('Hoy agradezco…'), 'El sol de la mañana');
    expect((await waitForWrite(api, 'PATCH', `/api/v2/modules/journal/${created.id as string}`)).body).toEqual({ gratitude: 'El sol de la mañana' });
    expect(writes(api).filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(await screen.findByText('Se guarda solo mientras escribes.')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: /^19 sept, ánimo genial/ }));
    expect(await screen.findByDisplayValue('Buen día')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Hoy' })).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Borrar la entrada del 19 sept' }));
    await waitForWrite(api, 'DELETE', '/api/v2/modules/journal/j1');
    expect(await screen.findByText('Entrada del 19 sept eliminada.')).toBeOnTheScreen();
  });

  it('Rutina: agua de hoy desde cero, meta, rutinas por día y comidas', async () => {
    const api = setup();
    await open('/rutina', 'Tomar vitaminas');
    // El registro de agua es de otro día: hoy empieza en 0.
    expect(screen.getByLabelText('0 de 8 vasos')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Quitar un vaso' })).toBeDisabled();
    fireEvent.press(screen.getByRole('button', { name: 'Un vaso' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/dayLog')).body).toEqual({ dateKey: utc, water: 1 });
    expect(await screen.findByLabelText('1 de 8 vasos')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Un vaso más de meta' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/dayLog', 2)).body).toEqual({ waterGoal: 9 });
    expect(await screen.findByLabelText('1 de 9 vasos')).toBeOnTheScreen();

    fireEvent(screen.getByRole('switch', { name: 'Activa: «Tomar vitaminas»' }), 'valueChange', false);
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/routines/rt1')).body).toEqual({ enabled: false });

    fireEvent.press(screen.getByRole('button', { name: 'Nueva rutina' }));
    fireEvent.changeText(await screen.findByLabelText('Qué haces'), 'Leer');
    fireEvent.changeText(screen.getByLabelText('Hora'), '22:00');
    for (const d of ['lunes', 'martes', 'miércoles', 'jueves', 'viernes']) fireEvent.press(screen.getByRole('checkbox', { name: d }));
    fireEvent.press(screen.getByRole('button', { name: 'Añadir rutina' }));
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/routines'))).toEqual({ id: expect.any(String), title: 'Leer', time: '22:00', days: '67', icon: 'bell', sound: true, enabled: true });
    const days = within(screen.getByLabelText('Día de la semana'));
    fireEvent.press(days.getByRole('radio', { name: 'Lunes' }));
    await waitFor(() => expect(screen.queryByText('Leer')).toBeNull());
    expect(screen.getByText('Rutinas del lunes', { exact: false })).toBeOnTheScreen();
    fireEvent.press(days.getByRole('radio', { name: 'Domingo' }));
    expect(await screen.findByText('Leer')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Añadir comida' }));
    fireEvent.press(await screen.findByRole('radio', { name: 'Desayuno' }));
    fireEvent.changeText(screen.getByLabelText('Hora (opcional)'), '7:30');
    fireEvent.changeText(screen.getByLabelText('Qué comiste (opcional)'), 'Avena');
    fireEvent.press(screen.getAllByRole('button', { name: 'Añadir comida' }).at(-1)!);
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/meals'))).toEqual({ id: expect.any(String), label: 'Desayuno', time: '07:30', note: 'Avena', dateKey: utc });
    fireEvent.press(await screen.findByRole('button', { name: 'Editar Desayuno de las 07:30' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Borrar' }));
    fireEvent.press(screen.getByRole('button', { name: 'Borrar definitivamente' }));
    await waitForWrite(api, 'DELETE', /^\/api\/v2\/modules\/meals\//);
    await waitFor(() => expect(screen.queryByText('Avena')).toBeNull());
  });

  it('Rutina: si la API falla, el vaso de agua se deshace y avisa', async () => {
    const api = setup({ 'PATCH /api/v2/modules/:key': () => [500, { error: 'No se pudo guardar.' }] });
    await open('/rutina', 'Agua de hoy');
    fireEvent.press(screen.getByRole('button', { name: 'Un vaso' }));
    await waitForWrite(api, 'PATCH', '/api/v2/modules/dayLog');
    expect(await screen.findByText('No se pudo guardar.')).toBeOnTheScreen();
    expect(await screen.findByLabelText('0 de 8 vasos')).toBeOnTheScreen();
  });
});
