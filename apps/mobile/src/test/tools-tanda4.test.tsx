import { noteDateLabel, noteTag, shortDay, utcDayKey, type LegacyData } from '@dyc/core';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { AccessibilityInfo, Image, Linking } from 'react-native';
import { auth } from '../lib/api';
import { queryClient } from '../lib/queryClient';
import { fakeModules, tokens, type Handler } from './fakeApi';

// Herramientas de la tanda 4 en el móvil: Notas (biblioteca, editor con
// barra de formato y vista previa segura), Trabajo y Respiración, con el
// enrutador real y una API falsa que aplica cada cambio como el servidor.

const reset = () => (SecureStore as unknown as { __reset: () => void }).__reset();
const utc = utcDayKey();
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function legacyDoc(): LegacyData {
  return {
    notes: [
      {
        id: 'n1',
        title: 'Ondas',
        subject: 'Física',
        date: '20 sept',
        tag: '#4F7CFF',
        excerpt: '',
        body: '# Ondas\n**Periodo** y [enlace](https://example.com) <script>alert(1)</script> [malo](javascript:void)\n\n- [x] Repasar\n- [ ] Ejercicios\n\n![Esquema](coreimg:img1)\n\n![](coreimg:perdida)',
        commit: false,
        tags: 'examen, repaso',
        shareId: null,
      },
      { id: 'n2', title: 'Derivadas', subject: 'Cálculo', date: '21 sept', tag: '#0FA968', excerpt: '', body: 'Regla de la cadena', commit: false, tags: 'examen', shareId: null },
      { id: 'n3', title: 'Lista de la compra', subject: '', date: '', tag: '', excerpt: '', body: '', commit: false, tags: '', shareId: null },
    ],
    workItems: [
      { id: 'wk1', title: 'Informe mensual', project: 'p1', status: 'curso', done: false, due: 'Viernes' },
      { id: 'wk2', title: 'Revisar contrato', project: 'p2', status: 'todo', done: false, due: '' },
      { id: 'wk3', title: 'Enviar factura', project: 'p3', status: 'todo', done: true, due: '' },
    ],
    meditations: [
      { id: 'md1', date: utc, minutes: 3, kind: 'respiracion' },
      { id: 'md2', date: '2020-01-10', minutes: 5, kind: 'respiracion' },
    ],
  } as unknown as LegacyData;
}

const setup = (over: Record<string, Handler> = {}, doc = legacyDoc()) =>
  fakeModules(doc, { 'POST /api/images/fetch': (b) => ({ images: (b as { ids: string[] }).ids.includes('img1') ? { img1: PNG } : {} }), ...over });
type Api = ReturnType<typeof setup>;
const writes = (api: Api) => api.calls.filter((c) => c.method !== 'GET' && c.path.startsWith('/api/v2/'));
async function waitForWrite(api: Api, method: string, path: string | RegExp, count = 1) {
  const match = (c: { method: string; path: string }) => c.method === method && (typeof path === 'string' ? c.path === path : path.test(c.path));
  await waitFor(() => expect(writes(api).filter(match).length).toBeGreaterThanOrEqual(count));
  return writes(api).filter(match).at(-1)!;
}
const itemOf = (c: { body: unknown }) => (c.body as { item: Record<string, unknown> }).item;

async function open(path: string, marker: string | RegExp) {
  renderRouter('./src/app', { initialUrl: path });
  expect((await screen.findAllByText(marker))[0]).toBeOnTheScreen();
}

describe('herramientas de la tanda 4 en el móvil', () => {
  beforeEach(async () => {
    queryClient.clear();
    reset();
    await auth.signIn(tokens());
  });
  afterEach(() => jest.restoreAllMocks());

  it('Notas: biblioteca por materia, búsqueda sin tildes y filtro por etiqueta', async () => {
    setup();
    await open('/notas', 'Ondas');
    // Materias en orden alfabético; sin materia es «General».
    const groups = screen.getAllByRole('header').map((h) => h.props.children);
    expect(groups.filter((g) => ['Cálculo', 'Física', 'General'].includes(g))).toEqual(['Cálculo', 'Física', 'General']);
    expect(screen.getAllByLabelText('1 nota', { exact: true })).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Ondas. Ondas Periodo y enlace <script>alert(1)</script> malo Repasar Ejercicios [Esquema] [imagen]' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lista de la compra. Nota vacía' })).toBeOnTheScreen();

    fireEvent.changeText(screen.getByLabelText('Buscar en tus notas'), 'FISICA');
    expect(await screen.findByText('1 nota encontrada')).toBeOnTheScreen();
    expect(screen.queryByText('Derivadas')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Borrar la búsqueda' }));
    fireEvent.press(screen.getByRole('radio', { name: '#examen' }));
    expect(await screen.findByText('2 notas encontradas')).toBeOnTheScreen();
    expect(screen.queryByText('Lista de la compra')).toBeNull();
    // Tocar la etiqueta elegida la quita.
    fireEvent.press(screen.getByRole('radio', { name: '#examen' }));
    expect(await screen.findByText('Lista de la compra')).toBeOnTheScreen();

    fireEvent.changeText(screen.getByLabelText('Buscar en tus notas'), 'nada de nada');
    expect(await screen.findByText('Ninguna nota coincide')).toBeOnTheScreen();
  });

  it('Notas: una nota nueva se abre para escribir y se guarda sola, con barra de formato', async () => {
    const api = setup();
    await open('/notas', 'Ondas');
    fireEvent.press(screen.getByRole('radio', { name: '#repaso' }));
    fireEvent.press(screen.getByRole('button', { name: 'Nueva nota' }));
    const created = itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/notes'));
    // Como la web: título y materia por defecto, y la etiqueta del filtro.
    expect(created).toEqual({ id: expect.any(String), title: 'Nota sin título', subject: 'General', date: noteDateLabel(), tag: noteTag('General'), excerpt: '', body: '', commit: false, tags: 'repaso', shareId: null });
    const path = `/api/v2/modules/notes/${created.id as string}`;

    // Se abre en «Escribir».
    const title = await screen.findByLabelText('Título');
    expect(title).toHaveDisplayValue('Nota sin título');
    expect(screen.getByRole('radio', { name: 'Escribir' })).toBeChecked();
    fireEvent.changeText(title, 'Ondas mecánicas');
    expect((await waitForWrite(api, 'PATCH', path)).body).toEqual({ title: 'Ondas mecánicas' });
    expect(await screen.findByText('Guardado')).toBeOnTheScreen();

    const body = screen.getByLabelText('Texto de la nota, en Markdown');
    fireEvent.changeText(body, 'Amplitud: ');
    expect((await waitForWrite(api, 'PATCH', path, 2)).body).toEqual({ body: 'Amplitud: ' });
    // Sin tocar el texto, la barra escribe al final (con un ejemplo seleccionado).
    fireEvent.press(screen.getByRole('button', { name: 'Negrita' }));
    expect(screen.getByLabelText('Texto de la nota, en Markdown')).toHaveDisplayValue('Amplitud: **texto en negrita**');
    expect((await waitForWrite(api, 'PATCH', path, 3)).body).toEqual({ body: 'Amplitud: **texto en negrita**' });
    // Con una selección, la marca la rodea; los prefijos van por línea.
    fireEvent(screen.getByLabelText('Texto de la nota, en Markdown'), 'selectionChange', { nativeEvent: { selection: { start: 0, end: 8 } } });
    fireEvent.press(screen.getByRole('button', { name: 'Encabezado' }));
    expect(screen.getByLabelText('Texto de la nota, en Markdown')).toHaveDisplayValue('## Amplitud: **texto en negrita**');
    expect((await waitForWrite(api, 'PATCH', path, 4)).body).toEqual({ body: '## Amplitud: **texto en negrita**' });

    // La materia se guarda al salir del campo; las etiquetas, solas.
    const subject = screen.getByLabelText('Materia');
    fireEvent.changeText(subject, '  Física ');
    fireEvent(subject, 'blur');
    expect((await waitForWrite(api, 'PATCH', path, 5)).body).toEqual({ subject: 'Física' });
    fireEvent.changeText(screen.getByLabelText('Etiquetas'), 'repaso, ondas');
    expect((await waitForWrite(api, 'PATCH', path, 6)).body).toEqual({ tags: 'repaso, ondas' });
    await waitFor(() => expect(api.doc().notes?.find((n) => n.id === created.id)).toMatchObject({ title: 'Ondas mecánicas', subject: 'Física', tags: 'repaso, ondas', body: '## Amplitud: **texto en negrita**' }));
  });

  it('Notas: vista previa segura con enlaces, casillas e imágenes de la nube; borrar pide confirmación', async () => {
    const api = setup();
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    jest.spyOn(Image, 'getSize').mockImplementation((_uri, ok) => ok?.(480, 270));
    await open('/notas/n1', 'Guardado');
    // Una nota con texto se abre en la vista previa.
    expect(screen.getByRole('radio', { name: 'Vista previa' })).toBeChecked();
    expect(screen.getByRole('header', { name: 'Ondas' })).toBeOnTheScreen();
    // El HTML se ve como texto: nunca se interpreta.
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeOnTheScreen();
    expect(screen.getByText('Periodo')).toBeOnTheScreen();
    // Solo se enlazan http(s) y mailto.
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent('enlace');
    expect(screen.getByText(/malo/)).toBeOnTheScreen();
    fireEvent.press(links[0]);
    expect(openURL).toHaveBeenCalledWith('https://example.com');
    expect(screen.getByLabelText('Hecho')).toBeOnTheScreen();
    expect(screen.getByLabelText('Por hacer')).toBeOnTheScreen();
    // La imagen de la nube se muestra; la que no está, se explica.
    const img = await screen.findByLabelText('Esquema');
    expect(img.props.source).toEqual({ uri: PNG });
    expect(await screen.findByText('Imagen 2: no disponible. Solo está en el navegador donde se añadió.')).toBeOnTheScreen();
    expect(api.calls.find((c) => c.path === '/api/images/fetch')?.body).toEqual({ ids: ['img1', 'perdida'] });

    fireEvent.press(screen.getByRole('radio', { name: 'Escribir' }));
    expect(screen.getByLabelText('Texto de la nota, en Markdown').props.value).toContain('# Ondas');

    fireEvent.press(screen.getByRole('button', { name: 'Borrar nota' }));
    expect(screen.getByText('Se borrará «Ondas». No se puede deshacer.')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Borrar definitivamente' }));
    await waitForWrite(api, 'DELETE', '/api/v2/modules/notes/n1');
    expect(await screen.findByText('Nota eliminada.')).toBeOnTheScreen();
    expect(await screen.findByText('Derivadas')).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Ondas\./ })).toBeNull());
  });

  it('Notas: si la API falla, la nota guardada vuelve atrás y avisa', async () => {
    const api = setup({ 'PATCH /api/v2/modules/:key/:id': () => [500, { error: 'No se pudo guardar la nota.' }] });
    await open('/notas/n2', 'Guardado');
    fireEvent.changeText(screen.getByLabelText('Título'), 'Integrales');
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/notes/n2')).body).toEqual({ title: 'Integrales' });
    expect(await screen.findByText('No se pudo guardar la nota.')).toBeOnTheScreen();
    // Lo escrito se queda en el campo para no perderlo, pero la biblioteca muestra lo guardado.
    fireEvent.press(screen.getByRole('button', { name: 'Volver a Notas' }));
    expect(await screen.findByRole('button', { name: 'Derivadas. Regla de la cadena' })).toBeOnTheScreen();
    expect(screen.queryByText('Integrales')).toBeNull();
  });

  it('Notas: una nota que ya no existe', async () => {
    setup();
    await open('/notas/borrada', 'Esta nota ya no existe');
    fireEvent.press(screen.getByRole('button', { name: 'Ver tus notas' }));
    expect(await screen.findByText('Ondas')).toBeOnTheScreen();
  });

  it('Trabajo: grupos, añadir con proyecto, marcar, editar y borrar', async () => {
    const api = setup();
    await open('/trabajo', 'Informe mensual');
    expect(screen.getByLabelText('1 de 3 completadas')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'En curso' })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Informe mensual' })).toHaveProp('accessibilityHint', 'Proyecto 1 · Viernes');
    expect(screen.getByRole('checkbox', { name: 'Enviar factura' })).toBeChecked();

    fireEvent.changeText(screen.getByLabelText('Nueva tarea de trabajo'), '  Preparar reunión ');
    fireEvent.press(screen.getByRole('radio', { name: 'Proyecto 3' }));
    fireEvent.press(screen.getByRole('button', { name: 'Añadir' }));
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/workItems'))).toEqual({ id: expect.any(String), title: 'Preparar reunión', project: 'p3', status: 'todo', done: false, due: '' });
    expect(await screen.findByLabelText('1 de 4 completadas')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('checkbox', { name: 'Revisar contrato' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/workItems/wk2')).body).toEqual({ done: true });
    expect(await screen.findByLabelText('2 de 4 completadas')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Editar «Informe mensual»' }));
    fireEvent.changeText(await screen.findByLabelText('Tarea'), 'Informe trimestral');
    fireEvent.press(screen.getAllByRole('radio', { name: 'Proyecto 2' }).at(-1)!);
    fireEvent.press(screen.getByRole('radio', { name: 'Por hacer' }));
    fireEvent.changeText(screen.getByLabelText('Para cuándo (opcional)'), ' Lunes ');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect((await waitForWrite(api, 'PATCH', '/api/v2/modules/workItems/wk1', 1)).body).toEqual({ title: 'Informe trimestral', project: 'p2', status: 'todo', due: 'Lunes' });
    expect(await screen.findByRole('checkbox', { name: 'Informe trimestral' })).toHaveProp('accessibilityHint', 'Proyecto 2 · Lunes');
    await waitFor(() => expect(screen.queryByRole('header', { name: 'En curso' })).toBeNull());

    fireEvent.press(screen.getByRole('button', { name: 'Editar «Enviar factura»' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Borrar' }));
    expect(screen.getByText('Se borrará «Enviar factura».')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Borrar definitivamente' }));
    await waitForWrite(api, 'DELETE', '/api/v2/modules/workItems/wk3');
    await waitFor(() => expect(screen.queryByText('Enviar factura')).toBeNull());
  });

  it('Trabajo: si la API falla, la casilla vuelve atrás y avisa', async () => {
    const api = setup({ 'PATCH /api/v2/modules/:key/:id': () => [500, { error: 'No se pudo guardar.' }] });
    await open('/trabajo', 'Revisar contrato');
    fireEvent.press(screen.getByRole('checkbox', { name: 'Revisar contrato' }));
    await waitForWrite(api, 'PATCH', '/api/v2/modules/workItems/wk2');
    expect(await screen.findByText('No se pudo guardar.')).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Revisar contrato' })).not.toBeChecked());
    expect(screen.getByLabelText('1 de 3 completadas')).toBeOnTheScreen();
  });

  it('Respiración: guía con texto, guarda los minutos completos y borra con deshacer', async () => {
    const api = setup();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    // renderRouter usa relojes falsos: el tiempo avanza con `wait`.
    const wait = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));
    await open('/respiracion', 'Tus minutos de calma');
    expect(await screen.findByLabelText('Esta semana: 3 min')).toBeOnTheScreen();
    expect(screen.getByLabelText('Hoy: 3 min')).toBeOnTheScreen();
    expect(screen.getByLabelText('Sesiones en total: 2')).toBeOnTheScreen();
    expect(screen.getByText('Lista')).toBeOnTheScreen();
    expect(screen.getByRole('timer', { name: 'Tiempo restante: 3 minutos' })).toBeOnTheScreen();

    // Menos de un minuto no se guarda.
    fireEvent.press(screen.getByRole('button', { name: 'Empezar' }));
    expect(await screen.findByText('Inhala')).toBeOnTheScreen();
    await waitFor(() => expect(announce).toHaveBeenCalledWith('Inhala'));
    expect(screen.getByRole('radio', { name: '4-7-8' })).toBeDisabled();
    await wait(5_000);
    expect(screen.getByText('Mantén')).toBeOnTheScreen();
    await waitFor(() => expect(announce).toHaveBeenCalledWith('Mantén'));
    fireEvent.press(screen.getByRole('button', { name: 'Terminar' }));
    expect(await screen.findByText('Sesión terminada. Con menos de un minuto no se guarda.')).toBeOnTheScreen();
    expect(writes(api)).toHaveLength(0);

    // 4-7-8 de 1 minuto: pausar, seguir y terminar solo al llegar al final.
    fireEvent.press(screen.getByRole('radio', { name: '4-7-8' }));
    fireEvent.press(screen.getByRole('radio', { name: '1 minuto' }));
    fireEvent.press(screen.getByRole('button', { name: 'Empezar' }));
    await wait(12_000);
    expect(screen.getByText('Exhala')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Pausar' }));
    expect(await screen.findByText('En pausa.')).toBeOnTheScreen();
    const left = screen.getByRole('timer').props.accessibilityLabel;
    await wait(600_000); // En pausa no corre.
    expect(screen.getByRole('timer')).toHaveProp('accessibilityLabel', left);
    fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    await wait(48_000);
    const added = itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/meditations'));
    expect(added).toEqual({ id: expect.any(String), date: utc, minutes: 1, kind: 'respiracion' });
    expect(await screen.findByText('¡Bien hecho! 1 minuto de respiración.')).toBeOnTheScreen();
    expect(await screen.findByLabelText('Hoy: 4 min')).toBeOnTheScreen();

    const order = (api.doc().meditations ?? []).map((m) => m.id);
    fireEvent.press(screen.getByRole('button', { name: `Borrar la sesión de 5 min del ${shortDay('2020-01-10')}` }));
    await waitForWrite(api, 'DELETE', '/api/v2/modules/meditations/md2');
    expect(await screen.findByText('Sesión eliminada.')).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Deshacer' })));
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/meditations', 2))).toEqual({ id: 'md2', date: '2020-01-10', minutes: 5, kind: 'respiracion' });
    expect((await waitForWrite(api, 'PUT', '/api/v2/modules/meditations/order')).body).toEqual({ ids: order });
  });

  it('Respiración: con «Reducir movimiento» el círculo no se mueve y, si la API falla, la sesión se deshace', async () => {
    const api = setup({ 'POST /api/v2/modules/:key': () => [500, { error: 'No se pudo guardar la sesión.' }] });
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const wait = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));
    await open('/respiracion', 'Tus minutos de calma');
    expect(await screen.findByText(/Con «Reducir movimiento» activado, el círculo no se mueve\./)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Empezar' }));
    await wait(125_000);
    expect(screen.getByRole('timer', { name: /^Tiempo restante: 5\d segundos$/ })).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Terminar' }));
    expect(itemOf(await waitForWrite(api, 'POST', '/api/v2/modules/meditations'))).toMatchObject({ minutes: 2, kind: 'respiracion' });
    expect(await screen.findByText('No se pudo guardar la sesión.')).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByLabelText('Hoy: 3 min')).toBeOnTheScreen());
  });

  it('Hábitos y Perfil: en el tema oscuro, los interruptores llevan el pulgar blanco como las herramientas', async () => {
    await SecureStore.setItemAsync('dyc.theme', JSON.stringify({ preference: 'dark' }));
    setup({ 'GET /api/v2/habits': () => ({ today: utc, habits: [] }) });
    await open('/habitos', 'Mostrar archivados');
    const archived = screen.getByRole('switch', { name: 'Mostrar archivados' });
    expect(archived).toHaveProp('thumbTintColor', '#FFFFFF');
    await act(async () => fireEvent(archived, 'valueChange', true));
    expect(await screen.findByText('No tienes hábitos archivados.')).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: /Perfil/ })));
    expect(await screen.findByRole('switch', { name: 'Recordatorio diario' })).toHaveProp('thumbTintColor', '#FFFFFF');
    expect(screen.getByRole('radio', { name: 'Oscuro' })).toBeChecked();
  });
});
