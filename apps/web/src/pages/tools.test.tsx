import { addDays, noteDateLabel, noteTag, reorderById, utcDayKey } from '@dyc/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenStore } from '../app/api';
import { AppRoutes, makeQueryClient, Providers } from '../app/App';
import { fakeFetch, legacyDoc, profile, USER, type Handler } from '../test/fakeApi';
import { localDayKey } from '../lib/tools';

// Herramientas de la app anterior (tandas 1 a 4) contra una API falsa.

// jsdom no carga imágenes: la reducción a JPEG se prueba en el navegador (e2e).
vi.mock('../app/images', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../app/images')>()),
  compressImage: vi.fn(async () => 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='),
}));

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
      doc[key] = key === 'focus' || key === 'meditations' ? [item, ...(doc[key] ?? [])] : [...(doc[key] ?? []), item];
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
      if (key === 'pets') doc.petCares = doc.petCares.filter((x) => x.petId !== id);
      return { ok: true, updatedAt: at };
    },
    // Claves que son un objeto (cycle, dayLog, budget).
    'PATCH /api/v2/modules/:key': (b, url) => {
      const [key] = parts(url);
      const value = { ...(doc[key] as unknown as object), ...(b as object) };
      (doc as Record<string, unknown>)[key] = value;
      return { value, updatedAt: at };
    },
    'PATCH /api/v2/me': (b) => ({ user: { ...USER, ...(b as object) } }),
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
  it('es el centro de todas las herramientas, por grupos y con sus cuentas', async () => {
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
    const personal = within(tools).getByRole('list', { name: 'Vida personal' });
    expect(within(personal).getByRole('link', { name: /Finanzas.*3 movimientos/ })).toHaveAttribute('href', '/finanzas');
    expect(within(personal).getByRole('link', { name: /Metas.*1 en curso/ })).toHaveAttribute('href', '/metas');
    expect(within(personal).getByRole('link', { name: /Mascotas.*1 mascota/ })).toHaveAttribute('href', '/mascotas');
    const health = within(tools).getByRole('list', { name: 'Salud' });
    expect(within(health).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/ejercicio', '/sueno', '/diario', '/rutina', '/respiracion', '/ciclo']);
    expect(within(health).getByRole('link', { name: /Respiración.*1 sesión/ })).toBeInTheDocument();
    // Ciclo siempre se abre desde Más, aunque esté oculto en el menú.
    expect(within(health).getByRole('link', { name: /Ciclo.*oculto en el menú.*Vacío/ })).toBeInTheDocument();
    expect(within(study).getByRole('link', { name: /Trabajo.*1 por hacer/ })).toHaveAttribute('href', '/trabajo');
    const knowledge = within(tools).getByRole('list', { name: 'Conocimiento' });
    expect(within(knowledge).getByRole('link', { name: /Notas.*2 notas/ })).toHaveAttribute('href', '/notas');
    // Ya no queda nada «por llegar»: todas las secciones de la app anterior están aquí.
    expect(screen.queryByRole('heading', { name: 'Llegan pronto' })).not.toBeInTheDocument();
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

// ---------- Tanda 3 ----------

const withCycle = (extra: Record<string, Handler> = {}) => withApi({ 'GET /api/me': () => ({ user: { ...USER, showCycle: true } }), ...extra });

describe('Barra lateral', () => {
  it('agrupa las herramientas en subgrupos plegables y solo muestra Ciclo si está activado', async () => {
    withApi();
    renderAt('/ejercicio');
    const nav = await screen.findByRole('navigation', { name: 'Herramientas' });
    const salud = within(nav).getByRole('button', { name: 'Salud' });
    expect(salud).toHaveAttribute('aria-expanded', 'true');
    const list = within(nav).getByRole('list', { name: 'Salud' });
    expect(within(list).getAllByRole('link').map((a) => a.textContent)).toEqual(['Ejercicio', 'Sueño', 'Diario', 'Rutina', 'Respiración']);
    // Los demás grupos empiezan plegados y se abren al pulsarlos.
    const personal = within(nav).getByRole('button', { name: 'Vida personal' });
    expect(personal).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(personal);
    expect(within(within(nav).getByRole('list', { name: 'Vida personal' })).getByRole('link', { name: 'Finanzas' })).toBeInTheDocument();
  });

  it('con Ciclo activado aparece en Salud', async () => {
    withCycle();
    renderAt('/ciclo');
    const nav = await screen.findByRole('navigation', { name: 'Herramientas' });
    await waitFor(() => expect(within(within(nav).getByRole('list', { name: 'Salud' })).getByRole('link', { name: 'Ciclo' })).toHaveAttribute('href', '/ciclo'));
  });
});

describe('Finanzas', () => {
  it('resume el mes, define el presupuesto y añade un gasto', async () => {
    const api = withApi();
    renderAt('/finanzas');
    expect(await screen.findByText('+1200', { selector: '.stat__value *' })).toBeInTheDocument();
    expect(screen.getByText('−45,5', { selector: '.stat__value *' })).toBeInTheDocument();
    expect(screen.getByText('1154,5', { selector: '.stat__value *' })).toBeInTheDocument();
    // El movimiento antiguo de otro mes no cuenta.
    expect(within(screen.getByRole('region', { name: /Movimientos/ })).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('progressbar', { name: 'Comida: 100 % de los gastos' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Definir' }));
    const budget = screen.getByRole('dialog', { name: 'Presupuesto mensual' });
    await userEvent.type(within(budget).getByLabelText('Cuánto quieres gastar al mes'), '500');
    await userEvent.click(within(budget).getByRole('button', { name: 'Guardar' }));
    expect(writes(api)[0]).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/budget', body: { monthly: 500 } });
    expect(await screen.findByRole('progressbar', { name: 'Presupuesto gastado' })).toHaveAttribute('aria-valuenow', '9');
    expect(screen.getByText(/Quedan 454,5/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo movimiento' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo movimiento' });
    await userEvent.type(within(dialog).getByLabelText('Monto'), '12,30');
    await userEvent.selectOptions(within(dialog).getByLabelText('Categoría'), 'Transporte');
    await userEvent.type(within(dialog).getByLabelText('Nota (opcional)'), 'Metro');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Añadir movimiento' }));
    expect(writes(api)[1]).toMatchObject({
      method: 'POST',
      path: '/api/v2/modules/transactions',
      body: { item: { type: 'expense', amount: 12.3, category: 'Transporte', note: 'Metro', date: utcDayKey() } },
    });
    expect(await screen.findByRole('button', { name: 'Editar: Gasto de 12,3 en Transporte (Metro)' })).toBeInTheDocument();
  });

  it('un ingreso cambia las categorías y se puede borrar con deshacer', async () => {
    const api = withApi();
    renderAt('/finanzas');
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo movimiento' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo movimiento' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ingreso' }));
    expect(within(within(dialog).getByLabelText('Categoría')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Sueldo', 'Freelance', 'Contenido', 'Regalo', 'Otro']);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));

    await userEvent.click(screen.getByRole('button', { name: 'Borrar: Gasto de 45,5 en Comida (Mercado)' }));
    expect(writes(api)[0]).toMatchObject({ method: 'DELETE', path: '/api/v2/modules/transactions/x2' });
    await userEvent.click(await screen.findByRole('button', { name: 'Deshacer' }));
    expect(writes(api)[1]).toMatchObject({ method: 'POST', body: { item: { id: 'x2', amount: 45.5 } } });
    await waitFor(() => expect(writes(api)[2]).toMatchObject({ method: 'PUT', path: '/api/v2/modules/transactions/order' }));
    expect((writes(api)[2].body as { ids: string[] }).ids).toEqual(['x1', 'x2', 'x3']);
  });
});

describe('Metas', () => {
  it('suma avances, se logra al llegar y filtra por categoría', async () => {
    const api = withApi();
    renderAt('/metas');
    const card = await screen.findByRole('article', { name: 'Publicar 8 videos' });
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '88');
    await userEvent.click(within(card).getByRole('button', { name: 'Sumar 1 a «Publicar 8 videos»' }));
    expect(writes(api)[0]).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/goals/g1', body: { current: 8, done: true } });
    expect(await screen.findByText('2/2')).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('article', { name: 'Leer 12 libros' })).getByRole('button', { name: 'Lograda' }));
    expect(writes(api)[1]).toMatchObject({ body: { done: false } });

    await userEvent.click(within(screen.getByRole('group', { name: 'Categoría' })).getByRole('button', { name: 'Estudio' }));
    expect(screen.queryByRole('article', { name: 'Publicar 8 videos' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Nueva meta' }));
    const dialog = screen.getByRole('dialog', { name: 'Nueva meta' });
    await userEvent.type(within(dialog).getByLabelText('Meta'), 'Aprobar Cálculo');
    const target = within(dialog).getByLabelText('Objetivo');
    await userEvent.clear(target);
    await userEvent.type(target, '1');
    await userEvent.type(within(dialog).getByLabelText('Fecha límite (opcional)'), '2026-12-15');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Añadir meta' }));
    expect(writes(api)[2]).toMatchObject({
      method: 'POST',
      path: '/api/v2/modules/goals',
      body: { item: { title: 'Aprobar Cálculo', target: 1, current: 0, unit: '', deadline: '2026-12-15', category: 'estudio', done: false } },
    });
  });
});

describe('Mascotas', () => {
  it('marca un cuidado como hecho hoy, añade otro y borra la mascota con sus cuidados', async () => {
    const api = withApi();
    renderAt('/mascotas');
    const card = await screen.findByRole('article', { name: 'Luna' });
    expect(within(card).getByText(/Gato · 3 años/)).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('checkbox', { name: 'Hecho hoy: «Darle de comer» de Luna' }));
    expect(writes(api)[0]).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/petCares/pc1', body: { lastDone: utcDayKey() } });
    expect(await within(card).findByText(/Hecho hoy · Todos los días/)).toBeInTheDocument();

    await userEvent.click(within(card).getByRole('button', { name: /Añadir cuidado/ }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo cuidado de Luna' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Tipo'), 'paseo');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'sábado' }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'domingo' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Añadir cuidado' }));
    expect(writes(api)[1]).toMatchObject({
      method: 'POST',
      path: '/api/v2/modules/petCares',
      body: { item: { petId: 'pet1', kind: 'paseo', title: 'Paseo', time: '', days: '12345', sound: true, enabled: true, lastDone: '' } },
    });

    await userEvent.click(within(card).getByRole('button', { name: 'Editar a Luna' }));
    const edit = screen.getByRole('dialog', { name: 'Editar mascota' });
    await userEvent.click(within(edit).getByRole('button', { name: 'Borrar' }));
    expect(within(edit).getByRole('alert')).toHaveTextContent('Se borrará a Luna con 2 cuidados.');
    await userEvent.click(within(edit).getByRole('button', { name: 'Borrar definitivamente' }));
    expect(writes(api)[2]).toMatchObject({ method: 'DELETE', path: '/api/v2/modules/pets/pet1' });
    expect(await screen.findByRole('heading', { name: 'Aún no tienes mascotas' })).toBeInTheDocument();
  });
});

describe('Ciclo', () => {
  it('registra un día de regla con fecha local, estima el próximo periodo y dice dónde se guarda', async () => {
    const api = withApi();
    renderAt('/ciclo');
    expect(await screen.findByRole('heading', { name: 'Registra tu primer día de regla' })).toBeInTheDocument();
    expect(screen.getByText(/se guardan en tu cuenta de Design Your Core y se sincronizan/)).toBeInTheDocument();
    expect(screen.getByText(/Es una estimación, no un consejo médico/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Marcar como día de regla' }));
    const today = localDayKey(new Date());
    expect(writes(api)[0]).toMatchObject({ method: 'POST', path: '/api/v2/modules/period', body: { item: { date: today, flow: 'medium', symptoms: '', mood: '', note: '' } } });
    expect(await screen.findByText('Día 1')).toBeInTheDocument();
    expect(screen.getByText('En 28 días')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Abundante' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cólicos' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fatiga' }));
    expect(writes(api).slice(1).map((w) => w.body)).toEqual([{ flow: 'heavy' }, { symptoms: 'Cólicos' }, { symptoms: 'Cólicos, Fatiga' }]);

    const settings = screen.getByRole('form', { name: 'Tu ciclo' });
    const length = within(settings).getByLabelText('Duración del ciclo (días)');
    await userEvent.clear(length);
    await userEvent.type(length, '30');
    await userEvent.click(within(settings).getByRole('button', { name: 'Guardar' }));
    expect(writes(api)[4]).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/cycle', body: { cycleLength: 30, periodLength: 5 } });
    expect(await screen.findByText('En 30 días')).toBeInTheDocument();

    await userEvent.click(within(settings).getByRole('button', { name: 'Recordarme el próximo periodo' }));
    const next = addDays(today, 30);
    expect(writes(api)[5]).toMatchObject({ method: 'POST', path: '/api/v2/modules/reminders', body: { item: { day: Number(next.slice(8)), title: '🩸 Posible inicio del periodo', color: '#EC6A9C', on: true } } });
  });

  it('se muestra u oculta en el menú con el ajuste de la cuenta', async () => {
    const api = withApi();
    renderAt('/ciclo');
    const toggle = await screen.findByRole('switch', { name: 'Mostrar Ciclo en el menú y en el Calendario' });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(writes(api)[0]).toMatchObject({ method: 'PATCH', path: '/api/v2/me', body: { showCycle: true } });
    await waitFor(() => expect(within(screen.getByRole('navigation', { name: 'Herramientas' })).getByRole('link', { name: 'Ciclo' })).toBeInTheDocument());
  });
});

describe('Calendario con Ciclo', () => {
  it('marca los días de regla y la regla prevista solo si Ciclo está activado', async () => {
    const start = localDayKey(new Date());
    const period = [0, 1].map((i) => ({ id: `pd${i}`, date: addDays(start, -i), flow: 'medium', symptoms: '', mood: '', note: '' }));
    withCycle({ 'GET /api/v2/modules': () => ({ data: { ...legacyDoc(), period }, updatedAt: null }) });
    renderAt('/calendario');
    const todayBtn = await screen.findByRole('button', { name: /: .*regla/, pressed: true });
    expect(todayBtn.getAttribute('aria-label')).toMatch(/regla$/);
    expect(screen.getByRole('list', { name: 'Leyenda' })).toHaveTextContent('Regla prevista');
    expect(screen.getByText('Ver en Ciclo')).toHaveAttribute('href', '/ciclo');
  });

  it('sin Ciclo activado no muestra nada del ciclo', async () => {
    const period = [{ id: 'pd0', date: localDayKey(new Date()), flow: 'medium', symptoms: '', mood: '', note: '' }];
    withApi({ 'GET /api/v2/modules': () => ({ data: { ...legacyDoc(), period }, updatedAt: null }) });
    renderAt('/calendario');
    expect(await screen.findByRole('list', { name: 'Leyenda' })).not.toHaveTextContent('Regla');
    expect(screen.queryByRole('button', { name: /regla/ })).not.toBeInTheDocument();
  });
});

describe('Ejercicio', () => {
  it('registra un plan hecho hoy, lo agenda en la Rutina y edita el historial', async () => {
    const api = withApi();
    renderAt('/ejercicio');
    await userEvent.click(await screen.findByRole('button', { name: 'Hecho hoy: Full body' }));
    expect(writes(api)[0]).toMatchObject({ method: 'POST', path: '/api/v2/modules/workouts', body: { item: { date: utcDayKey(), plan: 'Full body', minutes: 30 } } });
    const week = screen.getByText(/Entrenos? esta semana/).previousElementSibling;
    await waitFor(() => expect(week).toHaveTextContent(/[1-9]/));
    await userEvent.click(screen.getByRole('button', { name: 'Agendar Full body en tu Rutina' }));
    expect(writes(api)[1]).toMatchObject({ method: 'POST', path: '/api/v2/modules/routines', body: { item: { title: '🏋️ Entreno: Full body', time: '18:00', days: '1234567', enabled: true } } });

    await userEvent.click(screen.getByRole('button', { name: /Editar Core express del/ }));
    const dialog = screen.getByRole('dialog', { name: 'Editar entreno' });
    const minutes = within(dialog).getByLabelText('Minutos');
    await userEvent.clear(minutes);
    await userEvent.type(minutes, '20');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(writes(api)[2]).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/workouts/w1', body: { plan: 'Core express', minutes: 20, date: '2026-09-20' } });
  });
});

describe('Sueño', () => {
  it('registra una noche y muestra la media', async () => {
    const api = withApi();
    renderAt('/sueno');
    expect(await screen.findByText('Media de las últimas 1 noche')).toBeInTheDocument();
    expect(screen.getAllByText('7 h 45 min').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Registrar noche' }));
    const dialog = screen.getByRole('dialog', { name: 'Registrar noche' });
    const bed = within(dialog).getByLabelText('Te acostaste');
    await userEvent.clear(bed);
    await userEvent.type(bed, '00:30');
    expect(within(dialog).getByText('Dormiste 6 h 30 min.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('radio', { name: /^5/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    expect(writes(api)[0]).toMatchObject({ method: 'POST', path: '/api/v2/modules/sleep', body: { item: { date: utcDayKey(), bedtime: '00:30', waketime: '07:00', quality: 5, note: '' } } });
    expect(await screen.findByText('Media de las últimas 2 noches')).toBeInTheDocument();
  });
});

describe('Diario', () => {
  it('crea la entrada de hoy con lo primero que escribes y después la actualiza', async () => {
    const api = withApi();
    renderAt('/diario');
    expect(await screen.findByText(/se crea con lo primero que escribas/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Genial/ }));
    expect(writes(api)[0]).toMatchObject({ method: 'POST', path: '/api/v2/modules/journal', body: { item: { date: utcDayKey(), mood: '😄', gratitude: '', note: '' } } });
    const id = (writes(api)[0].body as { item: { id: string } }).item.id;
    await userEvent.type(screen.getByLabelText('Hoy agradezco…'), 'El sol');
    await waitFor(() => expect(writes(api)).toHaveLength(2), { timeout: 2000 });
    expect(writes(api)[1]).toMatchObject({ method: 'PATCH', path: `/api/v2/modules/journal/${id}`, body: { gratitude: 'El sol' } });

    // Una entrada anterior se abre desde la lista.
    await userEvent.click(screen.getByRole('button', { name: /^19 sept/ }));
    expect(screen.getByLabelText('Notas del día')).toHaveValue('Buen día');
  });
});

describe('Rutina', () => {
  it('cuenta el agua de hoy empezando de cero si el registro es de otro día', async () => {
    const api = withApi();
    renderAt('/rutina');
    expect(await screen.findByText('de 8 vasos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar un vaso' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Un vaso' }));
    expect(writes(api)[0]).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/dayLog', body: { dateKey: utcDayKey(), water: 1 } });
    await userEvent.selectOptions(screen.getByLabelText('Meta diaria'), '10');
    expect(writes(api)[1]).toMatchObject({ body: { waterGoal: 10 } });
    expect(await screen.findByText('de 10 vasos')).toBeInTheDocument();
  });

  it('filtra las rutinas por día, las desactiva y anota comidas', async () => {
    const api = withApi();
    renderAt('/rutina');
    expect(await screen.findByText('Tomar vitaminas')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: 'Activa: «Tomar vitaminas»' }));
    expect(writes(api)[0]).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/routines/rt1', body: { enabled: false } });

    await userEvent.click(screen.getByRole('button', { name: 'Nueva rutina' }));
    const dialog = screen.getByRole('dialog', { name: 'Nueva rutina' });
    await userEvent.type(within(dialog).getByLabelText('Qué haces'), 'Leer');
    const time = within(dialog).getByLabelText('Hora');
    await userEvent.clear(time);
    await userEvent.type(time, '22:00');
    for (const d of ['lunes', 'martes', 'miércoles', 'jueves', 'viernes']) await userEvent.click(within(dialog).getByRole('checkbox', { name: d }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Añadir rutina' }));
    expect(writes(api)[1]).toMatchObject({ method: 'POST', path: '/api/v2/modules/routines', body: { item: { title: 'Leer', time: '22:00', days: '67', icon: 'bell', sound: true, enabled: true } } });
    await userEvent.click(within(screen.getByRole('group', { name: 'Día de la semana' })).getByRole('button', { name: 'Lunes' }));
    expect(screen.queryByText('Leer')).not.toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('group', { name: 'Día de la semana' })).getByRole('button', { name: 'Domingo' }));
    expect(screen.getByText('Leer')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Añadir comida' }));
    const meal = screen.getByRole('dialog', { name: 'Nueva comida' });
    await userEvent.selectOptions(within(meal).getByLabelText('Comida'), 'Desayuno');
    await userEvent.type(within(meal).getByLabelText('Qué comiste (opcional)'), 'Avena');
    await userEvent.click(within(meal).getByRole('button', { name: 'Añadir comida' }));
    expect(writes(api)[2]).toMatchObject({ method: 'POST', path: '/api/v2/modules/meals', body: { item: { label: 'Desayuno', note: 'Avena', dateKey: utcDayKey() } } });
    expect(await screen.findByText('Avena')).toBeInTheDocument();
  });
});

describe('Notas', () => {
  it('agrupa por materia, busca, filtra por etiqueta y muestra la nota con sus imágenes', async () => {
    withApi({ 'POST /api/images/fetch': (b) => ({ images: (b as { ids: string[] }).ids.includes('img1') ? { img1: 'data:image/jpeg;base64,AAAA' } : {} }) });
    renderAt('/notas');
    const physics = await screen.findByRole('region', { name: /^Física/ });
    expect(within(physics).getByRole('link', { name: /Ondas/ })).toHaveAttribute('href', '/notas/n1');
    expect(within(physics).getByRole('link', { name: /Ondas.*Repasar la frecuencia.*3 sept.*#examen/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /^General/ })).toHaveTextContent('Libros');

    await userEvent.type(screen.getByLabelText('Buscar en tus notas'), 'rayuela');
    expect(screen.queryByRole('region', { name: /^Física/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Libros/ })).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Buscar en tus notas'));
    await userEvent.click(within(screen.getByRole('group', { name: 'Etiqueta' })).getByRole('button', { name: '#examen' }));
    expect(screen.queryByRole('link', { name: /Libros/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: /Ondas/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Nota: Ondas' })).toBeInTheDocument();
    // Con texto se abre en vista previa, con el Markdown ya formateado y las imágenes de la nube.
    expect(screen.getByRole('heading', { level: 2, name: 'Ondas' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Hecho' })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Imagen 1' })).toHaveAttribute('src', 'data:image/jpeg;base64,AAAA');
  });

  it('crea una nota, le da formato y se guarda sola sin tocar el enlace público', async () => {
    const api = withApi();
    renderAt('/notas');
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva nota' }));
    expect(writes(api)[0]).toMatchObject({
      method: 'POST',
      path: '/api/v2/modules/notes',
      body: { item: { title: 'Nota sin título', subject: 'General', date: noteDateLabel(), tag: noteTag('General'), excerpt: '', body: '', commit: false, tags: '', shareId: null } },
    });
    const title = await screen.findByLabelText('Título');
    await waitFor(() => expect(title).toHaveFocus());
    await userEvent.keyboard('Derivadas');
    const body = screen.getByLabelText('Texto de la nota, en Markdown');
    await userEvent.type(body, 'Regla de la cadena');
    (body as HTMLTextAreaElement).setSelectionRange(0, 5);
    await userEvent.click(screen.getByRole('button', { name: 'Negrita' }));
    expect(body).toHaveValue('**Regla** de la cadena');
    await userEvent.click(screen.getByRole('button', { name: 'Casilla' }));
    expect(body).toHaveValue('- [ ] **Regla** de la cadena');
    const materia = screen.getByLabelText('Materia');
    await userEvent.clear(materia);
    await userEvent.type(materia, 'Cálculo{Enter}');
    await waitFor(() => expect(writes(api).find((w) => w.method === 'PATCH' && (w.body as { body?: string }).body === '- [ ] **Regla** de la cadena')).toBeTruthy(), { timeout: 2000 });
    const patches = writes(api).filter((w) => w.method === 'PATCH');
    expect(patches.every((w) => w.path === patches[0].path && !('shareId' in (w.body as object)) && !('excerpt' in (w.body as object)))).toBe(true);
    expect(patches.map((w) => w.body)).toEqual(expect.arrayContaining([{ title: 'Derivadas' }, { subject: 'Cálculo' }]));

    await userEvent.click(screen.getByRole('button', { name: 'Vista previa' }));
    expect(screen.getByRole('img', { name: 'Por hacer' })).toBeInTheDocument();
    expect(screen.getByText('Regla', { selector: 'strong' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Borrar nota' }));
    await userEvent.click(screen.getByRole('button', { name: 'Borrar definitivamente' }));
    expect(writes(api).at(-1)).toMatchObject({ method: 'DELETE', path: patches[0].path });
    expect(await screen.findByRole('heading', { level: 1, name: 'Notas' })).toBeInTheDocument();
  });

  it('inserta una imagen reducida y subida a la nube como coreimg:', async () => {
    const api = withApi({ 'POST /api/images': (b) => ({ ok: true, count: Object.keys((b as { images: object }).images).length }) });
    renderAt('/notas/n2');
    await userEvent.click(await screen.findByRole('button', { name: 'Escribir' }));
    await userEvent.upload(screen.getByLabelText('Insertar imagen'), new File(['x'], 'foto.png', { type: 'image/png' }));
    await waitFor(() => expect(api.calls.find((c) => c.method === 'POST' && c.path === '/api/images')).toBeTruthy());
    const upload = api.calls.find((c) => c.path === '/api/images') as { body: { images: Record<string, string> } };
    const [id] = Object.keys(upload.body.images);
    expect(upload.body.images[id]).toBe('data:image/jpeg;base64,/9j/4AAQSkZJRg==');
    const expected = `Leer *Rayuela*\n![imagen](coreimg:${id})\n`;
    await waitFor(() => expect(screen.getByLabelText('Texto de la nota, en Markdown')).toHaveValue(expected));
    await waitFor(() => expect(writes(api).find((w) => w.method === 'PATCH')).toMatchObject({ path: '/api/v2/modules/notes/n2', body: { body: expected } }), { timeout: 2000 });
    await userEvent.click(screen.getByRole('button', { name: 'Vista previa' }));
    expect(screen.getByRole('img', { name: 'Imagen 1' })).toHaveAttribute('src', 'data:image/jpeg;base64,/9j/4AAQSkZJRg==');
  });
});

describe('Trabajo', () => {
  it('agrupa por estado, añade, marca y edita con los proyectos de la app anterior', async () => {
    const api = withApi();
    renderAt('/trabajo');
    const doing = await screen.findByRole('region', { name: /En curso/ });
    expect(within(doing).getByText('Proyecto 2')).toBeInTheDocument();
    expect(within(doing).getByText('Hoy')).toBeInTheDocument();
    expect(screen.getByText('1/2 completadas')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Hecho/ })).toHaveTextContent('Revisar cambios');
    expect(screen.getByText(/tres proyectos fijos de la app anterior/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Nueva tarea de trabajo'), 'Preparar reunión');
    await userEvent.selectOptions(screen.getByLabelText('Proyecto de la tarea nueva'), 'p3');
    await userEvent.click(screen.getByRole('button', { name: 'Añadir' }));
    expect(writes(api)[0]).toMatchObject({ method: 'POST', path: '/api/v2/modules/workItems', body: { item: { title: 'Preparar reunión', project: 'p3', status: 'todo', done: false, due: '' } } });
    const todo = await screen.findByRole('region', { name: /Por hacer/ });
    await userEvent.click(within(todo).getByRole('checkbox', { name: /Preparar reunión/ }));
    expect(writes(api)[1]).toMatchObject({ method: 'PATCH', body: { done: true } });

    await userEvent.click(screen.getByRole('button', { name: 'Editar «Informe mensual»' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar tarea de trabajo' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Por hacer' }));
    await userEvent.clear(within(dialog).getByLabelText('Para cuándo (opcional)'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(writes(api)[2]).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/workItems/wk1', body: { title: 'Informe mensual', project: 'p2', status: 'todo', due: '' } });
  });
});

describe('Respiración', () => {
  it('guía con texto cada fase y guarda la sesión al terminar', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const api = withApi();
    renderAt('/respiracion');
    expect(await screen.findByText('Sesión en total')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '1 min' }));
    await userEvent.click(screen.getByRole('button', { name: 'Empezar' }));
    expect(screen.getAllByText('Inhala').length).toBeGreaterThan(0);
    act(() => vi.advanceTimersByTime(4_500));
    expect(screen.getAllByText('Mantén').length).toBeGreaterThan(0);
    act(() => vi.advanceTimersByTime(4_000));
    expect(screen.getAllByText('Exhala').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Caja 4-4-4-4' })).toBeDisabled();
    act(() => vi.advanceTimersByTime(52_000));
    await waitFor(() => expect(writes(api)).toHaveLength(1));
    expect(writes(api)[0]).toMatchObject({ method: 'POST', path: '/api/v2/modules/meditations', body: { item: { date: utcDayKey(), minutes: 1, kind: 'respiracion' } } });
    expect(screen.getByRole('button', { name: 'Empezar' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Sesiones en total')).toBeInTheDocument());
  });

  it('terminar antes del primer minuto no guarda nada', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const api = withApi();
    renderAt('/respiracion');
    await userEvent.click(await screen.findByRole('button', { name: '4-7-8' }));
    await userEvent.click(screen.getByRole('button', { name: 'Empezar' }));
    act(() => vi.advanceTimersByTime(30_000));
    await userEvent.click(screen.getByRole('button', { name: 'Terminar' }));
    expect(screen.getByText(/Con menos de un minuto no se guarda/)).toBeInTheDocument();
    expect(writes(api)).toHaveLength(0);
  });
});
