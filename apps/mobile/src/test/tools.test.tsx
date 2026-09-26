import { localDayKey, utcDayKey, type LegacyData } from '@dyc/core';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { Linking } from 'react-native';
import { auth } from '../lib/api';
import { fakeModules, tokens, type Handler } from './fakeApi';

// Herramientas de la app anterior en el móvil: «Más», Agenda, Pendientes,
// Calendario, Horario y Enfoque, con el enrutador real y una API falsa que
// guarda cada llamada a /api/v2/modules.

const reset = () => (SecureStore as unknown as { __reset: () => void }).__reset();
const today = localDayKey(new Date());
const dayNum = Number(today.slice(8));

function legacyDoc(): LegacyData {
  return {
    blocks: [
      { id: 'b1', label: 'Estudiar cálculo', sub: 'Capítulo 3', start: 9, dur: 1.5, kind: 'study' },
      { id: 'b2', label: 'Correr', sub: '', start: 18, dur: 1, kind: 'ex' },
    ],
    tasks: [
      { id: 't1', title: 'Entregar el ensayo', pri: 'alta', time: '10:00', rem: true, done: false, tags: '' },
      { id: 't2', title: 'Comprar pan', pri: 'baja', time: null, rem: false, done: true, tags: '' },
    ],
    todos: [
      { id: 'd1', title: 'Llamar al dentista', done: false },
      { id: 'd2', title: 'Ordenar el escritorio', done: false },
    ],
    subtasks: [{ id: 's1', todoId: 'd2', title: 'Tirar papeles', done: true }],
    reminders: [{ id: 'r1', day: dayNum, title: 'Pagar la luz', when: '09:00', color: '#4F7CFF', icon: 'doc', on: true }],
    classes: [
      { id: 'c1', day: 1, start: '08:00', end: '09:30', title: 'Cálculo', room: 'A-201', color: '#4F7CFF', subject: 'm1' },
      { id: 'c2', day: 3, start: '10:00', end: '11:30', title: 'Física', room: '', color: '#0FA968', subject: '' },
    ],
    subjects: [{ id: 'm1', name: 'Cálculo', teacher: '', room: 'A-201', color: '#4F7CFF', nextClass: '', topics: [] }],
    focus: [
      { id: 'f1', mode: 'focus', seconds: 1500, dateKey: utcDayKey() },
      { id: 'f2', mode: 'short', seconds: 300, dateKey: utcDayKey() },
    ],
    workouts: [{ id: 'w1', date: today, plan: 'Fuerza', minutes: 40 }],
    transactions: [{ id: 'x1', date: today, amount: 12, type: 'expense', category: 'Comida', note: '' }],
  } as unknown as LegacyData;
}

/** API falsa con el documento en memoria: aplica cada cambio como el servidor. */
const setup = (over: Record<string, Handler> = {}) => fakeModules(legacyDoc(), over);

type Api = ReturnType<typeof setup>;
const writes = (api: Api) => api.calls.filter((c) => c.method !== 'GET');
const lastWrite = (api: Api) => writes(api).at(-1);
async function waitForWrite(api: Api, method: string, path: string) {
  await waitFor(() => expect(writes(api).some((c) => c.method === method && c.path === path)).toBe(true));
  return writes(api).filter((c) => c.method === method && c.path === path).at(-1)!;
}

async function open(path: string, marker: string | RegExp) {
  renderRouter('./src/app', { initialUrl: path });
  expect(await screen.findByText(marker)).toBeOnTheScreen();
}

describe('herramientas en el móvil', () => {
  beforeEach(async () => {
    reset();
    await auth.signIn(tokens());
  });
  afterEach(() => jest.restoreAllMocks());

  it('Más agrupa las herramientas con sus cuentas y abre en la web las que faltan', async () => {
    setup();
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await open('/mas', 'Tus herramientas');
    for (const g of ['Organización', 'Estudio y trabajo', 'Conocimiento', 'Vida personal', 'Salud']) expect(await screen.findByText(g)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Agenda, 4 elementos' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Pendientes, 2 por hacer' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Enfoque, 1 sesión' })).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('link', { name: 'Finanzas, 1 movimiento, en la web' }));
    expect(openURL).toHaveBeenCalledWith('https://app.designyourcore.nvcorx.com/finanzas');
    expect(screen.getAllByText('En la web')).toHaveLength(13);
    expect(screen.getByRole('button', { name: 'Materias, 1 materia' })).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Horario, 2 clases' }));
    expect(await screen.findByText('Nueva clase')).toBeOnTheScreen();
  });

  it('Agenda: crea, edita y borra bloques y tareas', async () => {
    const api = setup();
    await open('/agenda', 'Estudiar cálculo');
    expect(screen.getByText('2 bloques · 2 h 30 min planificadas')).toBeOnTheScreen();

    // Nuevo bloque: 10:00, 1 h 30 min, tipo Lectura.
    fireEvent.press(screen.getByRole('button', { name: 'Nuevo bloque' }));
    fireEvent.changeText(await screen.findByLabelText('Nombre'), '  Leer novela ');
    fireEvent.press(screen.getByRole('radio', { name: 'Lectura' }));
    fireEvent.press(screen.getByRole('button', { name: 'Empezar media hora después' }));
    fireEvent.press(screen.getByRole('button', { name: 'Empezar media hora después' }));
    fireEvent.press(screen.getByRole('button', { name: 'Media hora más' }));
    fireEvent.press(screen.getByRole('button', { name: 'Añadir bloque' }));
    const add = await waitForWrite(api, 'POST', '/api/v2/modules/blocks');
    expect((add.body as { item: unknown }).item).toMatchObject({ label: 'Leer novela', sub: '', kind: 'read', start: 10, dur: 1.5 });
    expect(await screen.findByText('Leer novela')).toBeOnTheScreen();

    // Editar un bloque existente.
    fireEvent.press(screen.getByRole('button', { name: 'Editar «Correr», 18:00 a 19:00, Ejercicio' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Media hora más' }));
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/blocks/b2')).body).toMatchObject({ label: 'Correr', start: 18, dur: 1.5, kind: 'ex' });

    // Borrarlo.
    fireEvent.press(await screen.findByRole('button', { name: 'Editar «Correr», 18:00 a 19:30, Ejercicio' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Borrar bloque' }));
    await waitForWrite(api, 'DELETE', '/api/v2/modules/blocks/b2');
    await waitFor(() => expect(screen.queryByText('Correr')).toBeNull());

    // Tareas por prioridad.
    fireEvent.press(screen.getByRole('radio', { name: 'Tareas' }));
    expect(await screen.findByText('Entregar el ensayo')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Nueva tarea'), 'Repasar apuntes');
    fireEvent.press(screen.getByRole('radio', { name: 'Alta' }));
    fireEvent.press(screen.getByRole('button', { name: 'Añadir tarea' }));
    expect(((await waitForWrite(api, 'POST', '/api/v2/modules/tasks')).body as { item: unknown }).item).toMatchObject({ title: 'Repasar apuntes', pri: 'alta', time: null, rem: false, done: false, tags: '' });

    fireEvent.press(screen.getByRole('checkbox', { name: 'Entregar el ensayo' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/tasks/t1')).body).toEqual({ done: true });

    fireEvent.press(screen.getByRole('button', { name: 'Editar «Comprar pan»' }));
    fireEvent.changeText(await screen.findByLabelText('Tarea'), 'Comprar pan integral');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/tasks/t2')).body).toEqual({ title: 'Comprar pan integral', pri: 'baja' });

    fireEvent.press(await screen.findByRole('button', { name: 'Borrar «Comprar pan integral»' }));
    await waitForWrite(api, 'DELETE', '/api/v2/modules/tasks/t2');
  });

  it('Pendientes: añade, marca, reordena, renombra, divide en pasos y borra', async () => {
    const api = setup();
    await open('/pendientes', 'Llamar al dentista');
    expect(screen.getByText('2 por hacer')).toBeOnTheScreen();

    fireEvent.changeText(screen.getByLabelText('Nuevo pendiente'), 'Pagar el alquiler');
    fireEvent.press(screen.getByRole('button', { name: 'Añadir' }));
    expect(((await waitForWrite(api, 'POST', '/api/v2/modules/todos')).body as { item: unknown }).item).toMatchObject({ title: 'Pagar el alquiler', done: false });
    expect(await screen.findByText('3 por hacer')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('checkbox', { name: 'Llamar al dentista' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/todos/d1')).body).toEqual({ done: true });

    // Pasos y opciones.
    fireEvent.press(screen.getByRole('button', { name: 'Pasos y opciones de «Ordenar el escritorio»: 1 de 1 hechos' }));
    fireEvent.changeText(await screen.findByLabelText('Nuevo paso de «Ordenar el escritorio»'), 'Limpiar el teclado');
    fireEvent.press(screen.getByRole('button', { name: 'Añadir paso' }));
    expect(((await waitForWrite(api, 'POST', '/api/v2/modules/subtasks')).body as { item: unknown }).item).toMatchObject({ todoId: 'd2', title: 'Limpiar el teclado', done: false });

    fireEvent.press(screen.getByRole('button', { name: 'Subir «Ordenar el escritorio»' }));
    const order = await waitForWrite(api, 'PUT', '/api/v2/modules/todos/order');
    expect((order.body as { ids: string[] }).ids.slice(0, 2)).toEqual(['d2', 'd1']);

    fireEvent.press(screen.getByRole('button', { name: 'Renombrar «Ordenar el escritorio»' }));
    fireEvent.changeText(await screen.findByLabelText('Nuevo nombre de «Ordenar el escritorio»'), 'Ordenar la mesa');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar nombre' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/todos/d2')).body).toEqual({ title: 'Ordenar la mesa' });

    // El panel sigue abierto tras renombrar.
    fireEvent.press(await screen.findByRole('button', { name: 'Borrar «Ordenar la mesa»' }));
    await waitForWrite(api, 'DELETE', '/api/v2/modules/todos/d2');
    expect(await screen.findByText('Pendiente y subtareas eliminados.')).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByText('Ordenar la mesa')).toBeNull());
  });

  it('si la API falla, el cambio se deshace y avisa', async () => {
    const api = setup({ 'PATCH /api/v2/modules/:key/:id': () => [500, { error: 'No se pudo guardar.' }] });
    await open('/pendientes', 'Llamar al dentista');
    const box = screen.getByRole('checkbox', { name: 'Llamar al dentista' });
    fireEvent.press(box);
    await waitForWrite(api, 'PATCH', '/api/v2/modules/todos/d1');
    expect(await screen.findByText('No se pudo guardar.')).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Llamar al dentista' })).not.toBeChecked());
  });

  it('Calendario: el día elegido muestra sus eventos y marcas; crea, apaga y borra eventos', async () => {
    const api = setup();
    await open('/calendario', 'Pagar la luz');
    expect(screen.getByText('Entreno: Fuerza')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: new RegExp(`^Hoy, .*: 1 evento, entreno$`) })).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Nuevo evento' }));
    fireEvent.changeText(await screen.findByLabelText('Título'), 'Dentista');
    fireEvent.changeText(screen.getByLabelText('Hora o nota (opcional)'), '14:00');
    fireEvent.press(screen.getByRole('radio', { name: 'Violeta' }));
    fireEvent.press(screen.getByRole('button', { name: 'Añadir evento' }));
    const add = await waitForWrite(api, 'POST', '/api/v2/modules/reminders');
    expect((add.body as { item: unknown }).item).toMatchObject({ title: 'Dentista', when: '14:00', day: dayNum, color: '#8B5CF6', icon: 'doc', on: true });
    expect(await screen.findByText('Dentista')).toBeOnTheScreen();

    fireEvent(screen.getByRole('switch', { name: 'Activo: «Pagar la luz»' }), 'valueChange', false);
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/reminders/r1')).body).toEqual({ on: false });

    fireEvent.press(screen.getByRole('button', { name: 'Editar «Pagar la luz»' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Un día después' }));
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    const edit = await waitForWrite(api, 'PATCH', '/api/v2/modules/reminders/r1');
    expect(edit.body).toMatchObject({ title: 'Pagar la luz', when: '09:00', color: '#4F7CFF', day: Math.min(31, dayNum + 1) });

    fireEvent.press(await screen.findByRole('button', { name: 'Borrar «Dentista»' }));
    await waitFor(() => expect(lastWrite(api)).toMatchObject({ method: 'DELETE' }));
    expect(lastWrite(api)?.path).toMatch(/^\/api\/v2\/modules\/reminders\//);

    // Navegar de mes cambia el título.
    fireEvent.press(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(await screen.findByRole('button', { name: 'Volver a hoy' })).toBeOnTheScreen();
  });

  it('Horario: próxima clase, crea, edita y borra clases con horas HH:MM', async () => {
    const api = setup();
    await open('/horario', 'Física');
    expect(screen.getByText(/^(Próxima clase|Clase en curso)$/)).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Nueva clase' }));
    fireEvent.changeText(await screen.findByLabelText('Nombre'), 'Química');
    fireEvent.press(screen.getByRole('radio', { name: 'Viernes' }));
    fireEvent.changeText(screen.getByLabelText('Empieza'), '12:00');
    fireEvent.changeText(screen.getByLabelText('Termina'), '11:00');
    expect(screen.getByText('Debe ser después de la hora de inicio.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Añadir clase' })).toBeDisabled();
    fireEvent.changeText(screen.getByLabelText('Termina'), '1330');
    fireEvent(screen.getByLabelText('Termina'), 'blur');
    fireEvent.changeText(screen.getByLabelText('Aula (opcional)'), 'Lab 2');
    fireEvent.press(screen.getByRole('button', { name: 'Añadir clase' }));
    const add = await waitForWrite(api, 'POST', '/api/v2/modules/classes');
    // Tercera clase: tercer color de la paleta, como la app anterior.
    expect((add.body as { item: unknown }).item).toMatchObject({ title: 'Química', day: 5, start: '12:00', end: '13:30', room: 'Lab 2', color: '#8B5CF6', subject: '' });
    expect(await screen.findByText('Química')).toBeOnTheScreen();

    // Elegir la materia copia su nombre, color y aula.
    fireEvent.press(screen.getByRole('button', { name: 'Física, miércoles de 10:00 a 11:30. Editar' }));
    fireEvent.press(await screen.findByRole('radio', { name: 'Cálculo' }));
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/classes/c2')).body).toMatchObject({ title: 'Cálculo', room: 'A-201', color: '#4F7CFF', subject: 'm1', day: 3 });

    fireEvent.press(await screen.findByRole('button', { name: 'Cálculo, lunes de 08:00 a 09:30, aula A-201. Editar' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Borrar clase' }));
    await waitForWrite(api, 'DELETE', '/api/v2/modules/classes/c1');
  });

  it('Enfoque: cuenta, pausa y guarda la sesión al saltar (lo más reciente primero)', async () => {
    const api = setup();
    await open('/enfoque', 'Últimas sesiones');
    expect(screen.getByRole('timer', { name: 'Tiempo restante: 25 minutos' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Sesiones hoy: 1')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Empezar' }));
    expect(screen.getByRole('radio', { name: 'Descanso corto, 5 minutos' })).toBeDisabled();
    // Con el reloj real: el temporizador se refresca cada 250 ms.
    await waitFor(() => expect(screen.getByRole('timer')).toHaveTextContent('24:58'), { timeout: 6000 });
    fireEvent.press(screen.getByRole('button', { name: 'Pausar' }));
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Saltar' }));
    const add = await waitForWrite(api, 'POST', '/api/v2/modules/focus');
    const saved = (add.body as { item: { mode: string; seconds: number; dateKey: string } }).item;
    expect(saved).toEqual({ id: expect.any(String), mode: 'focus', seconds: expect.any(Number), dateKey: utcDayKey() });
    // Lo que corrió antes de la pausa (unos 2 s), redondeado a segundos.
    expect(saved.seconds).toBeGreaterThanOrEqual(2);
    expect(saved.seconds).toBeLessThanOrEqual(3);
    // Tras saltar un enfoque toca un descanso corto.
    expect(screen.getByRole('radio', { name: 'Descanso corto, 5 minutos' })).toBeChecked();
    expect(screen.getByText('05:00')).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByLabelText('Sesiones hoy: 2')).toBeOnTheScreen());
    // La sesión nueva va primero (menos de un minuto cuenta como 1 min).
    expect(screen.getAllByText(/min · hoy$/).map((t) => t.props.children.join(''))).toEqual(['1 min · hoy', '25 min · hoy', '5 min · hoy']);
  });
});
