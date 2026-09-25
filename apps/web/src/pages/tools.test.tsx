import { reorderById, utcDayKey } from '@dyc/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenStore } from '../app/api';
import { AppRoutes, makeQueryClient, Providers } from '../app/App';
import { fakeFetch, legacyDoc, profile, USER, type Handler } from '../test/fakeApi';

// Herramientas de la app anterior (tanda 1) contra una API falsa.

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

describe('Más', () => {
  it('enlaza las cinco herramientas con sus cuentas y deja el resto para la app anterior', async () => {
    withApi();
    renderAt('/mas');
    const tools = await screen.findByRole('region', { name: 'Herramientas' });
    expect(within(tools).getByRole('link', { name: /Agenda.*4 elementos/ })).toHaveAttribute('href', '/agenda');
    expect(within(tools).getByRole('link', { name: /Pendientes.*2 por hacer/ })).toHaveAttribute('href', '/pendientes');
    expect(within(tools).getByRole('link', { name: /Horario.*1 clase/ })).toBeInTheDocument();
    expect(within(tools).getByRole('link', { name: /Enfoque.*1 sesión/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Vida personal' })).toHaveTextContent('1 movimiento');
    expect(screen.getByRole('region', { name: 'Trabajo y estudio' })).toHaveTextContent('1 materia');
  });
});
