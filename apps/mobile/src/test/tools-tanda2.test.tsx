import type { LegacyData } from '@dyc/core';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { Image, Share } from 'react-native';
import { auth } from '../lib/api';
import { queryClient } from '../lib/queryClient';
import { fakeModules, tokens, type Handler } from './fakeApi';

// Herramientas de la tanda 2 en el móvil: Materias, Proyectos, Roadmaps,
// Cuadernos (lista y cuaderno), Contenido e Ideas, con el enrutador real y
// una API falsa que aplica cada cambio de /api/v2/modules como el servidor.

const reset = () => (SecureStore as unknown as { __reset: () => void }).__reset();
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const now = new Date();
/** Una entrega escrita a mano para hoy («26 sep»): cuenta como de esta semana. */
const todayText = `${now.getDate()} ${MONTHS[now.getMonth()]}`;

function legacyDoc(): LegacyData {
  return {
    subjects: [
      { id: 'm1', name: 'Cálculo', teacher: 'Dra. Morales', room: 'A-201', color: '#4F7CFF', nextClass: 'Lunes 8:00', topics: [
        { id: 't1', name: 'Límites', done: true },
        { id: 't2', name: 'Derivadas', done: false },
      ] },
      { id: 'm2', name: 'Física', teacher: '', room: '', color: '#0FA968', nextClass: '', topics: [] },
    ],
    classes: [{ id: 'c1', day: 3, start: '10:00', end: '11:30', title: 'Cálculo', room: 'A-201', color: '#4F7CFF', subject: 'm1' }],
    projects: [
      { id: 'p1', title: 'Ensayo de Historia', subject: 'Cálculo', deadline: '20 SEP', status: 'curso', color: '#4F7CFF', milestones: [{ id: 'h1', name: 'Borrador', date: '', done: true, nota: 'de la app anterior' }] },
      { id: 'p2', title: 'Maqueta', subject: '', deadline: todayText, status: 'entregado', color: '#E8912A', milestones: [] },
    ],
    roadmaps: [
      { id: 'r1', name: 'Ingeniería', color: '#8B5CF6', steps: [
        { id: 's1', name: 'Álgebra', done: true },
        { id: 's2', name: 'Cálculo I', done: false },
        { id: 's3', name: 'Cálculo II', done: false },
      ] },
    ],
    notebooks: [
      { id: 'n1', title: 'Apuntes de cálculo', category: 'Universidad', subject: 'Cálculo', topic: 'Derivadas', color: '#4F7CFF', emoji: '🧮' },
      { id: 'n2', title: 'Recetas', category: 'General', subject: '', topic: '', color: '#0FA968', emoji: '📗' },
    ],
    noteBoxes: [
      { id: 'b1', notebookId: 'n1', title: 'Regla de la cadena', text: "(f∘g)' = f'(g)·g'\n![pizarra](coreimg:img1) ![otra](coreimg:img2)", color: '#FFF7D6', kind: 'text', lang: '' },
      { id: 'b2', notebookId: 'n1', title: 'derivada.py', text: 'def d(f, x):\n    return f(x)', color: '#1e1e2e', kind: 'code', lang: 'python' },
      { id: 'b3', notebookId: 'n2', title: 'Tortilla', text: 'Huevos y patatas', color: '#DDF3E4', kind: 'text', lang: '' },
    ],
    content: [
      { id: 'v1', title: 'Probé 100 apps', stage: 'guion', platform: 'youtube', notes: '', script: 'Gancho: ¿cuál merece la pena?', due: '12 sep' },
      { id: 'v2', title: 'Mi escritorio', stage: 'publicado', platform: 'tiktok', notes: '', script: '', due: '' },
    ],
    ideas: [
      { id: 'i1', title: 'App de apuntes', body: '', category: 'app', tags: 'estudio, saas' },
      { id: 'i2', title: 'Blog de recetas', body: 'Recetas de 15 minutos', category: 'web', tags: '' },
    ],
  } as unknown as LegacyData;
}

const IMAGE = 'data:image/png;base64,iVBORw0KGgo=';
const setup = (over: Record<string, Handler> = {}) =>
  fakeModules(legacyDoc(), {
    'POST /api/images/fetch': () => ({ images: { img1: IMAGE } }),
    ...over,
  });

type Api = ReturnType<typeof setup>;
const writes = (api: Api) => api.calls.filter((c) => c.method !== 'GET' && !c.path.startsWith('/api/images'));
async function waitForWrite(api: Api, method: string, path: string, count = 1) {
  await waitFor(() => expect(writes(api).filter((c) => c.method === method && c.path === path).length).toBeGreaterThanOrEqual(count));
  return writes(api).filter((c) => c.method === method && c.path === path).at(-1)!;
}
const itemOf = (c: { body: unknown }) => (c.body as { item: Record<string, unknown> }).item;

async function open(path: string, marker: string | RegExp) {
  renderRouter('./src/app', { initialUrl: path });
  expect((await screen.findAllByText(marker))[0]).toBeOnTheScreen();
}

describe('herramientas de la tanda 2 en el móvil', () => {
  beforeEach(async () => {
    // Cada caso empieza con su propio documento, sin datos en caché del anterior.
    queryClient.clear();
    reset();
    // El cargador nativo de imágenes no existe en las pruebas: mide todas como 480×270.
    jest.spyOn(Image, 'getSize').mockImplementation((_uri, ok) => ok?.(480, 270));
    await auth.signIn(tokens());
  });
  afterEach(() => jest.restoreAllMocks());

  it('Materias: temas, clase al horario, crear, renombrar (con sus proyectos) y borrar conservando clases', async () => {
    const api = setup();
    await open('/materias', 'Dra. Morales');
    expect(screen.getByLabelText('Materias: 2')).toBeOnTheScreen();
    expect(screen.getByLabelText('Temas vistos: 1/2')).toBeOnTheScreen();
    expect(screen.getByLabelText('Clase a la semana: 1')).toBeOnTheScreen();
    expect(screen.getByLabelText('Clase: Mié 10:00 · A-201')).toBeOnTheScreen();
    expect(screen.getByText('50 %')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: 'Avance de Cálculo' })).toBeOnTheScreen();

    // Temas: marcar y añadir guardan la lista completa con un PATCH de la materia.
    fireEvent.press(screen.getByRole('button', { name: 'Temas de «Cálculo»: 1 de 2 vistos' }));
    fireEvent.press(await screen.findByRole('checkbox', { name: 'Derivadas' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/subjects/m1')).body).toEqual({
      topics: [
        { id: 't1', name: 'Límites', done: true },
        { id: 't2', name: 'Derivadas', done: true },
      ],
    });
    fireEvent.changeText(screen.getByLabelText('Nuevo tema de «Cálculo»'), ' Integrales ');
    fireEvent.press(screen.getByRole('button', { name: 'Añadir' }));
    const added = (await waitForWrite(api, 'PATCH', '/api/v2/modules/subjects/m1', 2)).body as { topics: unknown[] };
    expect(added.topics).toHaveLength(3);
    expect(added.topics[2]).toEqual({ id: expect.any(String), name: 'Integrales', done: false });

    // «Horario»: una clase el lunes de 8:00 a 9:30 con los datos de la materia.
    fireEvent.press(screen.getByRole('button', { name: 'Añadir «Cálculo» al horario' }));
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/classes'))).toEqual({ id: expect.any(String), day: 1, start: '08:00', end: '09:30', title: 'Cálculo', room: 'A-201', color: '#4F7CFF', subject: 'm1' });
    expect(await screen.findByText('Clase de Cálculo añadida al Horario el lunes de 8:00 a 9:30. Ajústala allí.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ver horario' })).toBeOnTheScreen();

    // Nueva: tercer color de la paleta, como la app anterior.
    fireEvent.press(screen.getByRole('button', { name: 'Nueva materia' }));
    fireEvent.changeText(await screen.findByLabelText('Nombre'), 'Química');
    fireEvent.changeText(screen.getByLabelText('Aula (opcional)'), ' Lab 1 ');
    fireEvent.press(screen.getByRole('button', { name: 'Añadir materia' }));
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/subjects'))).toEqual({ id: expect.any(String), name: 'Química', teacher: '', room: 'Lab 1', nextClass: '', color: '#E8912A', topics: [] });

    // Renombrar actualiza el proyecto que la nombra.
    fireEvent.press(await screen.findByRole('button', { name: 'Editar «Cálculo»' }));
    fireEvent.changeText(await screen.findByLabelText('Nombre'), 'Cálculo I');
    expect(screen.getByText('Su proyecto se actualizará con el nuevo nombre.')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/subjects/m1', 3)).body).toEqual({ name: 'Cálculo I', teacher: 'Dra. Morales', room: 'A-201', nextClass: 'Lunes 8:00', color: '#4F7CFF' });
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/projects/p1')).body).toEqual({ subject: 'Cálculo I' });

    // Borrar pide confirmación y no borra sus clases.
    fireEvent.press(await screen.findByRole('button', { name: 'Editar «Cálculo I»' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Borrar' }));
    expect(screen.getByText('Se borrará «Cálculo I» con 3 temas. Sus clases del Horario y sus proyectos no se borran.')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Borrar definitivamente' }));
    await waitForWrite(api, 'DELETE', '/api/v2/modules/subjects/m1');
    expect(await screen.findByText('Materia eliminada. Sus clases y proyectos se conservan.')).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByText('Dra. Morales')).toBeNull());
    expect(api.doc().classes).toHaveLength(2);
    expect(api.doc().projects?.[0]).toMatchObject({ subject: 'Cálculo I' });
  });

  it('Proyectos: filtro, estado, hitos, materia con su color, entrega «20 SEP» y borrar', async () => {
    const api = setup();
    await open('/proyectos', 'Ensayo de Historia');
    expect(screen.getByLabelText('Proyecto activo: 1')).toBeOnTheScreen();
    expect(screen.getByLabelText('Entrega esta semana: 1')).toBeOnTheScreen();
    expect(screen.getByText('Entrega · 20 SEP')).toBeOnTheScreen();
    expect(screen.getByLabelText('Materia: Cálculo, primera clase Mié 10:00')).toBeOnTheScreen();
    // Sin hitos y entregado: 100 %.
    expect(screen.getByRole('progressbar', { name: 'Progreso de Maqueta' })).toHaveAccessibilityValue({ now: 100 });

    fireEvent.press(within(screen.getByLabelText('Mostrar')).getByRole('radio', { name: 'Entregados' }));
    await waitFor(() => expect(screen.queryByText('Ensayo de Historia')).toBeNull());
    fireEvent.press(within(screen.getByLabelText('Mostrar')).getByRole('radio', { name: 'Todos' }));

    fireEvent.press(within(await screen.findByLabelText('Estado de «Ensayo de Historia»')).getByRole('radio', { name: 'En revisión' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/projects/p1')).body).toEqual({ status: 'revision' });

    // Hitos: se envían solo los campos conocidos (el servidor conserva el resto por id).
    fireEvent.press(screen.getByRole('button', { name: 'Hitos de «Ensayo de Historia»: 1 de 1 hechos' }));
    fireEvent.changeText(await screen.findByLabelText('Nuevo hito de «Ensayo de Historia»'), 'Bibliografía');
    fireEvent.press(screen.getByRole('button', { name: 'Añadir' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/projects/p1', 2)).body).toEqual({
      milestones: [
        { id: 'h1', name: 'Borrador', done: true, date: '' },
        { id: expect.any(String), name: 'Bibliografía', done: false, date: '' },
      ],
    });
    await waitFor(() => expect(api.doc().projects?.[0].milestones[0]).toMatchObject({ nota: 'de la app anterior' }));

    // Editar: elegir la materia copia su color; la entrega es texto libre.
    fireEvent.press(screen.getByRole('button', { name: 'Editar «Maqueta»' }));
    fireEvent.press(await screen.findByRole('radio', { name: 'Física' }));
    fireEvent.changeText(screen.getByLabelText('Entrega (opcional)'), ' 3 oct ');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/projects/p2')).body).toEqual({ title: 'Maqueta', subject: 'Física', deadline: '3 oct', status: 'entregado', color: '#0FA968' });

    // Nuevo: color cíclico de la paleta.
    fireEvent.press(screen.getByRole('button', { name: 'Nuevo proyecto' }));
    fireEvent.changeText(await screen.findByLabelText('Nombre'), 'Póster');
    fireEvent.press(screen.getByRole('button', { name: 'Añadir proyecto' }));
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/projects'))).toEqual({ id: expect.any(String), title: 'Póster', subject: '', deadline: '', status: 'curso', color: '#E8912A', milestones: [] });

    fireEvent.press(await screen.findByRole('button', { name: 'Editar «Póster»' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Borrar' }));
    expect(screen.getByText('Se borrará «Póster».')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.press(screen.getByRole('button', { name: 'Borrar' }));
    fireEvent.press(screen.getByRole('button', { name: 'Borrar definitivamente' }));
    await waitFor(() => expect(writes(api).at(-1)).toMatchObject({ method: 'DELETE' }));
    expect(writes(api).at(-1)?.path).toMatch(/^\/api\/v2\/modules\/projects\//);
  });

  it('si la API falla, el estado del proyecto se deshace y avisa', async () => {
    const api = setup({ 'PATCH /api/v2/modules/:key/:id': () => [500, { error: 'No se pudo guardar.' }] });
    await open('/proyectos', 'Ensayo de Historia');
    const group = () => within(screen.getByLabelText('Estado de «Ensayo de Historia»'));
    fireEvent.press(group().getByRole('radio', { name: 'Entregado' }));
    await waitForWrite(api, 'PATCH', '/api/v2/modules/projects/p1');
    expect(await screen.findByText('No se pudo guardar.')).toBeOnTheScreen();
    await waitFor(() => expect(group().getByRole('radio', { name: 'En curso' })).toBeChecked());
    expect(group().getByRole('radio', { name: 'Entregado' })).not.toBeChecked();
  });

  it('Roadmaps: solo el paso actual se completa, reabrir, añadir y quitar pasos, crear y borrar', async () => {
    const api = setup();
    await open('/roadmaps', 'Ingeniería');
    expect(screen.getByText('1 de 3 completadas')).toBeOnTheScreen();
    expect(screen.getByLabelText('Paso 2: Cálculo I, en curso')).toBeOnTheScreen();
    expect(screen.getByLabelText('Paso 3: Cálculo II, siguiente')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Marcar «Cálculo II» como completada' })).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Marcar «Cálculo I» como completada' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/roadmaps/r1')).body).toEqual({
      steps: [
        { id: 's1', name: 'Álgebra', done: true },
        { id: 's2', name: 'Cálculo I', done: true },
        { id: 's3', name: 'Cálculo II', done: false },
      ],
    });
    expect(await screen.findByLabelText('Paso 3: Cálculo II, en curso')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Reabrir «Álgebra»' }));
    expect(((await waitForWrite(api, 'PATCH', '/api/v2/modules/roadmaps/r1', 2)).body as { steps: unknown[] }).steps[0]).toEqual({ id: 's1', name: 'Álgebra', done: false });
    expect(await screen.findByLabelText('Paso 1: Álgebra, en curso')).toBeOnTheScreen();

    fireEvent.changeText(screen.getByLabelText('Nuevo paso de «Ingeniería»'), 'Estadística');
    fireEvent.press(screen.getByRole('button', { name: 'Añadir' }));
    const withNew = (await waitForWrite(api, 'PATCH', '/api/v2/modules/roadmaps/r1', 3)).body as { steps: Array<{ name: string }> };
    expect(withNew.steps.map((s) => s.name)).toEqual(['Álgebra', 'Cálculo I', 'Cálculo II', 'Estadística']);
    expect(await screen.findByLabelText('Paso 4: Estadística, bloqueada')).toBeOnTheScreen();

    fireEvent.press(await screen.findByRole('button', { name: 'Borrar paso «Cálculo II»' }));
    const without = (await waitForWrite(api, 'PATCH', '/api/v2/modules/roadmaps/r1', 4)).body as { steps: Array<{ name: string }> };
    expect(without.steps.map((s) => s.name)).toEqual(['Álgebra', 'Cálculo I', 'Estadística']);

    fireEvent.press(screen.getByRole('button', { name: 'Nuevo roadmap' }));
    fireEvent.changeText(await screen.findByLabelText('Nombre'), 'Idiomas');
    fireEvent.press(screen.getByRole('radio', { name: 'Verde' }));
    fireEvent.press(screen.getByRole('button', { name: 'Añadir roadmap' }));
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/roadmaps'))).toEqual({ id: expect.any(String), name: 'Idiomas', color: '#0FA968', steps: [] });
    expect(await screen.findByText('Añade materias para empezar tu ruta.')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Editar «Ingeniería»' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Borrar' }));
    expect(screen.getByText('Se borrará «Ingeniería» con 3 pasos.')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Borrar definitivamente' }));
    await waitForWrite(api, 'DELETE', '/api/v2/modules/roadmaps/r1');
    await waitFor(() => expect(screen.queryByText('Ingeniería')).toBeNull());
  });

  it('Cuadernos: filtros en cascada, abrir un cuaderno y crear otro con sugerencias', async () => {
    const api = setup();
    await open('/cuadernos', 'Recetas');
    fireEvent.press(screen.getByRole('radio', { name: 'Categoría: Universidad' }));
    await waitFor(() => expect(screen.queryByText('Recetas')).toBeNull());
    expect(screen.getByRole('radio', { name: 'Materia: Cálculo' })).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(await screen.findByText('Recetas')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Nuevo cuaderno' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Materia: usar «Cálculo»' }));
    fireEvent.press(screen.getByRole('radio', { name: 'Icono 🧠' }));
    fireEvent.press(screen.getByRole('radio', { name: 'Verde' }));
    fireEvent.press(screen.getByRole('button', { name: 'Crear cuaderno' }));
    // Sin título es «Cuaderno» y sin cambiar la categoría, «General», como la app anterior.
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/notebooks'))).toEqual({ id: expect.any(String), title: 'Cuaderno', category: 'General', subject: 'Cálculo', topic: '', color: '#0FA968', emoji: '🧠' });

    fireEvent.press(await screen.findByRole('button', { name: 'Apuntes de cálculo. Universidad, Cálculo, Derivadas. 2 cajitas' }));
    expect(await screen.findByDisplayValue('Regla de la cadena')).toBeOnTheScreen();
  });

  it('Cuaderno: cajitas de texto y código, guardado solo, lenguaje, color, imágenes, copiar y borrar en cascada', async () => {
    const api = setup();
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    await open('/cuadernos/n1', 'Cajitas');
    expect(screen.getByDisplayValue('Regla de la cadena')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('derivada.py')).toBeOnTheScreen();

    // Imágenes de la app anterior: la que está en la nube se ve y la otra se avisa.
    expect(await screen.findByLabelText('Imagen 1 de la cajita')).toBeOnTheScreen();
    expect(screen.getByText('Una imagen solo está en el navegador donde se añadió.')).toBeOnTheScreen();
    expect(api.calls.find((c) => c.path === '/api/images/fetch')?.body).toEqual({ ids: ['img1', 'img2'] });

    // Cajitas nuevas con el formato de la app anterior.
    fireEvent.press(screen.getByRole('button', { name: 'Nueva cajita de texto' }));
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/noteBoxes'))).toEqual({ id: expect.any(String), notebookId: 'n1', title: '', text: '', color: '#FFF7D6', kind: 'text', lang: '' });
    fireEvent.press(screen.getByRole('button', { name: 'Nueva cajita de código' }));
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/noteBoxes', 2))).toEqual({ id: expect.any(String), notebookId: 'n1', title: '', text: '', color: '#1e1e2e', kind: 'code', lang: 'js' });

    // El texto se guarda solo tras una pausa; el título, al salir del campo.
    fireEvent.changeText(screen.getByLabelText('Texto de la cajita «Regla de la cadena»'), 'Derivar fuera y multiplicar por la de dentro.');
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/noteBoxes/b1')).body).toEqual({ text: 'Derivar fuera y multiplicar por la de dentro.' });
    const titleInput = screen.getByLabelText('Título de la cajita «Regla de la cadena»');
    fireEvent.changeText(titleInput, 'Cadena');
    fireEvent(titleInput, 'blur');
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/noteBoxes/b1', 2)).body).toEqual({ title: 'Cadena' });

    fireEvent.press(await screen.findByRole('button', { name: 'Color de la cajita «Cadena»' }));
    fireEvent.press(await screen.findByRole('radio', { name: 'Rosa' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/noteBoxes/b1', 3)).body).toEqual({ color: '#FCE0EC' });

    fireEvent.press(screen.getByRole('button', { name: 'Copiar o compartir la cajita «Cadena»' }));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ message: 'Cadena\nDerivar fuera y multiplicar por la de dentro.' }));

    // El lenguaje se guarda en el mismo campo `lang`.
    fireEvent.press(screen.getByRole('button', { name: 'Lenguaje de la cajita de código «derivada.py»: python' }));
    fireEvent.press(await screen.findByRole('radio', { name: 'ts' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/noteBoxes/b2')).body).toEqual({ lang: 'ts' });

    fireEvent.press(await screen.findByRole('button', { name: 'Borrar la cajita de código «derivada.py»' }));
    await waitForWrite(api, 'DELETE', '/api/v2/modules/noteBoxes/b2');
    expect(await screen.findByText('Cajita eliminada.')).toBeOnTheScreen();

    // Decorar y borrar el cuaderno: sus cajitas se van con él.
    fireEvent.press(screen.getByRole('button', { name: 'Decorar' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Borrar' }));
    expect(screen.getByText('Se borrará «Apuntes de cálculo» con 3 cajitas.')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Borrar definitivamente' }));
    await waitForWrite(api, 'DELETE', '/api/v2/modules/notebooks/n1');
    expect(await screen.findByText('Cuaderno eliminado con sus cajitas.')).toBeOnTheScreen();
    expect(await screen.findByText('Recetas')).toBeOnTheScreen();
    await waitFor(() => expect(api.doc().noteBoxes?.map((b) => b.id)).toEqual(['b3']));
  });

  it('Contenido: añadir, publicar y despublicar, editar la etapa y el guion, y borrar', async () => {
    const api = setup();
    await open('/contenido', 'Probé 100 apps');
    expect(screen.getByLabelText('Guion: 1 video')).toBeOnTheScreen();
    expect(screen.getByLabelText('Grabar: 0 videos')).toBeOnTheScreen();
    expect(screen.getByLabelText('Publicado: 1')).toBeOnTheScreen();
    expect(screen.getByLabelText('En total: 2')).toBeOnTheScreen();

    fireEvent.changeText(screen.getByLabelText('Nuevo video'), 'Tour por mi escritorio');
    fireEvent.press(screen.getByRole('radio', { name: 'Instagram' }));
    fireEvent.press(screen.getByRole('button', { name: 'Añadir' }));
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/content'))).toEqual({ id: expect.any(String), title: 'Tour por mi escritorio', stage: 'idea', platform: 'instagram', notes: '', script: '', due: '' });

    fireEvent.press(screen.getByRole('checkbox', { name: 'Publicado: «Probé 100 apps»' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/content/v1')).body).toEqual({ stage: 'publicado' });
    fireEvent.press(await screen.findByRole('checkbox', { name: 'Publicado: «Mi escritorio»' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/content/v2')).body).toEqual({ stage: 'guion' });

    fireEvent.press(await screen.findByRole('button', { name: 'Editar «Probé 100 apps»' }));
    fireEvent.press(await screen.findByRole('radio', { name: 'Grabar' }));
    fireEvent.changeText(screen.getByDisplayValue('Gancho: ¿cuál merece la pena?'), 'Gancho, 3 apps y cierre.');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/content/v1', 2)).body).toEqual({ title: 'Probé 100 apps', platform: 'youtube', due: '12 sep', stage: 'grabar', script: 'Gancho, 3 apps y cierre.', notes: '' });

    fireEvent.press(await screen.findByRole('button', { name: 'Editar «Mi escritorio»' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Borrar' }));
    expect(screen.getByText('Se borrará «Mi escritorio» con su guion y sus notas.')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Borrar definitivamente' }));
    await waitForWrite(api, 'DELETE', '/api/v2/modules/content/v2');
  });

  it('Ideas: filtrar, añadir con la categoría del filtro, desarrollar, etiquetar, editar y borrar con deshacer', async () => {
    const api = setup();
    await open('/ideas', 'App de apuntes');
    expect(screen.getByText('#estudio')).toBeOnTheScreen();
    expect(screen.getByText('#saas')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('radio', { name: 'Web' }));
    await waitFor(() => expect(screen.queryByText('App de apuntes')).toBeNull());
    fireEvent.changeText(screen.getByLabelText('Nueva idea de Web'), 'Portfolio de fotos');
    fireEvent.press(screen.getByRole('button', { name: 'Añadir' }));
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/ideas'))).toEqual({ id: expect.any(String), title: 'Portfolio de fotos', body: '', category: 'web', tags: '' });

    const body = screen.getByLabelText('Desarrollo de «Blog de recetas»');
    fireEvent.changeText(body, 'Recetas de 15 minutos con vídeo');
    fireEvent(body, 'blur');
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/ideas/i2')).body).toEqual({ body: 'Recetas de 15 minutos con vídeo' });
    const tags = screen.getByLabelText('Etiquetas de «Blog de recetas», separadas por comas');
    fireEvent.changeText(tags, 'cocina, vídeo');
    fireEvent(tags, 'blur');
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/ideas/i2', 2)).body).toEqual({ tags: 'cocina, vídeo' });
    expect(await screen.findByText('#cocina')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Editar «Blog de recetas»' }));
    fireEvent.changeText(await screen.findByLabelText('Idea'), 'Blog de cocina');
    fireEvent.press(within(screen.getAllByLabelText('Categoría').at(-1)!).getByRole('radio', { name: 'Marketing' }));
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/ideas/i2', 3)).body).toEqual({ title: 'Blog de cocina', category: 'marketing' });

    fireEvent.press(screen.getByRole('radio', { name: 'Todas' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Borrar «App de apuntes»' }));
    await waitForWrite(api, 'DELETE', '/api/v2/modules/ideas/i1');
    expect(await screen.findByText('Idea eliminada.')).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Deshacer' })));
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/ideas', 2))).toEqual({ id: 'i1', title: 'App de apuntes', body: '', category: 'app', tags: 'estudio, saas' });
    const order = await waitForWrite(api, 'PUT', '/api/v2/modules/ideas/order');
    expect((order.body as { ids: string[] }).ids.slice(0, 2)).toEqual(['i1', 'i2']);
    await waitFor(() => expect(api.doc().ideas?.map((i) => i.id).slice(0, 2)).toEqual(['i1', 'i2']));
  });

});
