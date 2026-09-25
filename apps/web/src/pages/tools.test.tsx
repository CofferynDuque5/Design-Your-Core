import { reorderById, utcDayKey } from '@dyc/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenStore } from '../app/api';
import { AppRoutes, makeQueryClient, Providers } from '../app/App';
import { fakeFetch, legacyDoc, profile, USER, type Handler } from '../test/fakeApi';

// Herramientas de la app anterior (tandas 1 y 2) contra una API falsa.

function renderAt(path: string) {
  const client = makeQueryClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } });
  return render(
    <Providers client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </Providers>,
  );
}

/** API falsa con estado: aplica los cambios al documento como el servidor. */
function withApi(extra: Record<string, Handler> = {}) {
  const doc = legacyDoc() as Record<string, Array<Record<string, unknown>>>;
  const at = '2026-09-25T10:00:00.000Z';
  const parts = (url: URL) => url.pathname.split('/').slice(4);
  return fakeFetch({
    'GET /api/me': () => ({ user: USER }),
    'GET /api/v2/profile': () => ({ profile: profile() }),
    'GET /api/v2/modules': () => ({ data: structuredClone(doc), updatedAt: at }),
    'POST /api/images/fetch': () => ({ images: {} }),
    'POST /api/v2/modules/:key': (b, url) => {
      const [key] = parts(url);
      const item = (b as { item: Record<string, unknown> }).item;
      doc[key] = key === 'focus' ? [item, ...(doc[key] ?? [])] : [...(doc[key] ?? []), item];
      return [201, { item, updatedAt: at }];
    },
    'PUT /api/v2/modules/:key/order': (b, url) => {
      const [key] = parts(url);
      doc[key] = reorderById(doc[key] as Array<{ id: string }>, (b as { ids: string[] }).ids);
      return { ok: true, updatedAt: at };
    },
    'PATCH /api/v2/modules/:key/:id': (b, url) => {
      const [key, id] = parts(url);
      doc[key] = doc[key].map((x) => (x.id === id ? { ...x, ...(b as object) } : x));
      return { item: doc[key].find((x) => x.id === id), updatedAt: at };
    },
    'DELETE /api/v2/modules/:key/:id': (_b, url) => {
      const [key, id] = parts(url);
      doc[key] = doc[key].filter((x) => x.id !== id);
      if (key === 'todos') doc.subtasks = doc.subtasks.filter((x) => x.todoId !== id);
      if (key === 'notebooks') doc.noteBoxes = doc.noteBoxes.filter((x) => x.notebookId !== id);
      return { ok: true, updatedAt: at };
    },
    ...extra,
  });
}

const writes = (api: ReturnType<typeof withApi>) => api.calls.filter((c) => c.method !== 'GET');

// jsdom no implementa showModal: basta con abrir y cerrar el <dialog>.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
});
beforeEach(() => tokenStore.set('t1'));
afterEach(() => vi.useRealTimers());

describe('Agenda', () => {
  it('muestra los bloques del día y crea uno nuevo', async () => {
    const api = withApi();
    renderAt('/agenda');
    expect(await screen.findByRole('button', { name: /Editar «Estudiar cálculo», 9:00 a 10:30, Estudio/ })).toBeInTheDocument();
    expect(screen.getByText(/2 bloques · 2 h 30 min/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo bloque' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo bloque' });
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Leer');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Lectura' }));
    await userEvent.selectOptions(within(dialog).getByLabelText('Duración'), '1.5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Añadir bloque' }));

    expect(await screen.findByRole('button', { name: /Editar «Leer», 9:00 a 10:30, Lectura/ })).toBeInTheDocument();
    const post = writes(api)[0];
    expect(post).toMatchObject({ method: 'POST', path: '/api/v2/modules/blocks', body: { item: { label: 'Leer', sub: '', kind: 'read', start: 9, dur: 1.5 } } });
    expect((post.body as { item: { id: string } }).item.id).toMatch(/^[\w-]+$/);
  });

  it('agrupa las tareas por prioridad y las marca como hechas', async () => {
    const api = withApi();
    renderAt('/agenda?vista=tareas');
    const alta = await screen.findByRole('region', { name: /Alta/ });
    expect(within(alta).getByText('0 de 1 hechas')).toBeInTheDocument();
    await userEvent.click(within(alta).getByRole('checkbox', { name: 'Entregar ensayo' }));
    await waitFor(() => expect(within(alta).getByText('1 de 1 hechas')).toBeInTheDocument());
    expect(writes(api)[0]).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/tasks/t1', body: { done: true } });
  });

  it('si la API falla, deshace el cambio y avisa', async () => {
    withApi({ 'PATCH /api/v2/modules/:key/:id': () => [500, { error: 'Error interno del servidor' }] });
    renderAt('/agenda?vista=tareas');
    const box = await screen.findByRole('checkbox', { name: 'Entregar ensayo' });
    await userEvent.click(box);
    expect(await screen.findByRole('alert')).toHaveTextContent('Error interno del servidor');
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Entregar ensayo' })).not.toBeChecked());
  });
});

describe('Pendientes', () => {
  it('añade, reordena y borra en cascada', async () => {
    const api = withApi();
    renderAt('/pendientes');
    expect(await screen.findByRole('heading', { name: /2 por hacer/ })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Nuevo pendiente'), 'Comprar pan{Enter}');
    expect(await screen.findByRole('checkbox', { name: 'Comprar pan' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /3 por hacer/ })).toBeInTheDocument();
    expect(writes(api)[0]).toMatchObject({ method: 'POST', path: '/api/v2/modules/todos', body: { item: { title: 'Comprar pan', done: false } } });

    await userEvent.click(screen.getByRole('button', { name: 'Subir «Organizar mudanza»' }));
    await waitFor(() => expect(writes(api)[1]).toMatchObject({ method: 'PUT', path: '/api/v2/modules/todos/order' }));
    expect((writes(api)[1].body as { ids: string[] }).ids.slice(0, 3)).toEqual(['td2', 'td1', 'td3']);

    await userEvent.click(screen.getByRole('button', { name: /Subtareas de «Organizar mudanza»: 1 de 1 hechas/ }));
    expect(screen.getByRole('checkbox', { name: 'Pedir cajas' })).toBeChecked();
    await userEvent.type(screen.getByLabelText('Nueva subtarea de «Organizar mudanza»'), 'Contratar camión{Enter}');
    expect(writes(api)[2]).toMatchObject({ method: 'POST', path: '/api/v2/modules/subtasks', body: { item: { todoId: 'td2', title: 'Contratar camión' } } });

    await userEvent.click(screen.getByRole('button', { name: 'Borrar «Organizar mudanza»' }));
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Organizar mudanza' })).not.toBeInTheDocument());
    expect(screen.queryByRole('checkbox', { name: 'Pedir cajas' })).not.toBeInTheDocument();
    expect(writes(api)[3]).toMatchObject({ method: 'DELETE', path: '/api/v2/modules/todos/td2' });
  });
});

describe('Calendario', () => {
  it('marca los eventos cada mes, los desactiva y crea otros', async () => {
    const api = withApi();
    renderAt('/calendario');
    const day14 = await screen.findByRole('button', { name: / 14 de .*: 1 evento/ });
    await userEvent.click(day14);
    expect(screen.getByText('Dentista')).toBeInTheDocument();
    expect(screen.getByText(/se repiten cada mes/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('switch', { name: 'Activo: «Dentista»' }));
    expect(writes(api)[0]).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/reminders/r1', body: { on: false } });
    await waitFor(() => expect(screen.getByRole('button', { name: / 14 de [a-z]+$/ })).toBeInTheDocument());

    // Al pasar de mes, el mismo día 14 sigue ahí (cuando está activo).
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo evento' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo evento' });
    await userEvent.type(within(dialog).getByLabelText('Título'), 'Pagar renta');
    await userEvent.type(within(dialog).getByLabelText('Hora o nota (opcional)'), '09:00');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Rosa' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Añadir evento' }));
    expect(writes(api)[1]).toMatchObject({
      method: 'POST',
      path: '/api/v2/modules/reminders',
      body: { item: { day: 14, title: 'Pagar renta', when: '09:00', color: '#EC6A9C', icon: 'doc', on: true } },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(screen.getByRole('button', { name: / 14 de .*: 1 evento/ })).toBeInTheDocument();
  });
});

describe('Horario', () => {
  it('muestra la próxima clase y crea una desde una materia', async () => {
    const api = withApi();
    renderAt('/horario');
    expect(await screen.findByText(/Próxima clase|Clase en curso/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Cálculo, lunes de 08:00 a 09:30, aula A-201/ }).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: 'Nueva clase' }));
    const dialog = screen.getByRole('dialog', { name: 'Nueva clase' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Materia'), 'mat1');
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Física');
    expect(within(dialog).getByLabelText('Aula (opcional)')).toHaveValue('B-3');
    await userEvent.selectOptions(within(dialog).getByLabelText('Día'), '3');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Añadir clase' }));
    expect(writes(api)[0]).toMatchObject({
      method: 'POST',
      path: '/api/v2/modules/classes',
      body: { item: { title: 'Física', day: 3, start: '08:00', end: '09:30', room: 'B-3', color: '#22B8CF', subject: 'mat1' } },
    });
    expect((await screen.findAllByRole('button', { name: /Física, miércoles de 08:00 a 09:30/ })).length).toBeGreaterThan(0);
  });

  it('no deja guardar una clase que termina antes de empezar', async () => {
    withApi();
    renderAt('/horario');
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva clase' }));
    const dialog = screen.getByRole('dialog', { name: 'Nueva clase' });
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Historia');
    const end = within(dialog).getByLabelText('Termina');
    await userEvent.clear(end);
    await userEvent.type(end, '07:00');
    expect(within(dialog).getByText('Debe ser después de la hora de inicio.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Añadir clase' })).toBeDisabled();
  });
});

describe('Enfoque', () => {
  it('guarda la sesión al saltar y alterna con el descanso', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const api = withApi();
    renderAt('/enfoque');
    expect(await screen.findByText('Sesiones hoy')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('25:00');

    await userEvent.click(screen.getByRole('button', { name: 'Empezar' }));
    act(() => vi.advanceTimersByTime(61_000));
    expect(screen.getByRole('timer')).toHaveTextContent('23:59');
    expect(document.title).toBe('23:59 · Enfoque');

    await userEvent.click(screen.getByRole('button', { name: 'Saltar' }));
    await waitFor(() => expect(writes(api)).toHaveLength(1));
    expect(writes(api)[0]).toMatchObject({ method: 'POST', path: '/api/v2/modules/focus', body: { item: { mode: 'focus', seconds: 61, dateKey: utcDayKey() } } });
    expect(screen.getByRole('button', { name: 'Descanso corto' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('timer')).toHaveTextContent('05:00');
    expect(screen.getByText(/Ahora toca: descanso corto/)).toBeInTheDocument();
    expect(document.title).toBe('Enfoque · Design Your Core');
  });

  it('al terminar un enfoque lo guarda completo y cuenta en las estadísticas', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const api = withApi();
    renderAt('/enfoque');
    await userEvent.click(await screen.findByRole('button', { name: 'Empezar' }));
    act(() => vi.advanceTimersByTime(25 * 60_000 + 500));
    await waitFor(() => expect(writes(api)).toHaveLength(1));
    expect(writes(api)[0].body).toMatchObject({ item: { mode: 'focus', seconds: 1500 } });
    const today = screen.getByText('Sesiones hoy').previousElementSibling;
    await waitFor(() => expect(today).toHaveTextContent('1'));
    expect(screen.getByRole('button', { name: 'Descanso corto' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Cambios sin guardar', () => {
  it('avisa antes de recargar mientras hay escrituras en vuelo', async () => {
    let release: (v: unknown) => void = () => undefined;
    withApi({ 'PATCH /api/v2/modules/:key/:id': () => new Promise((r) => (release = r)) as never });
    renderAt('/pendientes');
    const unload = () => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Pagar la luz' }));
    await waitFor(() => expect(unload()).toBe(true));
    release({ item: { id: 'td1', title: 'Pagar la luz', done: true }, updatedAt: '2026-09-25T10:00:00.000Z' });
    await waitFor(() => expect(unload()).toBe(false));
  });
});

describe('Más', () => {
  it('enlaza las herramientas por grupos con sus cuentas y deja el resto para la app anterior', async () => {
    withApi();
    renderAt('/mas');
    const tools = await screen.findByRole('region', { name: 'Herramientas' });
    expect(within(tools).getByRole('link', { name: /Agenda.*4 elementos/ })).toHaveAttribute('href', '/agenda');
    expect(within(tools).getByRole('link', { name: /Pendientes.*2 por hacer/ })).toHaveAttribute('href', '/pendientes');
    expect(within(tools).getByRole('link', { name: /Horario.*1 clase/ })).toBeInTheDocument();
    expect(within(tools).getByRole('link', { name: /Enfoque.*1 sesión/ })).toBeInTheDocument();
    const study = within(tools).getByRole('list', { name: 'Estudio y trabajo' });
    expect(within(study).getByRole('link', { name: /Materias.*1 materia/ })).toHaveAttribute('href', '/materias');
    expect(within(study).getByRole('link', { name: /Proyectos.*1 activo/ })).toHaveAttribute('href', '/proyectos');
    expect(within(study).getByRole('link', { name: /Cuadernos.*2 cuadernos/ })).toBeInTheDocument();
    expect(within(study).getByRole('link', { name: /Ideas.*2 ideas/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Vida personal' })).toHaveTextContent('1 movimiento');
    expect(screen.queryByRole('region', { name: 'Trabajo y estudio' })).not.toBeInTheDocument();
  });
});

describe('Materias', () => {
  it('muestra el avance, marca y añade temas enviando la lista completa', async () => {
    const api = withApi();
    renderAt('/materias');
    const card = await screen.findByRole('article', { name: 'Física' });
    expect(within(card).getByText('Prof. Ruiz')).toBeInTheDocument();
    expect(within(card).getByRole('progressbar', { name: 'Avance de Física' })).toHaveAttribute('aria-valuenow', '50');

    await userEvent.click(within(card).getByRole('button', { name: 'Temas · 1/2' }));
    await userEvent.click(within(card).getByRole('checkbox', { name: 'Óptica' }));
    expect(writes(api)[0]).toMatchObject({
      method: 'PATCH',
      path: '/api/v2/modules/subjects/mat1',
      body: { topics: [{ id: 'tp1', name: 'Ondas', done: true }, { id: 'xa1b2c3', name: 'Óptica', done: true }] },
    });
    await waitFor(() => expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100'));
    await userEvent.type(within(card).getByLabelText('Nuevo tema de «Física»'), 'Calor{Enter}');
    const topics = (writes(api)[1].body as { topics: Array<{ id: string; name: string; done: boolean }> }).topics;
    expect(topics.map((t) => [t.name, t.done])).toEqual([['Ondas', true], ['Óptica', true], ['Calor', false]]);
    expect(topics[2].id).toMatch(/^[\w-]+$/);
  });

  it('añade la materia al horario y al renombrarla actualiza sus proyectos', async () => {
    const api = withApi();
    renderAt('/materias');
    const card = await screen.findByRole('article', { name: 'Física' });
    await userEvent.click(within(card).getByRole('button', { name: 'Añadir «Física» al horario' }));
    expect(writes(api)[0]).toMatchObject({
      method: 'POST',
      path: '/api/v2/modules/classes',
      body: { item: { day: 1, start: '08:00', end: '09:30', title: 'Física', room: 'B-3', color: '#22B8CF', subject: 'mat1' } },
    });
    expect(await screen.findByText(/añadida al Horario/)).toBeInTheDocument();

    await userEvent.click(within(card).getByRole('button', { name: 'Editar «Física»' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar materia' });
    const name = within(dialog).getByLabelText('Nombre');
    await userEvent.clear(name);
    await userEvent.type(name, 'Física I');
    expect(within(dialog).getByText('Su proyecto se actualizará con el nuevo nombre.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(writes(api).slice(1)).toMatchObject([
      { method: 'PATCH', path: '/api/v2/modules/subjects/mat1', body: { name: 'Física I', teacher: 'Prof. Ruiz', room: 'B-3', nextClass: 'Lunes 8:00', color: '#22B8CF' } },
      { method: 'PATCH', path: '/api/v2/modules/projects/p1', body: { subject: 'Física I' } },
    ]);
    expect(await screen.findByRole('article', { name: 'Física I' })).toBeInTheDocument();
  });

  it('pide confirmación para borrar y conserva las clases', async () => {
    const api = withApi();
    renderAt('/materias');
    await userEvent.click(await screen.findByRole('button', { name: 'Editar «Física»' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar materia' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Borrar' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Se borrará «Física» con 2 temas. Sus clases del Horario y sus proyectos no se borran.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Borrar definitivamente' }));
    expect(writes(api)).toMatchObject([{ method: 'DELETE', path: '/api/v2/modules/subjects/mat1' }]);
    expect(await screen.findByRole('heading', { name: 'Aún no tienes materias' })).toBeInTheDocument();
  });

  it('si la API falla, deshace el cambio del tema y avisa', async () => {
    withApi({ 'PATCH /api/v2/modules/:key/:id': () => [500, { error: 'Error interno del servidor' }] });
    renderAt('/materias');
    const card = await screen.findByRole('article', { name: 'Física' });
    await userEvent.click(within(card).getByRole('button', { name: /Temas/ }));
    await userEvent.click(within(card).getByRole('checkbox', { name: 'Óptica' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Error interno del servidor');
    await waitFor(() => expect(within(card).getByRole('checkbox', { name: 'Óptica' })).not.toBeChecked());
  });
});

describe('Proyectos', () => {
  it('filtra, cambia el estado y marca hitos', async () => {
    const api = withApi();
    renderAt('/proyectos');
    expect(await screen.findByText('Proyecto activo')).toBeInTheDocument();
    const card = screen.getByRole('article', { name: 'Maqueta del puente' });
    expect(within(card).getByText(/Entrega · 20 SEP/)).toBeInTheDocument();
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    // Sin hitos, un proyecto entregado cuenta 100 %.
    expect(within(screen.getByRole('article', { name: 'Ensayo de Historia' })).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');

    const show = screen.getByRole('group', { name: 'Mostrar' });
    await userEvent.click(within(show).getByRole('button', { name: 'Entregados' }));
    expect(screen.queryByRole('article', { name: 'Maqueta del puente' })).not.toBeInTheDocument();
    await userEvent.click(within(show).getByRole('button', { name: 'En curso' }));
    expect(screen.queryByRole('article', { name: 'Ensayo de Historia' })).not.toBeInTheDocument();

    const estado = within(screen.getByRole('article', { name: 'Maqueta del puente' })).getByRole('group', { name: 'Estado de «Maqueta del puente»' });
    await userEvent.click(within(estado).getByRole('button', { name: 'En revisión' }));
    expect(writes(api)[0]).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/projects/p1', body: { status: 'revision' } });

    const maqueta = screen.getByRole('article', { name: 'Maqueta del puente' });
    await userEvent.click(within(maqueta).getByRole('button', { name: 'Hitos · 1/2' }));
    await userEvent.click(within(maqueta).getByRole('checkbox', { name: 'Estructura' }));
    expect(writes(api)[1]).toMatchObject({
      body: { milestones: [{ id: 'm1', name: 'Boceto', done: true, date: '' }, { id: 'm2', name: 'Estructura', done: true, date: '' }] },
    });
    await waitFor(() => expect(within(maqueta).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100'));
  });

  it('crea un proyecto con la materia por nombre y su color', async () => {
    const api = withApi();
    renderAt('/proyectos');
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo proyecto' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo proyecto' });
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Informe de laboratorio');
    await userEvent.selectOptions(within(dialog).getByLabelText('Materia'), 'Física');
    await userEvent.type(within(dialog).getByLabelText('Entrega (opcional)'), '3 OCT');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Añadir proyecto' }));
    expect(writes(api)[0]).toMatchObject({
      method: 'POST',
      path: '/api/v2/modules/projects',
      body: { item: { title: 'Informe de laboratorio', subject: 'Física', deadline: '3 OCT', status: 'curso', color: '#22B8CF', milestones: [] } },
    });
    expect(await screen.findByRole('article', { name: 'Informe de laboratorio' })).toBeInTheDocument();
  });
});

describe('Roadmaps', () => {
  it('solo el paso actual se completa y desbloquea el siguiente', async () => {
    const api = withApi();
    renderAt('/roadmaps');
    const card = await screen.findByRole('article', { name: 'Ingeniería' });
    expect(within(card).getByText('Siguiente:').parentElement).toHaveTextContent('Cálculo II');
    expect(screen.getByText('1 de 3 completadas')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Marcar «Ecuaciones» como completada' })).not.toBeInTheDocument();

    await userEvent.click(within(card).getByRole('button', { name: 'Marcar «Cálculo II» como completada' }));
    expect(writes(api)[0]).toMatchObject({
      method: 'PATCH',
      path: '/api/v2/modules/roadmaps/rm1',
      body: { steps: [{ id: 'st1', done: true }, { id: 'st2', done: true }, { id: 'st3', done: false }] },
    });
    expect(await within(card).findByRole('button', { name: 'Marcar «Ecuaciones» como completada' })).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Reabrir «Cálculo I»' }));
    expect(writes(api)[1].body).toMatchObject({ steps: [{ done: false }, { done: true }, { done: false }] });

    await userEvent.type(within(card).getByLabelText('Nuevo paso de «Ingeniería»'), 'Física II{Enter}');
    expect((writes(api)[2].body as { steps: unknown[] }).steps).toHaveLength(4);
  });
});

describe('Cuadernos', () => {
  it('filtra en cascada y abre un cuaderno con sus cajitas', async () => {
    const api = withApi();
    renderAt('/cuadernos');
    expect(await screen.findByRole('link', { name: /Recetas/ })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'Universidad');
    expect(screen.queryByRole('link', { name: /Recetas/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Materia')).toHaveDisplayValue('Todas');
    await userEvent.click(screen.getByRole('link', { name: /Apuntes de cálculo.*2 cajitas/ }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Apuntes de cálculo' })).toBeInTheDocument();
    const code = screen.getByRole('region', { name: 'Cajita de código «derivada.py»' });
    expect(within(code).getByLabelText('Lenguaje de la cajita de código «derivada.py»')).toHaveValue('python');
    await userEvent.selectOptions(within(code).getByLabelText(/Lenguaje/), 'ts');
    expect(writes(api)[0]).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/noteBoxes/bx2', body: { lang: 'ts' } });

    await userEvent.click(screen.getByRole('button', { name: 'Texto' }));
    expect(writes(api)[1]).toMatchObject({
      method: 'POST',
      path: '/api/v2/modules/noteBoxes',
      body: { item: { notebookId: 'nb1', title: '', text: '', color: '#FFF7D6', kind: 'text', lang: '' } },
    });
    expect(await screen.findByRole('region', { name: 'Cajita 3' })).toBeInTheDocument();
  });

  it('guarda el texto de una cajita mientras escribes', async () => {
    const api = withApi();
    renderAt('/cuadernos/nb1');
    const box = await screen.findByRole('region', { name: 'Cajita «Regla de la cadena»' });
    const text = within(box).getByLabelText('Texto de la cajita «Regla de la cadena»');
    await userEvent.type(text, ' ✓');
    await waitFor(() => expect(writes(api)).toHaveLength(1), { timeout: 2000 });
    expect(writes(api)[0]).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/noteBoxes/bx1', body: { text: "f(g(x))' = f'(g(x))·g'(x) ✓" } });
  });

  it('borrar un cuaderno borra sus cajitas y vuelve a la lista', async () => {
    const api = withApi();
    renderAt('/cuadernos/nb1');
    await userEvent.click(await screen.findByRole('button', { name: 'Decorar' }));
    const dialog = screen.getByRole('dialog', { name: 'Decorar cuaderno' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Icono 📐' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Borrar' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Se borrará «Apuntes de cálculo» con 2 cajitas.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Borrar definitivamente' }));
    expect(writes(api)).toMatchObject([{ method: 'DELETE', path: '/api/v2/modules/notebooks/nb1' }]);
    expect(await screen.findByRole('heading', { level: 1, name: 'Cuadernos' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Apuntes de cálculo/ })).not.toBeInTheDocument();
  });
});

describe('Contenido', () => {
  it('separa producción y publicados, publica y cambia la etapa', async () => {
    const api = withApi();
    renderAt('/contenido');
    const production = await screen.findByRole('region', { name: /En producción/ });
    expect(within(production).getByText('Probé 100 apps de IA')).toBeInTheDocument();
    await userEvent.click(within(production).getByRole('checkbox', { name: 'Publicado: «Probé 100 apps de IA»' }));
    expect(writes(api)[0]).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/content/ct1', body: { stage: 'publicado' } });
    const published = await screen.findByRole('region', { name: /Publicados/ });
    await waitFor(() => expect(within(published).getByText('Probé 100 apps de IA')).toBeInTheDocument());

    // Despublicar vuelve a «Guion», como la app anterior.
    await userEvent.click(within(published).getByRole('checkbox', { name: 'Publicado: «Mi escritorio»' }));
    expect(writes(api)[1]).toMatchObject({ path: '/api/v2/modules/content/ct2', body: { stage: 'guion' } });

    await userEvent.click(screen.getByRole('button', { name: 'Editar «Probé 100 apps de IA»' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar video' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Etapa'), 'editar');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(writes(api)[2]).toMatchObject({ body: { title: 'Probé 100 apps de IA', platform: 'youtube', due: '12 sep', stage: 'editar' } });
  });

  it('añade un video con su plataforma', async () => {
    const api = withApi();
    renderAt('/contenido');
    await userEvent.type(await screen.findByLabelText('Nuevo video'), 'Rutina de estudio');
    await userEvent.selectOptions(screen.getByLabelText('Plataforma'), 'instagram');
    await userEvent.click(screen.getByRole('button', { name: 'Añadir' }));
    expect(writes(api)[0]).toMatchObject({ body: { item: { title: 'Rutina de estudio', stage: 'idea', platform: 'instagram', notes: '', script: '', due: '' } } });
  });
});

describe('Ideas', () => {
  it('filtra por categoría, crea en la categoría del filtro y deshace un borrado', async () => {
    const api = withApi();
    renderAt('/ideas');
    expect(await screen.findByRole('article', { name: 'App de hábitos' })).toBeInTheDocument();
    expect(screen.getByText('#saas')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Web' }));
    expect(screen.queryByRole('article', { name: 'App de hábitos' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Nueva idea de Web'), 'Blog de recetas{Enter}');
    expect(writes(api)[0]).toMatchObject({ method: 'POST', path: '/api/v2/modules/ideas', body: { item: { title: 'Blog de recetas', body: '', category: 'web', tags: '' } } });

    await userEvent.click(screen.getByRole('button', { name: 'Todas' }));
    await userEvent.click(screen.getByRole('button', { name: 'Borrar «App de hábitos»' }));
    expect(writes(api)[1]).toMatchObject({ method: 'DELETE', path: '/api/v2/modules/ideas/i1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Deshacer' }));
    expect(writes(api)[2]).toMatchObject({ method: 'POST', body: { item: { id: 'i1', title: 'App de hábitos', tags: 'saas, urgente' } } });
    await waitFor(() => expect(writes(api)[3]).toMatchObject({ method: 'PUT', path: '/api/v2/modules/ideas/order' }));
    expect((writes(api)[3].body as { ids: string[] }).ids.slice(0, 2)).toEqual(['i1', 'i2']);
  });

  it('guarda las etiquetas al salir del campo', async () => {
    const api = withApi();
    renderAt('/ideas');
    const card = await screen.findByRole('article', { name: 'Landing para portfolio' });
    await userEvent.type(within(card).getByLabelText(/Etiquetas de/), 'diseño, web');
    await userEvent.tab();
    expect(writes(api)[0]).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/ideas/i2', body: { tags: 'diseño, web' } });
    expect(within(card).getByText('#diseño')).toBeInTheDocument();
  });
});
