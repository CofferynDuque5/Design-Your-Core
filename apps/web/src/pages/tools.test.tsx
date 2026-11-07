import { addDays, noteDateLabel, noteTag, reorderById, utcDayKey } from '@dyc/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenStore } from '../app/api';
import { resetFocusTimer } from '../app/focusTimer';
import { AppRoutes, makeQueryClient, Providers } from '../app/App';
import { fakeFetch, legacyDoc, profile, USER, type Handler } from '../test/fakeApi';
import { localDayKey } from '../lib/tools';

// Herramientas de la app anterior (tandas 1 a 4) contra una API falsa.

// jsdom no carga imágenes: la reducción a JPEG se prueba en el navegador (e2e).
// Sin YouTube en las pruebas: por defecto falla y lo lee el servidor.
const readYouTubeLength = vi.hoisted(() => vi.fn((_url: string): Promise<unknown> => Promise.reject(new Error('sin YouTube'))));
vi.mock('../lib/youtubeLength', () => ({ readYouTubeLength }));

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
function withApi(extra: Record<string, Handler> = {}, seed?: (doc: Record<string, unknown>) => void) {
  const doc = legacyDoc() as Record<string, Array<Record<string, unknown>>>;
  seed?.(doc);
  type Box = { items: Array<{ id: string }> } & Record<string, unknown>;
  const box = () => (doc as unknown as { vaultSecure: Box }).vaultSecure;
  const at = '2026-09-25T10:00:00.000Z';
  const parts = (url: URL) => url.pathname.split('/').slice(4);
  const api = fakeFetch({
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
    // Bóveda cifrada: como el servidor, sin ver nunca el contenido.
    'PUT /api/v2/modules/vaultSecure': (b) => {
      if ((doc as Record<string, unknown>).vaultSecure) return [409, { error: 'Ya tienes una bóveda' }];
      (doc as Record<string, unknown>).vaultSecure = b;
      return [201, { value: b, updatedAt: at }];
    },
    'DELETE /api/v2/modules/vaultSecure': () => {
      delete (doc as Record<string, unknown>).vaultSecure;
      return { ok: true, updatedAt: at };
    },
    'POST /api/v2/modules/vaultSecure/items': (b) => {
      const item = (b as { item: { id: string } }).item;
      box().items = [...box().items, item];
      return [201, { item, updatedAt: at }];
    },
    'PUT /api/v2/modules/vaultSecure/items/:id': (b, url) => {
      const id = decodeURIComponent(url.pathname.split('/').pop() as string);
      box().items = box().items.map((x) => (x.id === id ? { id, ...(b as object) } : x));
      return { item: { id, ...(b as object) }, updatedAt: at };
    },
    'DELETE /api/v2/modules/vaultSecure/items/:id': (_b, url) => {
      const id = decodeURIComponent(url.pathname.split('/').pop() as string);
      box().items = box().items.filter((x) => x.id !== id);
      return { ok: true, updatedAt: at };
    },
    'POST /api/v2/modules/vaultSecure/migrate': (b) => {
      const { items, legacyIds } = b as { items: Array<{ id: string }>; legacyIds: string[] };
      box().items = [...box().items, ...items];
      doc.vault = (doc.vault ?? []).filter((x) => !legacyIds.includes(x.id as string));
      return { migrated: items.length, remaining: doc.vault.length, updatedAt: at };
    },
    ...extra,
  });
  return Object.assign(api, { doc });
}

// Cambios de las herramientas (sin la copia al check-in del día, que se prueba aparte).
const writes = (api: ReturnType<typeof withApi>) => api.calls.filter((c) => c.method !== 'GET' && !c.path.startsWith('/api/v2/checkins'));
const checkInSyncs = (api: ReturnType<typeof withApi>) => api.calls.filter((c) => c.method === 'PUT' && c.path.startsWith('/api/v2/checkins'));

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
  it('agrupa por proyecto y oculta los hechos, y lo recuerda', async () => {
    localStorage.removeItem('dyc-pendientes-vista');
    withApi({}, (doc) => {
      doc.todos = [
        { id: 'a1', title: 'Login de NV Hotel', done: false },
        { id: 'a2', title: 'Pagos de NV Streaming', done: false },
        { id: 'a3', title: 'Menú de NV Hotel', done: true },
        { id: 'a4', title: 'Banner de NV Streaming', done: false },
        { id: 'a5', title: 'Comprar pan', done: false },
      ];
    });
    renderAt('/pendientes');
    await screen.findByText('Comprar pan');
    await userEvent.click(screen.getByRole('button', { name: 'Por proyecto' }));
    expect(screen.getByRole('heading', { level: 3, name: /NV Hotel/ })).toHaveTextContent('1 por hacer');
    expect(screen.getByRole('heading', { level: 3, name: /NV Streaming/ })).toHaveTextContent('2 por hacer');
    expect(screen.getByRole('heading', { level: 3, name: /Otros/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ocultar los hechos (1)' }));
    expect(screen.queryByText('Menú de NV Hotel')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('dyc-pendientes-vista') ?? '{}')).toEqual({ group: true, hideDone: true });
    localStorage.removeItem('dyc-pendientes-vista');
  });

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
    expect(writes(api)[3]).toMatchObject({
      method: 'DELETE',
      path: '/api/v2/modules/todos/td2',
    });

    // «Deshacer» lo devuelve con sus subtareas y en su lugar.
    await userEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(await screen.findByRole('checkbox', { name: 'Organizar mudanza' })).toBeInTheDocument();
    await waitFor(() =>
      expect(writes(api)[4]).toMatchObject({
        method: 'POST',
        path: '/api/v2/modules/todos',
        body: { item: { id: 'td2' } },
      }),
    );
    await waitFor(() => expect(writes(api).some((w) => w.method === 'POST' && w.path === '/api/v2/modules/subtasks' && (w.body as { item: { title: string } }).item.title === 'Pedir cajas')).toBe(true));
  });

  it('avisa si intentas añadir un pendiente vacío', async () => {
    withApi();
    renderAt('/pendientes');
    await screen.findByRole('heading', { name: /2 por hacer/ });
    await userEvent.click(screen.getByRole('button', { name: 'Añadir' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe qué tienes que hacer');
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

describe('Títulos y ánimo guardados con emoji por la app anterior', () => {
  it('el Calendario los muestra sin emoji y con el icono del ánimo', async () => {
    withApi({}, (doc) => {
      (doc.reminders as unknown[]).push({ id: 'r2', day: 14, title: '🩸 Posible inicio del periodo', when: 'octubre', color: '#EC6A9C', icon: 'doc', on: true });
    });
    const { container } = renderAt('/calendario');
    await userEvent.click(await screen.findByRole('button', { name: / 14 de .*: 2 eventos/ }));
    expect(screen.getByText('Posible inicio del periodo')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Activo: «Posible inicio del periodo»' })).toBeInTheDocument();
    expect(container.querySelector('.day-items')?.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('la Rutina quita el emoji de los entrenos agendados antes', async () => {
    withApi({}, (doc) => {
      (doc.routines as unknown[]).push({ id: 'rt2', title: '🏋️ Entreno: Full body', time: '18:00', days: '1234567', icon: 'bell', sound: true, enabled: true });
    });
    renderAt('/rutina');
    expect(await screen.findByText('Entreno: Full body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar «Entreno: Full body»' })).toBeInTheDocument();
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

  it('vacío, sigue mostrando la cuadrícula de la semana; y dibuja horas antiguas como «8:00»', async () => {
    withApi({}, (doc) => {
      doc.classes = [];
    });
    const { unmount } = renderAt('/horario');
    expect(await screen.findByText('Tu horario está vacío')).toBeInTheDocument();
    for (const day of ['Lunes', 'Domingo']) expect(screen.getByRole('list', { name: day })).toBeInTheDocument();
    unmount();

    withApi({}, (doc) => {
      doc.classes = [{ id: 'old', title: 'Química', day: '2', start: '8:00', end: '9:30', room: '', color: '#4F7CFF', subject: '' }];
    });
    renderAt('/horario');
    expect((await screen.findAllByRole('button', { name: /Química, martes de 08:00 a 09:30/ })).length).toBeGreaterThan(0);
    expect(screen.queryByText('Tu horario está vacío')).not.toBeInTheDocument();
  });
});

describe('Cursos', () => {
  it('agrupa por tema, abre los enlaces aparte y cambia el estado', async () => {
    const api = withApi();
    renderAt('/cursos');
    const ingles = await screen.findByRole('list', { name: 'Cursos de Inglés' });
    const link = within(ingles).getByRole('link', { name: /Inglés básico/ });
    expect(link).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abc');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    // Sin nombre, se muestra la plataforma.
    expect(within(ingles).getByRole('link', { name: /Curso en Udemy/ })).toBeInTheDocument();
    expect(within(ingles).getByText(/YouTube · Lección 6/)).toBeInTheDocument();

    await userEvent.click(within(ingles).getByRole('button', { name: /Estado de «Inglés básico»: Viendo\. Cambiar a Terminado/ }));
    expect(writes(api)[0]).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/courses/cr1', body: { status: 'hecho' } });

    await userEvent.click(screen.getByRole('button', { name: 'Terminado' }));
    expect(screen.getByRole('link', { name: /Inglés básico/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Curso en Udemy/ })).not.toBeInTheDocument();
  });

  it('añade un curso con un enlace sin https y con un tema nuevo', async () => {
    const api = withApi();
    renderAt('/cursos');
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo curso' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo curso' });
    await userEvent.type(within(dialog).getByLabelText('Tema'), 'Guitarra');
    await userEvent.type(within(dialog).getByLabelText('Enlace (opcional)'), 'youtu.be/xyz');
    expect(within(dialog).getByText('Se abrirá en YouTube.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Añadir curso' }));
    expect(writes(api).filter((c) => c.path.startsWith('/api/v2/modules'))[0]).toMatchObject({
      method: 'POST',
      path: '/api/v2/modules/courses',
      body: { item: { topic: 'Guitarra', url: 'https://youtu.be/xyz', title: '', status: 'pendiente', notes: '' } },
    });
    expect(await screen.findByRole('list', { name: 'Cursos de Guitarra' })).toBeInTheDocument();
  });

  it('no deja guardar un enlace que no es web', async () => {
    withApi();
    renderAt('/cursos');
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo curso' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo curso' });
    await userEvent.type(within(dialog).getByLabelText('Tema'), 'X');
    await userEvent.type(within(dialog).getByLabelText('Enlace (opcional)'), 'javascript:alert(1)');
    expect(within(dialog).getByRole('button', { name: 'Añadir curso' })).toBeDisabled();
    expect(within(dialog).getByText(/Pega un enlace completo/)).toBeInTheDocument();
  });
});

describe('Cursos: progreso y horario', () => {
  afterEach(() => {
    delete (window as { YT?: unknown }).YT;
  });

  it('un video de YouTube se ve dentro, empieza donde se pausó y guarda el avance al pausar', async () => {
    const api = withApi({}, (doc) => {
      doc.courses = [{ id: 'yt1', topic: 'Inglés', title: 'Inglés básico', url: 'https://www.youtube.com/watch?v=abcdefghijk', status: 'curso', notes: '', position: 600, duration: 2400, progress: 25 }];
    });
    let opts: { videoId?: string; playerVars: { start: number }; events: { onStateChange: (e: { data: number }) => void } } | undefined;
    const player = { getCurrentTime: () => 1200.4, getDuration: () => 2400, getVideoData: () => ({ video_id: 'abcdefghijk' }), getPlaylist: () => null, getPlaylistIndex: () => -1, destroy: vi.fn() };
    (window as { YT?: unknown }).YT = {
      Player: function (_el: HTMLElement, o: typeof opts) {
        opts = o;
        return player;
      },
    };
    renderAt('/cursos');
    expect(await screen.findByText('Vas en 10:00 de 40:00')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continuar «Inglés básico» aquí' }));
    const dialog = screen.getByRole('dialog', { name: 'Inglés básico' });
    await waitFor(() => expect(opts?.videoId).toBe('abcdefghijk'));
    expect(opts!.playerVars.start).toBe(597);
    act(() => opts!.events.onStateChange({ data: 2 }));
    await waitFor(() => expect(writes(api).at(-1)).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/courses/yt1', body: { position: 1200, duration: 2400, progress: 50, status: 'curso' } }));
    expect(within(dialog).getByText('Guardado: Vas en 20:00 de 40:00.')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /Abrir en YouTube/ })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abcdefghijk');
  });

  it('en otras plataformas abre el enlace y al volver pregunta hasta dónde llegaste', async () => {
    const api = withApi({}, (doc) => {
      doc.courses = [{ id: 'ud1', topic: 'Inglés', title: 'Gramática', url: 'https://www.udemy.com/course/gramatica/', status: 'pendiente', notes: '' }];
    });
    renderAt('/cursos');
    const link = await screen.findByRole('link', { name: /Gramática/ });
    link.addEventListener('click', (e) => e.preventDefault());
    await userEvent.click(link);
    await waitFor(() => expect(writes(api).at(-1)).toMatchObject({ path: '/api/v2/modules/courses/ud1', body: { status: 'curso' } }));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    const dialog = await screen.findByRole('dialog', { name: '¿Hasta dónde llegaste?' });
    await userEvent.type(within(dialog).getByLabelText('Dónde lo dejaste (opcional)'), 'Lección 12');
    fireEvent.change(within(dialog).getByLabelText(/Avance/), { target: { value: '40' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar avance' }));
    expect(writes(api).at(-1)).toMatchObject({ method: 'PATCH', body: { spot: 'Lección 12', progress: 40, status: 'curso' } });
    expect(await screen.findByText('Lección 12 · 40 %')).toBeInTheDocument();
  });

  it('agrega el curso al horario los días elegidos y desde el Horario se abre', async () => {
    const api = withApi({}, (doc) => {
      doc.courses = [{ id: 'ud1', topic: 'Inglés', title: 'Gramática', url: 'https://www.udemy.com/course/gramatica/', status: 'curso', notes: '' }];
      doc.classes = [];
    });
    const { unmount } = renderAt('/cursos');
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar «Gramática» al horario' }));
    const dialog = screen.getByRole('dialog', { name: 'Agregar al horario' });
    expect(within(dialog).getByRole('button', { name: 'Agregar al horario' })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'lunes' }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'miércoles' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar al horario' }));
    const added = writes(api).filter((c) => c.path === '/api/v2/modules/classes');
    expect(added.map((c) => (c.body as { item: unknown }).item)).toEqual([
      { id: expect.any(String), day: 1, start: '18:00', end: '19:00', title: 'Gramática', room: 'Udemy', color: expect.any(String), subject: '', course: 'ud1' },
      { id: expect.any(String), day: 3, start: '18:00', end: '19:00', title: 'Gramática', room: 'Udemy', color: expect.any(String), subject: '', course: 'ud1' },
    ]);
    expect(await screen.findByRole('link', { name: 'En tu horario: Lun y Mié 18:00' })).toBeInTheDocument();
    unmount();

    renderAt('/horario');
    await userEvent.click((await screen.findAllByRole('button', { name: /Gramática, lunes/ }))[0]);
    expect(screen.getByRole('link', { name: 'Abrir el curso' })).toHaveAttribute('href', '/cursos?abrir=ud1');
  });

  it('con solo pegar el enlace lee cuánto dura, y si no puede deja escribirla', async () => {
    const asked: string[] = [];
    const api = withApi(
      {
        'POST /api/v2/courses/length': (b) => {
          const url = (b as { url: string }).url;
          asked.push(url);
          return url.includes('youtube') ? { seconds: 45000, exact: true, videos: 12 } : [404, { error: 'Esa página no dice cuánto dura. Escribe la duración a mano.' }];
        },
      },
      (doc) => {
        doc.courses = [];
      },
    );
    renderAt('/cursos');
    await userEvent.click(await screen.findByRole('button', { name: 'Añadir el primero' }));
    let dialog = screen.getByRole('dialog', { name: 'Nuevo curso' });
    await userEvent.type(within(dialog).getByLabelText('Tema'), 'Inglés');
    await userEvent.type(within(dialog).getByLabelText('Enlace (opcional)'), 'https://www.youtube.com/playlist?list=PLabcdefghijk');
    await userEvent.tab();
    expect(await within(dialog).findByText('Dura 12 h 30 min (12 videos), según la página.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Duración total en horas (opcional)')).toHaveValue(12.5);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Añadir curso' }));
    expect(writes(api).at(-1)).toMatchObject({ path: '/api/v2/modules/courses', body: { item: { length: 45000, lengthFrom: 'enlace' } } });
    expect(await screen.findByText(/YouTube · 12 h 30 min/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Añadir a Inglés' }));
    dialog = screen.getByRole('dialog', { name: 'Nuevo curso' });
    await userEvent.type(within(dialog).getByLabelText('Enlace (opcional)'), 'https://ejemplo.com/curso');
    await userEvent.tab();
    expect(await within(dialog).findByText('Esa página no dice cuánto dura. Escribe la duración a mano.')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Duración total en horas (opcional)'), '6');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Añadir curso' }));
    expect(writes(api).at(-1)).toMatchObject({ body: { item: { url: 'https://ejemplo.com/curso', length: 21600, lengthFrom: 'manual' } } });
    expect(asked).toHaveLength(2);
  });

  it('cada tema va en orden de lo básico a lo avanzado y al terminar uno sus clases pasan al siguiente', async () => {
    const api = withApi({}, (doc) => {
      doc.courses = [
        { id: 'r1', topic: 'React', title: 'Redux avanzado', url: '', status: 'pendiente', notes: '' },
        { id: 'r2', topic: 'React', title: 'Hooks en React', url: '', status: 'pendiente', notes: '' },
        { id: 'r3', topic: 'React', title: 'React desde cero', url: 'https://www.udemy.com/course/react/', status: 'curso', notes: '' },
      ];
      doc.classes = [{ id: 'k1', day: 1, start: '18:00', end: '19:00', title: 'React desde cero', room: 'Udemy', color: '#4F7CFF', subject: '', course: 'r3' }];
    });
    renderAt('/cursos');
    const card = await screen.findByRole('list', { name: 'Cursos de React' });
    expect(within(card).getAllByRole('listitem').map((li) => li.querySelector('.course-row__name')?.textContent?.replace(' (se abre en otra pestaña)', ''))).toEqual(['React desde cero', 'Hooks en React', 'Redux avanzado']);
    expect(within(card).getAllByRole('listitem')[0]).toHaveTextContent('Sigue');
    await userEvent.click(within(card).getByRole('button', { name: /Estado de «React desde cero»: Viendo/ }));
    await waitFor(() => expect(writes(api).at(-1)).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/classes/k1', body: { course: 'r2', title: 'Hooks en React' } }));
    expect(await screen.findByText('Terminaste «React desde cero». Tus clases siguen con «Hooks en React».')).toBeInTheDocument();
  });

  it('«Crear horario» pone un curso de cada tema en los huecos libres y dice cuándo terminas', async () => {
    const api = withApi({}, (doc) => {
      doc.courses = [
        { id: 'a', topic: 'Inglés', title: 'Inglés', url: '', status: 'curso', notes: '', length: 36000, progress: 50 },
        { id: 'b', topic: 'React', title: 'React', url: '', status: 'curso', notes: '', length: 21600 },
        { id: 'z', topic: 'Otro', title: 'Guitarra', url: '', status: 'pendiente', notes: '' },
      ];
      doc.classes = [
        { id: 'k1', day: 1, start: '18:00', end: '19:00', title: 'Gimnasio', room: '', color: '#4F7CFF', subject: '' },
        { id: 'old', day: 2, start: '07:00', end: '08:00', title: 'Inglés', room: '', color: '#4F7CFF', subject: '', course: 'a' },
      ];
    });
    renderAt('/cursos');
    await userEvent.click(await screen.findByRole('button', { name: 'Crear horario' }));
    const dialog = screen.getByRole('dialog', { name: 'Crear horario' });
    // Por defecto, todos los temas.
    expect(within(dialog).getByRole('checkbox', { name: /Inglés.*1 curso.*faltan 5 h/ })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: /Otro.*empieza por «Guitarra»/ })).toBeChecked();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Otro/ }));
    // Solo lunes y miércoles, de 18 a 20.
    for (const d of ['martes', 'jueves', 'viernes']) await userEvent.click(within(dialog).getByRole('checkbox', { name: d }));
    fireEvent.change(within(dialog).getByLabelText('Hasta'), { target: { value: '20:00' } });
    await userEvent.selectOptions(within(dialog).getByLabelText('Horas a la semana'), '5');
    // Lunes 18-19 ya está ocupado: caben 3 h.
    expect(within(dialog).getByText('En esos días y horas caben 3 h a la semana, así que usamos esas.')).toBeInTheDocument();
    const sessions = within(dialog).getAllByRole('listitem').map((li) => li.textContent);
    expect(sessions.slice(0, 3)).toEqual(['Lun 19:00–20:00 Inglés', 'Mié 18:00–19:00 React', 'Mié 19:00–20:00 React']);
    expect(sessions.slice(3)).toEqual([expect.stringMatching(/^Inglés: 1 sesión a la semana · lo terminas hacia el .+ \(5 semanas\)$/), expect.stringMatching(/^React: 2 sesiones a la semana · lo terminas hacia el .+ \(3 semanas\)$/)]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Poner en mi horario' }));
    await waitFor(() => expect(writes(api).filter((c) => c.path === '/api/v2/modules/classes')).toHaveLength(3));
    expect(writes(api).find((c) => c.method === 'DELETE')).toMatchObject({ path: '/api/v2/modules/classes/old' });
    expect(writes(api).filter((c) => c.path === '/api/v2/modules/classes')[0].body).toMatchObject({ item: { day: 1, start: '19:00', end: '20:00', title: 'Inglés', course: 'a' } });
  });

  it('lecciones: se marcan, se añaden por unidad y se traen de la lista de YouTube', async () => {
    const api = withApi({}, (doc) => {
      doc.courses = [
        {
          id: 'a',
          topic: 'React',
          title: 'React desde cero',
          url: 'https://www.youtube.com/playlist?list=PLabcdefghijk',
          status: 'pendiente',
          notes: '',
          lessons: [
            { id: 'l1', title: 'Instalación', unit: 'Unidad 1' },
            { id: 'l2', title: 'JSX', unit: 'Unidad 1' },
          ],
        },
      ];
    });
    renderAt('/cursos');
    await userEvent.click(await screen.findByRole('button', { name: 'Lecciones de «React desde cero» (0 de 2)' }));
    const dialog = screen.getByRole('dialog', { name: 'Lecciones de «React desde cero»' });
    expect(within(dialog).getByRole('heading', { name: /Unidad 1/ })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Instalación' }));
    await waitFor(() =>
      expect(writes(api).at(-1)).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/courses/a', body: { progress: 50, status: 'curso', lessons: [{ id: 'l1', done: true }, { id: 'l2' }] } }),
    );
    await userEvent.clear(within(dialog).getByLabelText('Unidad (opcional)'));
    await userEvent.type(within(dialog).getByLabelText('Unidad (opcional)'), 'Unidad 2');
    await userEvent.type(within(dialog).getByLabelText('Lección o video'), 'useState');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Añadir lección' }));
    await waitFor(() => expect(writes(api).at(-1)).toMatchObject({ body: { progress: 33, lessons: [{ id: 'l1' }, { id: 'l2' }, { title: 'useState', unit: 'Unidad 2' }] } }));
    expect(await within(dialog).findByRole('heading', { name: /Unidad 2/ })).toBeInTheDocument();

    readYouTubeLength.mockResolvedValueOnce({ seconds: 900, exact: true, videos: 2, items: [{ video: 'aaaaaaaaaaa', title: 'Clase 1', seconds: 300 }, { video: 'bbbbbbbbbbb', title: 'Clase 2', seconds: 600 }] });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Traer los videos nuevos de la lista' }));
    expect(await within(dialog).findByText('Listo: 2 lecciones nuevas de la lista.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Ver «Clase 2» aquí' })).toBeInTheDocument();
    expect(writes(api).at(-1)).toMatchObject({ body: { lessons: [{}, {}, {}, { title: 'Clase 1', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa&list=PLabcdefghijk', seconds: 300 }, { title: 'Clase 2' }] } });
  });

  it('subcategoría y canal: YouTube se lee aquí y llena el canal y el nombre', async () => {
    readYouTubeLength.mockResolvedValueOnce({ seconds: 5400, exact: true, author: 'midudev', title: 'Hooks en React' });
    const api = withApi(
      {
        'POST /api/v2/courses/length': () => [500, { error: 'no debería llamarse' }],
      },
      (doc) => {
        doc.courses = [{ id: 'a', topic: 'React', subtopic: 'Bases', title: 'React desde cero', url: '', status: 'curso', notes: '', source: 'Platzi' }];
      },
    );
    renderAt('/cursos');
    expect(await screen.findByRole('heading', { name: 'Bases', level: 3 })).toBeInTheDocument();
    expect(screen.getByText(/Platzi/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Añadir a React' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo curso' });
    await userEvent.type(within(dialog).getByLabelText('Subcategoría (opcional)'), 'Hooks');
    await userEvent.type(within(dialog).getByLabelText('Enlace (opcional)'), 'https://youtu.be/abcdefghijk');
    await userEvent.tab();
    expect(await within(dialog).findByText('Dura 1 h 30 min, de midudev, según la página.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Canal de YouTube o academia (opcional)')).toHaveValue('midudev');
    expect(within(dialog).getByLabelText('Nombre (opcional)')).toHaveValue('Hooks en React');
    expect(readYouTubeLength).toHaveBeenCalledWith('https://youtu.be/abcdefghijk', expect.any(Function));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Añadir curso' }));
    expect(writes(api).at(-1)).toMatchObject({
      path: '/api/v2/modules/courses',
      body: { item: { topic: 'React', subtopic: 'Hooks', source: 'midudev', title: 'Hooks en React', length: 5400, lengthFrom: 'enlace' } },
    });
    expect(await screen.findByRole('heading', { name: 'Hooks', level: 3 })).toBeInTheDocument();
  });
});

describe('Enfoque', () => {
  beforeEach(() => resetFocusTimer());

  it('sigue contando al ir a otra sección y vuelve donde iba', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    withApi();
    renderAt('/enfoque');
    await userEvent.click(await screen.findByRole('button', { name: 'Empezar' }));
    act(() => vi.advanceTimersByTime(3_000));
    await userEvent.click(screen.getAllByRole('link', { name: /^Hoy$/ })[0]);
    act(() => vi.advanceTimersByTime(60_000));
    const chip = await screen.findByRole('link', { name: /Concentración en marcha: quedan 23:57/ });
    expect(document.title).toBe('23:57 · Concentración');
    await userEvent.click(chip);
    expect(await screen.findByRole('timer')).toHaveTextContent('23:57');
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument();
  });

  it('termina la sesión aunque estés en otra sección', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const api = withApi();
    renderAt('/enfoque');
    await userEvent.click(await screen.findByRole('button', { name: 'Empezar' }));
    await userEvent.click(screen.getAllByRole('link', { name: /^Hoy$/ })[0]);
    act(() => vi.advanceTimersByTime(25 * 60_000 + 500));
    vi.useRealTimers();
    await waitFor(() => expect(writes(api).filter((c) => c.path === '/api/v2/modules/focus')).toHaveLength(1));
    expect(await screen.findByText(/Concentración: ¡sesión terminada! Ahora toca descanso corto/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /en marcha/ })).not.toBeInTheDocument();
  });

  it('guarda la sesión al saltar y alterna con el descanso', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const api = withApi();
    renderAt('/enfoque');
    expect(await screen.findByText('Sesiones hoy')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('25:00');

    await userEvent.click(screen.getByRole('button', { name: 'Empezar' }));
    act(() => vi.advanceTimersByTime(61_000));
    expect(screen.getByRole('timer')).toHaveTextContent('23:59');
    expect(document.title).toBe('23:59 · Concentración');

    await userEvent.click(screen.getByRole('button', { name: 'Saltar' }));
    await waitFor(() => expect(writes(api)).toHaveLength(1));
    expect(writes(api)[0]).toMatchObject({ method: 'POST', path: '/api/v2/modules/focus', body: { item: { mode: 'focus', seconds: 61, dateKey: utcDayKey() } } });
    expect(screen.getByRole('button', { name: 'Descanso corto' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('timer')).toHaveTextContent('05:00');
    expect(screen.getByText(/Ahora toca: descanso corto/)).toBeInTheDocument();
    expect(document.title).toBe('Pomodoro · Design Your Core');
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
    expect(within(tools).getByRole('link', { name: /Pomodoro.*1 sesión/ })).toBeInTheDocument();
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
    expect(within(health).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/ejercicio', '/sueno', '/diario', '/rutina', '/ciclo']);
    expect(within(tools).queryByRole('link', { name: /Respiración/ })).toBeNull();
    // Ciclo siempre se abre desde Más, aunque esté oculto en el menú.
    expect(within(health).getByRole('link', { name: /Ciclo.*oculto en el menú.*Vacío/ })).toBeInTheDocument();
    expect(within(study).getByRole('link', { name: /Trabajo.*1 por hacer/ })).toHaveAttribute('href', '/trabajo');
    const knowledge = within(tools).getByRole('list', { name: 'Conocimiento' });
    expect(within(knowledge).getByRole('link', { name: /Notas.*2 notas/ })).toHaveAttribute('href', '/notas');
    expect(within(knowledge).getByRole('link', { name: /Bóveda/ })).toHaveAttribute('href', '/boveda');
    expect(within(knowledge).getByRole('link', { name: /Asistente.*Con tu clave/ })).toHaveAttribute('href', '/asistente');
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

  it('pone prioridad y ordena «terminar primero»', async () => {
    const api = withApi();
    renderAt('/proyectos');
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo proyecto' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo proyecto' });
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'App de notas');
    await userEvent.click(within(within(dialog).getByRole('group', { name: 'Prioridad' })).getByRole('button', { name: 'Alta' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Añadir proyecto' }));
    expect(writes(api)[0]).toMatchObject({ method: 'POST', body: { item: { title: 'App de notas', priority: 'alta' } } });

    const nueva = await screen.findByRole('article', { name: 'App de notas' });
    expect(within(nueva).getByText('Prioridad alta')).toBeInTheDocument();
    expect(within(nueva).getByLabelText('Puesto 2 de 2')).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Maqueta del puente' })).getByText('Prioridad media')).toBeInTheDocument();

    await userEvent.click(within(nueva).getByRole('button', { name: 'Subir «App de notas»' }));
    const order = writes(api)[1];
    expect(order).toMatchObject({ method: 'PUT', path: '/api/v2/modules/projects/order' });
    expect((order.body as { ids: string[] }).ids.slice(0, 2)).toEqual([expect.any(String), 'p1']);
    expect((order.body as { ids: string[] }).ids[0]).not.toBe('p1');

    await userEvent.click(screen.getByRole('button', { name: /Ordenar por prioridad/ }));
    expect(writes(api)[2]).toMatchObject({ method: 'PUT', path: '/api/v2/modules/projects/order' });

  });
});

describe('Roadmaps', () => {
  it('solo el paso actual se completa y desbloquea el siguiente', async () => {
    const api = withApi();
    renderAt('/roadmaps');
    const card = await screen.findByRole('article', { name: 'Ingeniería' });
    expect(within(card).getByText('Siguiente:').parentElement).toHaveTextContent('Cálculo II');
    expect(screen.getByText('1 de 3 completadas')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Marcar «Ecuaciones» como completado' })).not.toBeInTheDocument();

    await userEvent.click(within(card).getByRole('button', { name: 'Marcar «Cálculo II» como completado' }));
    expect(writes(api)[0]).toMatchObject({
      method: 'PATCH',
      path: '/api/v2/modules/roadmaps/rm1',
      body: { steps: [{ id: 'st1', done: true }, { id: 'st2', done: true }, { id: 'st3', done: false }] },
    });
    expect(await within(card).findByRole('button', { name: 'Marcar «Ecuaciones» como completado' })).toBeInTheDocument();
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

  it('dibuja una portada según la materia y guarda el emoji de siempre aunque se elija un icono', async () => {
    const api = withApi({}, (doc) => {
      // Uno guardado por la app anterior con un emoji que no está en la lista.
      (doc.notebooks as unknown[]).push({ id: 'nb3', title: 'Varios', category: 'General', subject: '', topic: '', color: '#8B5CF6', emoji: '🦄' });
    });
    const { container } = renderAt('/cuadernos');
    await screen.findByRole('link', { name: /Recetas/ });
    // Cálculo → matemáticas; «Recetas» sin materia → cocina por el título; el resto, abstracta.
    expect([...container.querySelectorAll('.notebook-cover')].map((c) => c.getAttribute('data-cover'))).toEqual(['math', 'cooking', 'abstract']);
    for (const cover of container.querySelectorAll('.notebook-cover')) expect(cover).toHaveAttribute('aria-hidden', 'true');
    // Ningún emoji a la vista: ni el de la lista ni el desconocido.
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo cuaderno' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo cuaderno' });
    expect(within(dialog).getByRole('radio', { name: 'Cuaderno' })).toBeChecked();
    await userEvent.type(within(dialog).getByLabelText('Título'), 'Laboratorio');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Microscopio' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear cuaderno' }));
    expect(writes(api)[0]).toMatchObject({ method: 'POST', path: '/api/v2/modules/notebooks', body: { item: { title: 'Laboratorio', emoji: '🔬' } } });
    expect(dialog.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('conserva el emoji desconocido de la app anterior como «Otro icono»', async () => {
    const api = withApi({}, (doc) => {
      (doc.notebooks as Array<Record<string, unknown>>)[0].emoji = '🦄';
    });
    renderAt('/cuadernos/nb1');
    await userEvent.click(await screen.findByRole('button', { name: 'Decorar' }));
    const dialog = screen.getByRole('dialog', { name: 'Decorar cuaderno' });
    expect(within(dialog).getByRole('radio', { name: 'Otro icono' })).toBeChecked();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(writes(api)[0]).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/notebooks/nb1', body: { emoji: '🦄' } });
  });

  it('borrar un cuaderno borra sus cajitas y vuelve a la lista', async () => {
    const api = withApi();
    renderAt('/cuadernos/nb1');
    await userEvent.click(await screen.findByRole('button', { name: 'Decorar' }));
    const dialog = screen.getByRole('dialog', { name: 'Decorar cuaderno' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Escuadra' }));
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
  it('agrupa las herramientas en subgrupos plegables, todos abiertos, y solo muestra Ciclo si está activado', async () => {
    withApi();
    renderAt('/ejercicio');
    const nav = await screen.findByRole('navigation', { name: 'Herramientas' });
    const salud = within(nav).getByRole('button', { name: 'Salud' });
    expect(salud).toHaveAttribute('aria-expanded', 'true');
    const list = within(nav).getByRole('list', { name: 'Salud' });
    expect(within(list).getAllByRole('link').map((a) => a.textContent)).toEqual(['Ejercicio', 'Sueño', 'Diario', 'Rutina']);
    // Todos los grupos empiezan abiertos: cada sección se ve en el menú. Se pueden plegar.
    const personal = within(nav).getByRole('button', { name: 'Vida personal' });
    expect(personal).toHaveAttribute('aria-expanded', 'true');
    expect(within(within(nav).getByRole('list', { name: 'Vida personal' })).getByRole('link', { name: 'Finanzas' })).toBeInTheDocument();
    expect(within(nav).getAllByRole('link')).toHaveLength(24);
    await userEvent.click(personal);
    expect(personal).toHaveAttribute('aria-expanded', 'false');
    expect(within(nav).queryByRole('list', { name: 'Vida personal' })).not.toBeInTheDocument();
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
    expect(await screen.findByText('+$1200', { selector: '.stat__value *' })).toBeInTheDocument();
    expect(screen.getByText('−$45,50', { selector: '.stat__value *' })).toBeInTheDocument();
    expect(screen.getByText('$1154,50', { selector: '.stat__value *' })).toBeInTheDocument();
    // El movimiento antiguo de otro mes no cuenta.
    expect(within(screen.getByRole('region', { name: /Movimientos/ })).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('progressbar', { name: 'Comida: 100 % de los gastos' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Definir' }));
    const budget = screen.getByRole('dialog', { name: 'Presupuesto mensual' });
    await userEvent.type(within(budget).getByLabelText('Cuánto quieres gastar al mes'), '500');
    await userEvent.click(within(budget).getByRole('button', { name: 'Guardar' }));
    expect(writes(api)[0]).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/budget', body: { monthly: 500 } });
    expect(await screen.findByRole('progressbar', { name: 'Presupuesto gastado' })).toHaveAttribute('aria-valuenow', '9');
    expect(screen.getByText(/Quedan \$454,50/)).toBeInTheDocument();

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
    expect(await screen.findByRole('button', { name: 'Editar: Gasto de $12,30 en Transporte (Metro)' })).toBeInTheDocument();
  });

  it('un ingreso cambia las categorías y se puede borrar con deshacer', async () => {
    const api = withApi();
    renderAt('/finanzas');
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo movimiento' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo movimiento' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ingreso' }));
    expect(within(within(dialog).getByLabelText('Categoría')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Sueldo', 'Freelance', 'Contenido', 'Regalo', 'Otro']);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));

    await userEvent.click(screen.getByRole('button', { name: 'Borrar: Gasto de $45,50 en Comida (Mercado)' }));
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
    expect(within(dialog).getByRole('radio', { name: 'Comida' })).toBeChecked();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Paseo' }));
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
    // La especie se elige con fichas de icono y nombre (se guarda la clave, `cat`).
    expect(within(edit).getByRole('radio', { name: 'Gato' })).toBeChecked();
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
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
    expect(writes(api)[5]).toMatchObject({ method: 'POST', path: '/api/v2/modules/reminders', body: { item: { day: Number(next.slice(8)), title: 'Posible inicio del periodo', color: '#EC6A9C', on: true } } });
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
    expect(writes(api)[1]).toMatchObject({ method: 'POST', path: '/api/v2/modules/routines', body: { item: { title: 'Entreno: Full body', time: '18:00', days: '1234567', enabled: true } } });

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
    // Seis ánimos con icono y nombre; se sigue guardando el emoji de la app anterior.
    const moods = within(screen.getByRole('group', { name: '¿Cómo te sientes?' })).getAllByRole('radio');
    expect(moods.map((r) => r.closest('label')?.textContent)).toEqual(['Genial', 'Bien', 'Normal', 'Bajo', 'Mal', 'Cansancio']);
    expect(screen.getByText('Ánimo más frecuente: bien')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    await userEvent.click(screen.getByRole('radio', { name: 'Genial' }));
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
    // Una sola fuente: el vaso cuenta también en el check-in de hoy.
    await waitFor(() => expect(checkInSyncs(api)[0]).toMatchObject({ path: `/api/v2/checkins/${utcDayKey()}`, body: { water: 1 } }));
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

  it('una nota nueva que no se escribe no se queda guardada', async () => {
    const api = withApi();
    renderAt('/notas');
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva nota' }));
    await screen.findByLabelText('Título');
    await userEvent.click(screen.getAllByRole('link', { name: 'Notas' }).find((a) => a.classList.contains('back-link'))!);
    expect(await screen.findByRole('heading', { level: 1, name: 'Notas' })).toBeInTheDocument();
    const id = (writes(api)[0].body as { item: { id: string } }).item.id;
    await waitFor(() => expect(writes(api).at(-1)).toMatchObject({ method: 'DELETE', path: `/api/v2/modules/notes/${id}` }));
    expect(screen.queryByText('Nota sin título')).not.toBeInTheDocument();
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
  it('agrupa por estado, añade, marca y edita unida a tus proyectos', async () => {
    const api = withApi();
    renderAt('/trabajo');
    const doing = await screen.findByRole('region', { name: /En curso/ });
    expect(within(doing).getByText('Proyecto 2')).toBeInTheDocument();
    expect(within(doing).getByText('Hoy')).toBeInTheDocument();
    expect(screen.getByText('1/2 completadas')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Hecho/ })).toHaveTextContent('Revisar cambios');
    expect(screen.getByRole('region', { name: /Hecho/ })).toHaveTextContent('Maqueta del puente');
    expect(screen.getByText(/Una tarea sigue en «Proyecto 1, 2 o 3»/)).toBeInTheDocument();
    // Solo se ofrecen los proyectos sin entregar.
    expect(within(screen.getByLabelText('Proyecto de la tarea nueva')).queryByRole('option', { name: 'Ensayo de Historia' })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Nueva tarea de trabajo'), 'Preparar reunión');
    await userEvent.selectOptions(screen.getByLabelText('Proyecto de la tarea nueva'), 'Maqueta del puente');
    await userEvent.click(screen.getByRole('button', { name: 'Añadir' }));
    expect(writes(api)[0]).toMatchObject({ method: 'POST', path: '/api/v2/modules/workItems', body: { item: { title: 'Preparar reunión', project: 'p1', status: 'todo', done: false, due: '' } } });
    const todo = await screen.findByRole('region', { name: /Por hacer/ });
    await userEvent.click(within(todo).getByRole('checkbox', { name: /Preparar reunión/ }));
    expect(writes(api)[1]).toMatchObject({ method: 'PATCH', body: { done: true } });

    await userEvent.click(screen.getByRole('button', { name: 'Editar «Informe mensual»' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar tarea de trabajo' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Por hacer' }));
    await userEvent.clear(within(dialog).getByLabelText('Para cuándo (opcional)'));
    await userEvent.selectOptions(within(dialog).getByLabelText('Proyecto'), 'Maqueta del puente');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(writes(api)[2]).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/workItems/wk1', body: { title: 'Informe mensual', project: 'p1', status: 'todo', due: '' } });
  });
});

describe('Respiración', () => {
  it('se quitó: el enlace viejo lleva a Más y los minutos guardados no se tocan', async () => {
    const api = withApi();
    renderAt('/respiracion');
    expect(await screen.findByRole('heading', { level: 1, name: /herramientas/i })).toBeInTheDocument();
    expect(writes(api)).toHaveLength(0);
  });
});

describe('Bóveda', () => {
  const MASTER = 'caballo correcto batería grapa';
  const create = async () => {
    await userEvent.type(await screen.findByLabelText('Contraseña maestra'), MASTER);
    await userEvent.type(screen.getByLabelText('Repite la contraseña maestra'), MASTER);
    await userEvent.click(screen.getByRole('checkbox', { name: /si la olvido, pierdo las entradas/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear la bóveda' }));
    return screen.findByRole('button', { name: 'Nueva entrada' }, { timeout: 5000 });
  };

  it('crea la bóveda, guarda una entrada cifrada y solo la abre con la contraseña maestra', async () => {
    const api = withApi();
    renderAt('/boveda');
    expect(await screen.findByRole('heading', { name: 'Crea tu bóveda' })).toBeInTheDocument();
    expect(screen.getByText(/No se puede recuperar\./)).toBeInTheDocument();
    await userEvent.click(await create());

    const put = writes(api)[0];
    expect(put).toMatchObject({ method: 'PUT', path: '/api/v2/modules/vaultSecure', body: { v: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000 }, items: [] } });
    expect(JSON.stringify(put.body)).not.toContain(MASTER);

    const dialog = screen.getByRole('dialog', { name: 'Nueva entrada' });
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'GitHub');
    await userEvent.type(within(dialog).getByLabelText('Usuario o correo'), 'ana@example.com');
    await userEvent.type(within(dialog).getByLabelText('Contraseña'), 'S3cr3to-de-Ana!');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Añadir a la bóveda' }));
    expect(await screen.findByText('GitHub')).toBeInTheDocument();
    await waitFor(() => expect(writes(api)).toHaveLength(2));
    const post = writes(api)[1];
    expect(post.path).toBe('/api/v2/modules/vaultSecure/items');
    expect(Object.keys((post.body as { item: object }).item)).toEqual(['id', 'iv', 'ct']);
    // Nada en claro sale del navegador.
    expect(JSON.stringify(api.doc)).not.toMatch(/S3cr3to|ana@example|GitHub/);

    expect(screen.queryByText('S3cr3to-de-Ana!')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar la contraseña de «GitHub»' }));
    expect(screen.getByText('S3cr3to-de-Ana!')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Bloquear' }));
    expect(screen.getByRole('heading', { name: 'Bóveda bloqueada' })).toBeInTheDocument();
    expect(screen.queryByText('GitHub')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Contraseña maestra'), 'otra cosa{Enter}');
    expect(await screen.findByText('La contraseña maestra no es correcta.', {}, { timeout: 5000 })).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Contraseña maestra'));
    await userEvent.type(screen.getByLabelText('Contraseña maestra'), `${MASTER}{Enter}`);
    expect(await screen.findByText('GitHub', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
  });

  it('cifra las contraseñas sin cifrar solo tras confirmarlo y no deja copias en claro', async () => {
    const api = withApi({}, (doc) => {
      doc.vault = [
        { id: 'v1', name: 'Banco Sol', mono: 'BS', user: 'ana.perez', pass: 'Clave-Plana-123' },
        { id: 'v2', name: 'Correo', mono: 'CO', user: 'ana@example.com', pass: 'otra-clave-456' },
      ];
    });
    renderAt('/boveda');
    const notice = await screen.findByRole('region', { name: 'Hay 2 contraseñas guardadas sin cifrar' });
    expect(within(notice).getByText('Crea tu bóveda para cifrarlas.')).toBeInTheDocument();
    await create();
    expect(writes(api)).toHaveLength(1);

    await userEvent.click(within(notice).getByRole('button', { name: 'Cifrar y borrar las copias sin cifrar' }));
    const dialog = screen.getByRole('dialog', { name: 'Cifrar las contraseñas guardadas sin cifrar' });
    expect(within(dialog).getByText('Se borra la lista sin cifrar.')).toBeInTheDocument();
    expect(within(dialog).getByText('Banco Sol')).toBeInTheDocument();
    // Nada se escribe hasta confirmar.
    expect(writes(api)).toHaveLength(1);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cifrar y borrar las copias sin cifrar' }));

    await waitFor(() => expect(writes(api)).toHaveLength(2), { timeout: 5000 });
    const migrate = writes(api)[1];
    expect(migrate).toMatchObject({ method: 'POST', path: '/api/v2/modules/vaultSecure/migrate', body: { legacyIds: ['v1', 'v2'] } });
    expect(api.doc.vault).toEqual([]);
    expect((api.doc as unknown as { vaultSecure: { items: unknown[] } }).vaultSecure.items).toHaveLength(2);
    expect(JSON.stringify(api.doc)).not.toMatch(/Clave-Plana-123|otra-clave-456|Banco Sol/);
    expect(await screen.findByText('Banco Sol')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('region', { name: /guardadas sin cifrar/ })).not.toBeInTheDocument());
  });

  it('se bloquea sola tras 5 minutos sin actividad y al salir de la página', async () => {
    withApi();
    renderAt('/boveda');
    await create();
    // El temporizador se arma en un efecto: hay que dejar que corra antes de falsear el reloj,
    // o en una máquina lenta se arma a mitad de la prueba y no llega a los 5 minutos.
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    act(() => void window.dispatchEvent(new Event('pointerdown')));
    act(() => vi.advanceTimersByTime(4 * 60_000));
    expect(screen.getByRole('button', { name: 'Nueva entrada' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole('heading', { name: 'Bóveda bloqueada' })).toBeInTheDocument();
    expect(screen.getByText(/Se bloqueó tras 5 minutos sin actividad/)).toBeInTheDocument();
    vi.useRealTimers();

    await userEvent.type(screen.getByLabelText('Contraseña maestra'), `${MASTER}{Enter}`);
    await screen.findByRole('button', { name: 'Nueva entrada' }, { timeout: 5000 });
    act(() => void window.dispatchEvent(new Event('pagehide')));
    expect(screen.getByRole('heading', { name: 'Bóveda bloqueada' })).toBeInTheDocument();
  });
});

describe('Asistente', () => {
  const GOOGLE = 'POST /v1beta/openai/chat/completions';
  const answer = (message: object) => ({ choices: [{ message }] });
  const ready = () => localStorage.setItem('dyc.assistant', JSON.stringify({ apiKey: 'clave-de-prueba', model: 'gemini-flash-latest', seenPrivacy: true }));
  afterEach(() => localStorage.clear());

  it('antes de usarlo pide la clave, la guarda solo en este navegador y explica qué se envía', async () => {
    withApi();
    renderAt('/asistente');
    expect(await screen.findByRole('heading', { name: 'Antes de empezar: qué se envía a Google' })).toBeInTheDocument();
    expect(screen.getByText(/Nunca: tu Bóveda, tus notas, el texto de tu diario/)).toBeInTheDocument();
    expect(screen.getByLabelText('Mensaje para el asistente')).toBeDisabled();
    expect(screen.getByText('Guarda tu clave de Gemini para empezar.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Clave de la API de Gemini'), 'AIza-clave-1234');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar en este navegador' }));
    expect(screen.getByText('••••1234')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('dyc.assistant') as string)).toMatchObject({ apiKey: 'AIza-clave-1234', model: 'gemini-flash-latest' });
    expect(screen.getByLabelText('Mensaje para el asistente')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Entendido' }));
    expect(screen.getByLabelText('Mensaje para el asistente')).toBeEnabled();
    expect(screen.getByRole('switch', { name: 'Incluir un resumen de mis datos' })).not.toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(localStorage.getItem('dyc.assistant')).toBeNull();
    expect(screen.getByLabelText('Clave de la API de Gemini')).toBeInTheDocument();
  });

  it('una acción propuesta solo se escribe al pulsar «Hacer»; «Descartar» no escribe nada', async () => {
    ready();
    let turn = 0;
    const api = withApi({
      [GOOGLE]: () =>
        ++turn === 1
          ? answer({ content: 'Te propongo esto:', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'add_todo', arguments: '{"title":"Comprar pan"}' } }, { id: 'call_2', type: 'function', function: { name: 'log_water', arguments: '{"glasses":2}' } }] })
          : answer({ content: '¡Listo! Ya está en tus **pendientes**.' }),
    });
    renderAt('/asistente');
    await userEvent.type(await screen.findByLabelText('Mensaje para el asistente'), 'Añade comprar pan y 2 vasos de agua{Enter}');

    const todo = await screen.findByRole('group', { name: 'Acción propuesta: Añadir pendiente' });
    expect(within(todo).getByText('Comprar pan')).toBeInTheDocument();
    const water = screen.getByRole('group', { name: 'Acción propuesta: Registrar agua' });
    // Nada se ha escrito todavía y no se puede seguir sin decidir.
    expect(api.calls.filter((c) => c.path.startsWith('/api/v2/modules') && !c.path.includes('/chats') && c.method !== 'GET')).toHaveLength(0);
    expect(screen.getByText('Elige «Hacer» o «Descartar» en la acción propuesta para seguir.')).toBeInTheDocument();
    // La conversación sí se guarda en la cuenta, con sus acciones pendientes.
    await waitFor(() => expect(api.calls.find((c) => c.method === 'POST' && c.path === '/api/v2/modules/chats')?.body).toMatchObject({ item: { title: 'Añade comprar pan y 2 vasos de agua', cards: { call_1: { status: 'pending' } } } }));
    const google = api.calls.find((c) => c.path === '/v1beta/openai/chat/completions');
    expect(google?.auth).toBe('Bearer clave-de-prueba');
    const first = google?.body as { model: string; messages: Array<{ role: string; content: string }> };
    expect(first.model).toBe('gemini-flash-latest');
    // El resumen de datos está desactivado: no se envían.
    expect(JSON.stringify(first)).not.toContain('Pagar la luz');

    await userEvent.click(within(todo).getByRole('button', { name: 'Hacer' }));
    expect(await screen.findByRole('group', { name: 'Hecho: Añadir pendiente' })).toBeInTheDocument();
    const posts = api.calls.filter((c) => c.method === 'POST' && c.path === '/api/v2/modules/todos');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toMatchObject({ item: { title: 'Comprar pan', done: false } });
    await userEvent.click(within(water).getByRole('button', { name: 'Descartar' }));
    expect(screen.getByRole('group', { name: 'Descartado: Registrar agua' })).toBeInTheDocument();
    expect(api.calls.filter((c) => c.path === '/api/v2/modules/dayLog')).toHaveLength(0);

    // El siguiente mensaje lleva el resultado de cada acción; el resumen de datos, solo si se activa.
    await userEvent.click(screen.getByRole('switch', { name: 'Incluir un resumen de mis datos' }));
    await userEvent.click(screen.getByText('Ver exactamente lo que se enviará'));
    expect(screen.getByLabelText('Resumen de tus datos que se enviará')).toHaveTextContent('Pagar la luz');
    await userEvent.type(screen.getByLabelText('Mensaje para el asistente'), 'Gracias{Enter}');
    expect(await screen.findByText('pendientes', { selector: 'strong' })).toBeInTheDocument();
    const second = api.calls.filter((c) => c.path === '/v1beta/openai/chat/completions')[1].body as { messages: Array<{ role: string; content: string | null; tool_call_id?: string }> };
    expect(second.messages.filter((m) => m.role === 'tool')).toEqual([
      { role: 'tool', tool_call_id: 'call_1', content: 'Hecho. Pendiente añadido: «Comprar pan».' },
      { role: 'tool', tool_call_id: 'call_2', content: 'La persona descartó esta acción: no se hizo nada.' },
    ]);
    expect(second.messages[0].content).toContain('Pagar la luz');
  });

  it('errores claros y un reintento con el modelo ligero', async () => {
    ready();
    let n = 0;
    withApi({ [GOOGLE]: () => (++n === 1 ? [429, { error: { message: 'exhausted' } }] : n === 2 ? answer({ content: 'Hola, ¿en qué te ayudo?' }) : [401, { error: { message: 'bad key' } }]) });
    renderAt('/asistente');
    await userEvent.type(await screen.findByLabelText('Mensaje para el asistente'), 'Hola{Enter}');
    expect(await screen.findByText('Hola, ¿en qué te ayudo?')).toBeInTheDocument();
    expect(screen.getByText('gemini-flash-latest no respondió; se usó gemini-flash-lite-latest.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Mensaje para el asistente'), 'Otra{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Google no aceptó tu clave');
    // El mensaje vuelve al cuadro para reintentarlo.
    expect(screen.getByLabelText('Mensaje para el asistente')).toHaveValue('Otra');
  });
});

describe('Asistente: archivos e historial', () => {
  const GOOGLE = 'POST /v1beta/openai/chat/completions';
  const answer = (message: object) => ({ choices: [{ message }] });
  const ready = () => localStorage.setItem('dyc.assistant', JSON.stringify({ apiKey: 'clave-de-prueba', model: 'gemini-flash-latest', seenPrivacy: true }));
  afterEach(() => localStorage.clear());

  it('adjunta un archivo de texto, lo envía a Gemini y guarda la conversación en el historial', async () => {
    ready();
    const api = withApi({ [GOOGLE]: () => answer({ content: 'Dice «hola mundo».' }) });
    const { container } = renderAt('/asistente');
    await screen.findByLabelText('Mensaje para el asistente');
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    await userEvent.upload(input, new File(['x'], 'informe.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), { applyAccept: false });
    expect(await screen.findByRole('alert')).toHaveTextContent('«informe.docx» no se puede leer');

    await userEvent.upload(input, new File(['hola mundo'], 'notas.txt', { type: 'text/plain' }), { applyAccept: false });
    const pending = await screen.findByRole('list', { name: 'Archivos para enviar' });
    expect(within(pending).getByText('notas.txt')).toBeInTheDocument();
    // Con un archivo se puede enviar sin escribir nada.
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeEnabled();
    await userEvent.type(screen.getByLabelText('Mensaje para el asistente'), 'Resume esto{Enter}');

    expect(await screen.findByText('Dice «hola mundo».')).toBeInTheDocument();
    const sent = api.calls.find((c) => c.path === '/v1beta/openai/chat/completions')?.body as { messages: Array<{ role: string; content: unknown }> };
    expect(sent.messages[1].content).toEqual([
      { type: 'text', text: 'Archivo adjunto «notas.txt»:\n\nhola mundo' },
      { type: 'text', text: 'Resume esto' },
    ]);
    const log = screen.getByRole('log', { name: 'Mensajes' });
    expect(within(log).getByRole('list', { name: 'Archivos adjuntos' })).toHaveTextContent('notas.txt');

    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST' && c.path === '/api/v2/modules/chats')).toBe(true));
    const saved = api.calls.find((c) => c.path === '/api/v2/modules/chats')?.body as { item: { title: string; messages: Array<{ attachments?: Array<{ text?: string }> }> } };
    expect(saved.item.title).toBe('Resume esto');
    expect(saved.item.messages[0].attachments?.[0].text).toBe('hola mundo');
    const history = await screen.findByRole('list', { name: 'Conversaciones guardadas' });
    expect(within(history).getByRole('button', { name: /^Resume esto/ })).toHaveAttribute('aria-current', 'true');
  });

  it('abre una conversación guardada con sus imágenes, sigue en ella y la borra', async () => {
    ready();
    const api = withApi(
      {
        [GOOGLE]: () => answer({ content: 'Sigo aquí.' }),
        'POST /api/images/fetch': () => ({ images: { ai_foto: 'data:image/jpeg;base64,AAAA' } }),
        'POST /api/images/delete': () => ({ ok: true, count: 1 }),
      },
      (doc) => {
        doc.chats = [
          {
            id: 'ch1',
            title: 'Mi horario',
            model: 'gemini-flash-latest',
            updatedAt: '2026-09-20T10:00:00.000Z',
            messages: [
              { role: 'user', content: 'Mi horario', attachments: [{ name: 'horario.jpg', mime: 'image/jpeg', kind: 'image', size: 10, ref: 'ai_foto' }] },
              { role: 'assistant', content: 'Veo tres clases.' },
            ],
            cards: {},
          },
        ];
      },
    );
    renderAt('/asistente');
    const history = await screen.findByRole('list', { name: 'Conversaciones guardadas' });
    await userEvent.click(within(history).getByRole('button', { name: /^Mi horario/ }));
    expect(await screen.findByText('Veo tres clases.')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'horario.jpg' })).toHaveAttribute('src', 'data:image/jpeg;base64,AAAA');

    await userEvent.type(screen.getByLabelText('Mensaje para el asistente'), '¿Y el viernes?{Enter}');
    expect(await screen.findByText('Sigo aquí.')).toBeInTheDocument();
    const sent = api.calls.find((c) => c.path === '/v1beta/openai/chat/completions')?.body as { messages: Array<{ role: string; content: unknown }> };
    // La imagen de antes vuelve a ir a Gemini para que la conversación tenga sentido.
    expect(sent.messages[1].content).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
      { type: 'text', text: 'Mi horario' },
    ]);
    await waitFor(() => expect(api.calls.find((c) => c.method === 'PATCH' && c.path === '/api/v2/modules/chats/ch1')).toBeTruthy());
    const patch = api.calls.find((c) => c.method === 'PATCH' && c.path === '/api/v2/modules/chats/ch1')?.body as { messages: unknown[] };
    expect(patch.messages).toHaveLength(4);
    expect(JSON.stringify(patch)).not.toContain('base64');

    await userEvent.click(within(history).getByRole('button', { name: 'Borrar «Mi horario»' }));
    await userEvent.click(within(history).getByRole('button', { name: 'Borrar definitivamente' }));
    await waitFor(() => expect(api.calls.find((c) => c.method === 'DELETE' && c.path === '/api/v2/modules/chats/ch1')).toBeTruthy());
    expect(api.calls.find((c) => c.path === '/api/images/delete')?.body).toEqual({ ids: ['ai_foto'] });
    expect(await screen.findByText(/Tus conversaciones aparecerán aquí/)).toBeInTheDocument();
  });
});

describe('Emprendimientos', () => {
  it('crea un emprendimiento y guarda una nota, un enlace y un archivo', async () => {
    const api = withApi({ 'POST /api/images': (b) => ({ ok: true, count: Object.keys((b as { images: object }).images).length }) }, (doc) => {
      doc.ventures = [];
      doc.ventureItems = [];
    });
    const { container } = renderAt('/emprendimientos');
    expect(await screen.findByText('Guarda aquí cada negocio o proyecto')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Crear el primero' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo emprendimiento' });
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Café Brote');
    await userEvent.selectOptions(within(dialog).getByLabelText('Etapa'), 'Validando');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear emprendimiento' }));
    expect(writes(api)[0]).toMatchObject({ method: 'POST', path: '/api/v2/modules/ventures', body: { item: { name: 'Café Brote', stage: 'validando' } } });
    // Se abre su página.
    expect(await screen.findByRole('heading', { level: 1, name: 'Café Brote' })).toBeInTheDocument();
    const ventureId = (writes(api)[0].body as { item: { id: string } }).item.id;

    await userEvent.click(screen.getByRole('button', { name: 'Nota' }));
    const note = screen.getByRole('dialog', { name: 'Nueva nota' });
    await userEvent.type(within(note).getByLabelText('Título'), 'Plan');
    await userEvent.type(within(note).getByLabelText('Texto'), '- Buscar local');
    await userEvent.click(within(note).getByRole('button', { name: 'Guardar nota' }));
    expect(writes(api).at(-1)).toMatchObject({ path: '/api/v2/modules/ventureItems', body: { item: { ventureId, kind: 'note', title: 'Plan', text: '- Buscar local' } } });

    await userEvent.click(screen.getByRole('button', { name: 'Enlace' }));
    const link = screen.getByRole('dialog', { name: 'Nuevo enlace' });
    await userEvent.type(within(link).getByLabelText('Enlace'), 'instagram.com/cafebrote');
    await userEvent.click(within(link).getByRole('button', { name: 'Guardar enlace' }));
    expect(writes(api).at(-1)).toMatchObject({ body: { item: { kind: 'link', url: 'https://instagram.com/cafebrote' } } });
    expect(await screen.findByRole('link', { name: /instagram\.com\/cafebrote/ })).toHaveAttribute('target', '_blank');

    const files = container.querySelector('input[aria-label="Elegir archivos"]') as HTMLInputElement;
    await userEvent.upload(files, new File(['%PDF-1.4'], 'menu.pdf', { type: 'application/pdf' }));
    await waitFor(() => expect(writes(api).at(-1)).toMatchObject({ path: '/api/v2/modules/ventureItems', body: { item: { kind: 'file', title: 'menu.pdf', mime: 'application/pdf', size: 8 } } }));
    const upload = api.calls.find((c) => c.path === '/api/images')?.body as { images: Record<string, string> };
    const [ref] = Object.keys(upload.images);
    expect(ref).toMatch(/^vf_/);
    expect(upload.images[ref]).toMatch(/^data:application\/pdf;base64,/);
    expect((writes(api).at(-1)?.body as { item: { ref: string } }).item.ref).toBe(ref);
    expect(await screen.findByRole('button', { name: 'Descargar «menu.pdf»' })).toBeInTheDocument();
    expect(screen.getByText('1 nota · 1 archivo · 1 enlace')).toBeInTheDocument();
  });

  it('al borrar un emprendimiento se borran también sus archivos', async () => {
    const api = withApi({ 'POST /api/images/fetch': () => ({ images: { vf_1: 'data:image/jpeg;base64,AAAA' } }), 'POST /api/images/delete': () => ({ ok: true, count: 1 }) }, (doc) => {
      doc.ventures = [{ id: 'v1', name: 'Tienda', description: 'Stickers', stage: 'lanzado', color: '#4F7CFF' }];
      doc.ventureItems = [{ id: 'i1', ventureId: 'v1', kind: 'image', title: 'Logo', text: '', url: '', ref: 'vf_1', mime: 'image/jpeg', size: 9, date: '' }];
    });
    renderAt('/emprendimientos');
    await userEvent.click(await screen.findByRole('link', { name: /Tienda/ }));
    expect(await screen.findByRole('button', { name: 'Ver «Logo»' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar emprendimiento' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Borrar' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Borrar definitivamente' }));
    await waitFor(() => expect(api.calls.find((c) => c.method === 'DELETE' && c.path === '/api/v2/modules/ventures/v1')).toBeTruthy());
    expect(api.calls.find((c) => c.path === '/api/images/delete')?.body).toEqual({ ids: ['vf_1'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Emprendimientos' })).toBeInTheDocument();
  });
});

describe('Sugerencias de cada sección', () => {
  const GOOGLE = 'POST /v1beta/openai/chat/completions';
  afterEach(() => localStorage.clear());

  it('sin clave de Gemini lleva al Asistente', async () => {
    withApi();
    renderAt('/pendientes');
    await userEvent.click(await screen.findByRole('button', { name: 'Sugerencias' }));
    const dialog = screen.getByRole('dialog', { name: 'Sugerencias para Pendientes' });
    expect(within(dialog).getByRole('link', { name: 'Ir al Asistente' })).toHaveAttribute('href', '/asistente');
  });

  it('pide sugerencias con los datos de la sección y «Hacer» aplica la elegida', async () => {
    localStorage.setItem('dyc.assistant', JSON.stringify({ apiKey: 'clave-de-prueba', model: 'gemini-flash-latest', seenPrivacy: true }));
    const call = (id: string, args: object) => ({ id, type: 'function', function: { name: 'suggest_change', arguments: JSON.stringify(args) } });
    const api = withApi({
      [GOOGLE]: () => ({
        choices: [
          {
            message: {
              content: 'Dos ideas para tus pendientes.',
              tool_calls: [
                call('a', { title: 'Divide «Mudanza» en pasos', reason: 'Así sabes por dónde empezar.', action: 'add', key: 'subtasks', fields: JSON.stringify([{ todoId: 'td2', title: 'Etiquetar cajas' }, { todoId: 'td2', title: 'Contratar camión' }]) }),
                call('b', { title: 'Añade «Pagar internet»', reason: 'Vence pronto.', action: 'add', key: 'todos', fields: '{"title":"Pagar internet"}' }),
              ],
            },
          },
        ],
      }),
    });
    renderAt('/pendientes');
    await userEvent.click(await screen.findByRole('button', { name: 'Sugerencias' }));
    const dialog = screen.getByRole('dialog', { name: 'Sugerencias para Pendientes' });
    await userEvent.click(within(dialog).getByText('Ver lo que se enviará'));
    expect(within(dialog).getByLabelText('Datos de esta sección que se enviarán')).toHaveTextContent('Pedir cajas');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pedir sugerencias' }));

    const split = await within(dialog).findByRole('group', { name: 'Sugerencia: Divide «Mudanza» en pasos' });
    expect(within(split).getByText('Así sabes por dónde empezar.')).toBeInTheDocument();
    expect(within(split).getByText('Etiquetar cajas')).toBeInTheDocument();
    const sent = api.calls.find((c) => c.path === '/v1beta/openai/chat/completions')?.body as { tools: Array<{ function: { name: string } }>; messages: Array<{ content: string }> };
    expect(sent.tools[0].function.name).toBe('suggest_change');
    expect(sent.messages[1].content).toContain('Pedir cajas');
    // Nada se escribe hasta pulsar «Hacer».
    expect(writes(api).map((c) => c.path)).toEqual(['/v1beta/openai/chat/completions']);

    await userEvent.click(within(split).getByRole('button', { name: 'Hacer' }));
    expect(await within(dialog).findByRole('group', { name: 'Hecho: Divide «Mudanza» en pasos' })).toBeInTheDocument();
    const posts = writes(api).filter((c) => c.path === '/api/v2/modules/subtasks');
    expect(posts.map((p) => (p.body as { item: { title: string; todoId: string } }).item)).toMatchObject([
      { title: 'Etiquetar cajas', todoId: 'td2' },
      { title: 'Contratar camión', todoId: 'td2' },
    ]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Descartar' }));
    expect(within(dialog).getByRole('group', { name: 'Descartado: Añade «Pagar internet»' })).toBeInTheDocument();
    expect(writes(api).filter((c) => c.path === '/api/v2/modules/todos')).toHaveLength(0);

    // «Pedir otras» avisa al modelo de lo que ya propuso.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pedir otras' }));
    await waitFor(() => expect(api.calls.filter((c) => c.path === '/v1beta/openai/chat/completions')).toHaveLength(2));
    const again = api.calls.filter((c) => c.path === '/v1beta/openai/chat/completions')[1].body as { messages: Array<{ content: string }> };
    expect(again.messages[1].content).toContain('«Divide «Mudanza» en pasos»');
  });

  it('no aparece en secciones sin sugerencias', async () => {
    withApi();
    renderAt('/asistente');
    await screen.findByLabelText('Mensaje para el asistente');
    expect(screen.queryByRole('button', { name: 'Sugerencias' })).not.toBeInTheDocument();
  });
});

describe('Alarmas', () => {
  afterEach(() => localStorage.removeItem('dyc-alarmas'));

  it('suena a la hora de una tarea con aviso y se detiene', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date(2026, 8, 25, 9, 59, 40));
    localStorage.setItem(
      'dyc-alarmas',
      JSON.stringify({
        enabled: true,
        classes: false,
        reminders: false,
        tasks: true,
      }),
    );
    withApi({}, (doc) => {
      doc.tasks = [
        {
          id: 'tk',
          title: 'Llamar al dentista',
          pri: 'media',
          time: '10:00',
          rem: true,
          done: false,
          tags: '',
        },
      ];
    });
    renderAt('/');
    await screen.findAllByRole('link', { name: /^Hoy$/ });
    // Que lleguen los datos antes de que pase el tiempo.
    await act(() => new Promise((r) => setTimeout(r, 100)));
    act(() => vi.advanceTimersByTime(30_000));
    const alarm = await screen.findByRole('alertdialog', {
      name: 'Tarea: Llamar al dentista',
    });
    await userEvent.click(within(alarm).getByRole('button', { name: 'Detener' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('Buscadores', () => {
  it('Ideas filtra sin tildes y dice cuántas quedan', async () => {
    withApi();
    renderAt('/ideas');
    expect(await screen.findByRole('article', { name: 'App de hábitos' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Buscar en tus ideas'), 'HABITOS');
    expect(screen.getByRole('article', { name: 'App de hábitos' })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Landing para portfolio' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 resultado.');
    await userEvent.clear(screen.getByLabelText('Buscar en tus ideas'));
    await userEvent.type(screen.getByLabelText('Buscar en tus ideas'), 'zzz');
    expect(screen.getByText('Nada coincide con «zzz».')).toBeInTheDocument();
  });
});

describe('Check-in con lo que ya registraste', () => {
  it('trae el agua y la gratitud de tus herramientas, pone tus pilares primero y pliega los demás', async () => {
    const today = utcDayKey();
    const api = withApi(
      {
        'GET /api/v2/checkins': () => ({ from: today, to: today, checkIns: [] }),
        'PUT /api/v2/checkins/:date': (b) => ({ checkIn: { date: today, ...(b as object) } }),
      },
      (doc) => {
        (doc as unknown as Record<string, unknown>).dayLog = { dateKey: today, water: 6, waterGoal: 8 };
        doc.journal = [{ id: 'jj', date: today, mood: '', gratitude: 'El café de la mañana', note: '' }];
      },
    );
    renderAt('/check-in');
    const water = await screen.findByLabelText('Vasos de agua');
    expect(water).toHaveValue(6);
    expect(screen.getByText(/Ya registrado en Rutina/)).toBeInTheDocument();
    expect(screen.getByLabelText('Algo que agradeces')).toHaveValue('El café de la mañana');
    // El perfil de prueba elige Descanso: va arriba; Pareja queda en «Otros pilares».
    const more = screen.getByText(/Otros pilares/).closest('details') as HTMLDetailsElement;
    expect(within(more).getByRole('group', { name: 'Conexión con tu pareja' })).toBeInTheDocument();
    expect(more.querySelector('[data-pillar="descanso"]')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar check-in' }));
    await waitFor(() => expect(checkInSyncs(api)[0]).toMatchObject({ body: { water: 6, gratitude: 'El café de la mañana' } }));
    // Nada cambió en Rutina ni en el Diario: no se reescriben.
    expect(writes(api)).toHaveLength(0);
  });
});
