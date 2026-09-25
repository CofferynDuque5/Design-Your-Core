import { expect, test, type Page } from '@playwright/test';
import { onboard, readLegacy, register, seedLegacy } from './helpers';

// Herramientas de la app anterior (tandas 1 y 2) contra la API real. Cada recorrido
// comprueba además que el documento de /api/sync (el que lee la app anterior)
// conserva sus formatos y las claves que la app nueva no conoce.

// Escrituras en curso contra /api/v2/modules. Recargar con cambios en cola los
// cancela, así que las recargas esperan a que no quede ninguna.
const pending = new WeakMap<Page, number>();
const isWrite = (method: string, url: string) => method !== 'GET' && url.includes('/api/v2/modules');
test.beforeEach(({ page }) => {
  pending.set(page, 0);
  page.on('request', (r) => isWrite(r.method(), r.url()) && pending.set(page, (pending.get(page) ?? 0) + 1));
  const done = (r: { method(): string; url(): string }) => isWrite(r.method(), r.url()) && pending.set(page, (pending.get(page) ?? 0) - 1);
  page.on('requestfinished', done);
  page.on('requestfailed', done);
});

async function reloadWhenSaved(page: Page) {
  // Dos lecturas seguidas a cero: la cola envía la siguiente escritura al terminar la anterior.
  await expect.poll(async () => {
    if (pending.get(page)) return false;
    await page.waitForTimeout(300);
    return !pending.get(page);
  }).toBe(true);
  await page.reload();
}

const OLD = {
  habits: [{ id: 'h1', label: 'Leer', icon: 'read', streak: 3, done: false, progress: 0 }],
  cycle: { cycleLength: 28, periodLength: 5 },
  claveFutura: { de: 'la app anterior' },
};

test('agenda: bloques del día y tareas por prioridad', async ({ page }) => {
  await register(page, 'agenda');
  await onboard(page);
  await seedLegacy(page, OLD);
  await page.goto('/agenda');
  await expect(page.getByRole('heading', { name: 'Tu día está en blanco' })).toBeVisible();

  await page.getByRole('button', { name: 'Nuevo bloque' }).click();
  let dialog = page.getByRole('dialog', { name: 'Nuevo bloque' });
  await dialog.getByLabel('Nombre').fill('Repasar apuntes');
  await dialog.getByLabel('Empieza').selectOption({ label: '10:00' });
  await dialog.getByLabel('Duración').selectOption({ label: '2 h' });
  await dialog.getByRole('button', { name: 'Añadir bloque' }).click();
  await page.getByRole('button', { name: /Editar «Repasar apuntes», 10:00 a 12:00, Estudio/ }).click();
  dialog = page.getByRole('dialog', { name: 'Editar bloque' });
  await dialog.getByLabel('Nombre').fill('Repasar física');
  await dialog.getByRole('radio', { name: 'Proyecto' }).check();
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await reloadWhenSaved(page);
  await expect(page.getByRole('button', { name: /Editar «Repasar física», 10:00 a 12:00, Proyecto/ })).toBeVisible();

  await page.getByRole('button', { name: 'Tareas' }).click();
  await expect(page).toHaveURL(/vista=tareas/);
  await page.getByLabel('Nueva tarea').fill('Entregar ensayo');
  await page.getByRole('radio', { name: 'Alta' }).check();
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  const alta = page.getByRole('region', { name: /Alta/ });
  await alta.getByRole('checkbox', { name: 'Entregar ensayo' }).click();
  await expect(alta.getByRole('checkbox', { name: 'Entregar ensayo' })).toBeChecked();
  await expect(alta.getByText('1 de 1 hechas')).toBeAttached();
  await reloadWhenSaved(page);
  await expect(page.getByRole('region', { name: /Alta/ }).getByRole('checkbox', { name: 'Entregar ensayo' })).toBeChecked();

  const doc = await readLegacy(page);
  expect(doc.blocks).toEqual([expect.objectContaining({ label: 'Repasar física', sub: '', start: 10, dur: 2, kind: 'project' })]);
  expect(doc.tasks).toEqual([expect.objectContaining({ title: 'Entregar ensayo', pri: 'alta', done: true, time: null, rem: false, tags: '' })]);
  expect(doc).toMatchObject(OLD);
});

test('pendientes: añadir, subtareas, reordenar, renombrar y borrar', async ({ page }) => {
  await register(page, 'pendientes');
  await onboard(page);
  await seedLegacy(page, { ...OLD, todos: [{ id: 'id_viejo', title: 'Pagar la luz', done: false }], subtasks: [] });
  await page.goto('/pendientes');
  await expect(page.getByRole('heading', { name: /1 por hacer/ })).toBeVisible();

  await page.getByLabel('Nuevo pendiente').fill('Organizar mudanza');
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(page.getByRole('heading', { name: /2 por hacer/ })).toBeVisible();

  await page.getByRole('button', { name: 'Subtareas de «Organizar mudanza»' }).click();
  await page.getByLabel('Nueva subtarea de «Organizar mudanza»').fill('Pedir cajas');
  await page.getByRole('button', { name: 'Añadir paso' }).click();
  await page.getByRole('checkbox', { name: 'Pedir cajas' }).click();
  await expect(page.getByRole('checkbox', { name: 'Pedir cajas' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Subtareas de «Organizar mudanza»: 1 de 1 hechas' })).toBeVisible();

  await page.getByRole('button', { name: 'Subir «Organizar mudanza»' }).click();
  await expect(page.getByRole('button', { name: 'Subir «Organizar mudanza»' })).toBeDisabled();
  await page.getByRole('button', { name: 'Renombrar «Pagar la luz»' }).click();
  await page.getByLabel('Nuevo nombre de «Pagar la luz»').fill('Pagar la luz y el agua');
  await page.keyboard.press('Enter');
  await page.getByRole('checkbox', { name: 'Pagar la luz y el agua' }).click();
  await expect(page.getByRole('checkbox', { name: 'Pagar la luz y el agua' })).toBeChecked();
  await expect(page.getByRole('heading', { name: /1 por hacer/ })).toBeVisible();
  // Antes de recargar, esperar a que el servidor tenga todos los cambios: recargar
  // con escrituras en cola las cancela.
  await expect
    .poll(async () => (await readLegacy(page)).todos)
    .toEqual([expect.objectContaining({ title: 'Organizar mudanza' }), { id: 'id_viejo', title: 'Pagar la luz y el agua', done: true }]);

  await reloadWhenSaved(page);
  await expect(page.getByRole('heading', { name: /1 por hacer/ })).toBeVisible();
  const items = page.locator('.todo-list > li');
  await expect(items.first()).toContainText('Organizar mudanza');
  await expect(page.getByRole('checkbox', { name: 'Pagar la luz y el agua' })).toBeChecked();

  await page.getByRole('button', { name: 'Borrar «Organizar mudanza»' }).click();
  await expect(page.getByRole('checkbox', { name: 'Organizar mudanza' })).toHaveCount(0);
  await expect.poll(async () => (await readLegacy(page)).subtasks).toEqual([]);
  const doc = await readLegacy(page);
  expect(doc.todos).toEqual([{ id: 'id_viejo', title: 'Pagar la luz y el agua', done: true }]);
  expect(doc).toMatchObject(OLD);
});

test('calendario: eventos de cada mes y marcas de otras secciones', async ({ page }) => {
  await register(page, 'calendario');
  await onboard(page);
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  await seedLegacy(page, {
    ...OLD,
    reminders: [{ id: 'r1', day: 14, title: 'Dentista', when: '14:00', color: '#4F7CFF', icon: 'doc', on: true }],
    workouts: [{ id: 'w1', date: `${ym}-14`, plan: 'Full body', minutes: 30 }],
    goals: [{ id: 'g1', title: 'Publicar 8 videos', target: 8, current: 2, unit: 'videos', deadline: `${ym}-20`, category: 'creador', done: false }],
  });
  await page.goto('/calendario');
  await page.getByRole('button', { name: / 14 de .*: 1 evento, entreno/ }).click();
  await expect(page.getByText('Dentista', { exact: true })).toBeVisible();
  await expect(page.getByText('Entreno: Full body')).toBeVisible();
  await expect(page.getByRole('button', { name: / 20 de .*: meta/ })).toBeVisible();

  await page.getByRole('switch', { name: 'Activo: «Dentista»' }).click();
  await expect(page.getByRole('switch', { name: 'Activo: «Dentista»' })).not.toBeChecked();
  await expect(page.getByRole('button', { name: / 14 de .*: entreno$/ })).toBeVisible();

  await page.getByRole('button', { name: 'Nuevo evento' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo evento' });
  await dialog.getByLabel('Título').fill('Pagar renta');
  await dialog.getByLabel('Día del mes').selectOption('3');
  await dialog.getByRole('radio', { name: 'Rojo' }).check();
  await dialog.getByRole('button', { name: 'Añadir evento' }).click();
  await page.getByRole('button', { name: 'Mes siguiente' }).click();
  await page.getByRole('button', { name: / 3 de .*: 1 evento/ }).click();
  await page.getByRole('button', { name: 'Editar «Pagar renta»' }).click();
  await page.getByRole('dialog', { name: 'Editar evento' }).getByLabel('Hora o nota (opcional)').fill('09:00');
  await page.getByRole('dialog', { name: 'Editar evento' }).getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText(/09:00 · día 3 de cada mes/)).toBeVisible();

  await expect.poll(async () => (await readLegacy(page)).reminders).toEqual([
    { id: 'r1', day: 14, title: 'Dentista', when: '14:00', color: '#4F7CFF', icon: 'doc', on: false },
    expect.objectContaining({ day: 3, title: 'Pagar renta', when: '09:00', color: '#E5484D', icon: 'doc', on: true }),
  ]);
  expect(await readLegacy(page)).toMatchObject(OLD);
});

test('horario: clase desde una materia, próxima clase y edición', async ({ page }) => {
  await register(page, 'horario');
  await onboard(page);
  await seedLegacy(page, { ...OLD, subjects: [{ id: 'mat1', name: 'Física', teacher: '', room: 'B-3', color: '#22B8CF', nextClass: '', topics: [] }] });
  await page.goto('/horario');
  await expect(page.getByRole('heading', { name: 'Tu horario está vacío' })).toBeVisible();

  await page.getByRole('button', { name: 'Nueva clase' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva clase' });
  await dialog.getByLabel('Materia').selectOption({ label: 'Física' });
  await expect(dialog.getByLabel('Aula (opcional)')).toHaveValue('B-3');
  await dialog.getByLabel('Día').selectOption({ label: 'Martes' });
  await dialog.getByLabel('Empieza').fill('10:00');
  await dialog.getByLabel('Termina').fill('11:30');
  await dialog.getByRole('button', { name: 'Añadir clase' }).click();

  await expect(page.getByText(/Próxima clase|Clase en curso/)).toBeVisible();
  await page.getByRole('button', { name: /Física, martes de 10:00 a 11:30, aula B-3/ }).click();
  const edit = page.getByRole('dialog', { name: 'Editar clase' });
  await edit.getByLabel('Aula (opcional)').fill('Lab 2');
  await edit.getByRole('button', { name: 'Guardar' }).click();
  await reloadWhenSaved(page);
  await expect(page.getByRole('button', { name: /Física, martes de 10:00 a 11:30, aula Lab 2/ })).toBeVisible();

  const doc = await readLegacy(page);
  expect(doc.classes).toEqual([expect.objectContaining({ day: 2, start: '10:00', end: '11:30', title: 'Física', room: 'Lab 2', color: '#22B8CF', subject: 'mat1' })]);
  expect(doc).toMatchObject(OLD);
});

test('enfoque: una sesión saltada se guarda y cuenta', async ({ page }) => {
  await register(page, 'enfoque');
  await onboard(page);
  await seedLegacy(page, OLD);
  await page.clock.install();
  await page.goto('/enfoque');
  await expect(page.getByRole('timer')).toHaveText('25:00');
  await page.getByRole('button', { name: 'Empezar' }).click();
  await page.clock.fastForward('02:00');
  await expect(page.getByRole('timer')).toHaveText('23:00');
  await expect(page).toHaveTitle('23:00 · Enfoque');
  await page.getByRole('button', { name: 'Pausar' }).click();
  await page.getByRole('button', { name: 'Saltar' }).click();
  await expect(page.getByRole('button', { name: 'Descanso corto' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('timer')).toHaveText('05:00');

  await reloadWhenSaved(page);
  await expect(page.locator('.stat', { hasText: 'Sesiones hoy' }).locator('.stat__value')).toHaveText('1');
  const doc = await readLegacy(page);
  expect(doc.focus).toEqual([expect.objectContaining({ mode: 'focus', seconds: 120, dateKey: new Date().toISOString().slice(0, 10) })]);
  expect(doc).toMatchObject(OLD);
});

// ---------- Tanda 2: Materias, Proyectos, Roadmaps, Cuadernos, Contenido e Ideas ----------

test('materias: temas, horario, renombrar con sus proyectos y borrar sin tocar las clases', async ({ page }) => {
  await register(page, 'materias');
  await onboard(page);
  await seedLegacy(page, {
    ...OLD,
    subjects: [{ id: 'mat1', name: 'Física', teacher: 'Prof. Ruiz', room: 'B-3', color: '#22B8CF', nextClass: 'Lunes 8:00', topics: [{ id: 'xk2m9ab', name: 'Ondas', done: true }] }],
    projects: [{ id: 'id_p1', title: 'Maqueta', subject: 'Física', deadline: '20 SEP', status: 'curso', color: '#22B8CF', milestones: [] }],
    classes: [],
  });
  await page.goto('/materias');
  const card = page.getByRole('article', { name: 'Física' });
  await expect(card.getByRole('progressbar', { name: 'Avance de Física' })).toHaveAttribute('aria-valuenow', '100');
  await card.getByRole('button', { name: 'Temas · 1/1' }).click();
  await card.getByLabel('Nuevo tema de «Física»').fill('Óptica');
  await card.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(card.getByRole('checkbox', { name: 'Óptica' })).not.toBeChecked();
  await expect(card.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  await card.getByRole('button', { name: 'Añadir «Física» al horario' }).click();
  await expect(page.getByText(/añadida al Horario/)).toBeVisible();

  await page.getByRole('button', { name: 'Editar «Física»' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar materia' });
  await dialog.getByLabel('Nombre').fill('Física I');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('article', { name: 'Física I' })).toBeVisible();

  await expect
    .poll(async () => {
      const doc = await readLegacy(page);
      return [doc.subjects, doc.projects, doc.classes];
    })
    .toEqual([
      [
        {
          id: 'mat1',
          name: 'Física I',
          teacher: 'Prof. Ruiz',
          room: 'B-3',
          color: '#22B8CF',
          nextClass: 'Lunes 8:00',
          topics: [{ id: 'xk2m9ab', name: 'Ondas', done: true }, expect.objectContaining({ name: 'Óptica', done: false })],
        },
      ],
      [expect.objectContaining({ id: 'id_p1', subject: 'Física I' })],
      [expect.objectContaining({ day: 1, start: '08:00', end: '09:30', title: 'Física', room: 'B-3', color: '#22B8CF', subject: 'mat1' })],
    ]);
  await reloadWhenSaved(page);
  await expect(page.getByRole('article', { name: 'Física I' }).getByText('Lun 08:00 · B-3')).toBeVisible();

  await page.getByRole('button', { name: 'Editar «Física I»' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
  await page.getByRole('button', { name: 'Borrar definitivamente' }).click();
  await expect(page.getByRole('heading', { name: 'Aún no tienes materias' })).toBeVisible();
  await expect.poll(async () => (await readLegacy(page)).subjects).toEqual([]);
  const doc = await readLegacy(page);
  expect(doc.classes).toEqual([expect.objectContaining({ subject: 'mat1' })]);
  expect(doc.projects).toEqual([expect.objectContaining({ subject: 'Física I' })]);
  expect(doc).toMatchObject(OLD);
});

test('proyectos: crear con materia, estado, hitos y filtros', async ({ page }) => {
  await register(page, 'proyectos');
  await onboard(page);
  await seedLegacy(page, { ...OLD, subjects: [{ id: 'mat1', name: 'Historia', teacher: '', room: '', color: '#E8912A', nextClass: '', topics: [] }] });
  await page.goto('/proyectos');
  await expect(page.getByRole('heading', { name: 'Aún no tienes proyectos' })).toBeVisible();

  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo proyecto' });
  await dialog.getByLabel('Nombre').fill('Ensayo de Historia');
  await dialog.getByLabel('Materia').selectOption('Historia');
  await dialog.getByLabel('Entrega (opcional)').fill('20 SEP');
  await dialog.getByRole('button', { name: 'Añadir proyecto' }).click();

  const card = page.getByRole('article', { name: 'Ensayo de Historia' });
  await expect(card.getByText('Entrega · 20 SEP')).toBeVisible();
  await card.getByRole('group', { name: 'Estado de «Ensayo de Historia»' }).getByRole('button', { name: 'En revisión' }).click();
  await expect(card.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '90');
  await card.getByRole('button', { name: /^Hitos/ }).click();
  for (const name of ['Esquema', 'Borrador']) {
    await card.getByLabel('Nuevo hito de «Ensayo de Historia»').fill(name);
    await card.getByRole('button', { name: 'Añadir', exact: true }).click();
    await expect(card.getByRole('checkbox', { name })).toBeVisible();
  }
  await card.getByRole('checkbox', { name: 'Esquema' }).click();
  await expect(card.getByRole('checkbox', { name: 'Esquema' })).toBeChecked();
  await expect(card.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');

  await expect
    .poll(async () => (await readLegacy(page)).projects)
    .toEqual([
      {
        id: expect.any(String),
        title: 'Ensayo de Historia',
        subject: 'Historia',
        deadline: '20 SEP',
        status: 'revision',
        color: '#E8912A',
        milestones: [expect.objectContaining({ name: 'Esquema', date: '', done: true }), expect.objectContaining({ name: 'Borrador', date: '', done: false })],
      },
    ]);
  await reloadWhenSaved(page);
  const show = page.getByRole('group', { name: 'Mostrar' });
  await show.getByRole('button', { name: 'Entregados' }).click();
  await expect(page.getByRole('heading', { name: 'Nada por aquí con este filtro' })).toBeVisible();
  await show.getByRole('button', { name: 'En curso' }).click();
  await expect(page.getByRole('article', { name: 'Ensayo de Historia' })).toBeVisible();
  expect(await readLegacy(page)).toMatchObject(OLD);
});

test('roadmaps: pasos que se desbloquean al completar', async ({ page }) => {
  await register(page, 'roadmaps');
  await onboard(page);
  await seedLegacy(page, OLD);
  await page.goto('/roadmaps');
  await page.getByRole('button', { name: 'Nuevo roadmap' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo roadmap' });
  await dialog.getByLabel('Nombre').fill('Ingeniería de Sistemas');
  await dialog.getByRole('radio', { name: 'Azul' }).check();
  await dialog.getByRole('button', { name: 'Añadir roadmap' }).click();

  const card = page.getByRole('article', { name: 'Ingeniería de Sistemas' });
  for (const name of ['Cálculo I', 'Cálculo II', 'Ecuaciones']) {
    await card.getByLabel('Nuevo paso de «Ingeniería de Sistemas»').fill(name);
    await card.getByRole('button', { name: 'Añadir', exact: true }).click();
    await expect(card.getByRole('list', { name: /^Pasos de/ }).getByText(name, { exact: true })).toBeVisible();
  }
  await card.getByRole('button', { name: 'Marcar «Cálculo I» como completada' }).click();
  await expect(card.getByRole('button', { name: 'Marcar «Cálculo II» como completada' })).toBeVisible();
  await expect(page.getByText('1 de 3 completadas')).toBeVisible();

  await expect
    .poll(async () => (await readLegacy(page)).roadmaps)
    .toEqual([
      {
        id: expect.any(String),
        name: 'Ingeniería de Sistemas',
        color: '#4F7CFF',
        steps: [expect.objectContaining({ name: 'Cálculo I', done: true }), expect.objectContaining({ name: 'Cálculo II', done: false }), expect.objectContaining({ name: 'Ecuaciones', done: false })],
      },
    ]);
  await reloadWhenSaved(page);
  await page.getByRole('button', { name: 'Reabrir «Cálculo I»' }).click();
  await expect(page.getByRole('button', { name: 'Marcar «Cálculo I» como completada' })).toBeVisible();
  await expect.poll(async () => ((await readLegacy(page)).roadmaps as Array<{ steps: Array<{ done: boolean }> }>)[0].steps.map((s) => s.done)).toEqual([false, false, false]);
  expect(await readLegacy(page)).toMatchObject(OLD);
});

test('cuadernos: cuaderno, cajitas de texto y de código con su lenguaje, y borrado en cascada', async ({ page }) => {
  await register(page, 'cuadernos');
  await onboard(page);
  await seedLegacy(page, {
    ...OLD,
    notebooks: [{ id: 'id_viejo', title: 'Recetas', category: 'General', subject: '', topic: '', color: '#0FA968', emoji: '📗' }],
    noteBoxes: [{ id: 'bx0', notebookId: 'id_viejo', title: 'Pan', text: 'Harina y agua', color: '#DDF3E4', kind: 'text', lang: '' }],
  });
  await page.goto('/cuadernos');
  await page.getByRole('button', { name: 'Nuevo cuaderno' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo cuaderno' });
  await dialog.getByLabel('Título').fill('Cálculo');
  await dialog.getByLabel('Categoría').fill('Universidad');
  await dialog.getByLabel('Tema (opcional)').fill('Derivadas');
  await dialog.getByRole('radio', { name: 'Icono 🧮' }).check();
  await dialog.getByRole('button', { name: 'Crear cuaderno' }).click();

  await page.getByLabel('Categoría').selectOption('Universidad');
  await expect(page.getByRole('link', { name: /Recetas/ })).toHaveCount(0);
  await page.getByRole('link', { name: /Cálculo/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cálculo' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sin cajitas todavía' })).toBeVisible();

  await page.getByRole('button', { name: 'Texto', exact: true }).click();
  const box = page.getByRole('region', { name: 'Cajita 1' });
  await box.getByLabel('Texto de la cajita 1').fill('La derivada mide el cambio.');
  await box.getByRole('radio', { name: 'Lila' }).click();
  await expect(box.getByRole('radio', { name: 'Lila' })).toBeChecked();
  await page.getByRole('button', { name: 'Código', exact: true }).click();
  const code = page.getByRole('region', { name: 'Cajita de código 2' });
  await code.getByLabel('Contenido de la cajita de código 2').fill('print(2 * 3)');
  await code.getByLabel('Lenguaje de la cajita de código 2').selectOption('python');
  await code.getByLabel('Nombre del archivo de la cajita de código 2').fill('main.py');
  // Con nombre, la cajita pasa a llamarse por él.
  await page.getByLabel('Nombre del archivo de la cajita de código «main.py»').blur();

  const notebookId = page.url().split('/').pop() as string;
  await expect
    .poll(async () => (await readLegacy(page)).noteBoxes)
    .toEqual([
      { id: 'bx0', notebookId: 'id_viejo', title: 'Pan', text: 'Harina y agua', color: '#DDF3E4', kind: 'text', lang: '' },
      { id: expect.any(String), notebookId, title: '', text: 'La derivada mide el cambio.', color: '#EDE4FF', kind: 'text', lang: '' },
      { id: expect.any(String), notebookId, title: 'main.py', text: 'print(2 * 3)', color: '#1e1e2e', kind: 'code', lang: 'python' },
    ]);
  await reloadWhenSaved(page);
  await expect(page.getByRole('region', { name: 'Cajita de código «main.py»' }).getByLabel(/Lenguaje/)).toHaveValue('python');

  await page.getByRole('button', { name: 'Decorar' }).click();
  await page.getByRole('dialog', { name: 'Decorar cuaderno' }).getByRole('button', { name: 'Borrar' }).click();
  await expect(page.getByRole('alert')).toContainText('con 2 cajitas');
  await page.getByRole('button', { name: 'Borrar definitivamente' }).click();
  await expect(page).toHaveURL(/\/cuadernos$/);
  await expect.poll(async () => ((await readLegacy(page)).noteBoxes as Array<{ id: string }>).map((b) => b.id)).toEqual(['bx0']);
  const doc = await readLegacy(page);
  expect(doc.notebooks).toEqual([{ id: 'id_viejo', title: 'Recetas', category: 'General', subject: '', topic: '', color: '#0FA968', emoji: '📗' }]);
  expect(doc).toMatchObject(OLD);
});

test('contenido e ideas: publicar, etapas, filtros y guardado al escribir', async ({ page }) => {
  await register(page, 'contenido');
  await onboard(page);
  await seedLegacy(page, { ...OLD, ideas: [{ id: 'id_idea', title: 'App de hábitos', body: '', category: 'app', tags: '' }] });
  await page.goto('/contenido');
  await page.getByLabel('Nuevo video').fill('Probé 100 apps de IA');
  await page.getByLabel('Plataforma').selectOption('tiktok');
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Publicado: «Probé 100 apps de IA»' }).click();
  await expect(page.getByRole('region', { name: /Publicados/ }).getByText('Probé 100 apps de IA')).toBeVisible();
  await page.getByRole('button', { name: 'Editar «Probé 100 apps de IA»' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar video' });
  await dialog.getByLabel('Fecha (opcional)').fill('12 sep');
  await dialog.getByLabel('Guion').fill('Gancho: ¿cuál vale la pena?');
  await dialog.getByLabel('Etapa').selectOption('editar');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('region', { name: /En producción/ }).getByText('Probé 100 apps de IA')).toBeVisible();
  await expect
    .poll(async () => (await readLegacy(page)).content)
    .toEqual([{ id: expect.any(String), title: 'Probé 100 apps de IA', stage: 'editar', platform: 'tiktok', notes: '', script: 'Gancho: ¿cuál vale la pena?', due: '12 sep' }]);

  await page.goto('/ideas');
  await page.getByRole('button', { name: 'Marketing' }).click();
  await expect(page.getByRole('heading', { name: 'Aún no hay ideas de Marketing' })).toBeVisible();
  await page.getByLabel('Nueva idea de Marketing').fill('Reel para Instagram');
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  const card = page.getByRole('article', { name: 'Reel para Instagram' });
  await card.getByLabel('Desarrollo de «Reel para Instagram»').fill('Tres consejos en 30 segundos');
  await card.getByLabel(/Etiquetas de/).fill('reels, verano');
  await card.getByLabel(/Etiquetas de/).blur();
  await expect(card.getByText('#verano')).toBeVisible();
  await expect
    .poll(async () => (await readLegacy(page)).ideas)
    .toEqual([
      { id: 'id_idea', title: 'App de hábitos', body: '', category: 'app', tags: '' },
      { id: expect.any(String), title: 'Reel para Instagram', body: 'Tres consejos en 30 segundos', category: 'marketing', tags: 'reels, verano' },
    ]);
  await reloadWhenSaved(page);
  await expect(page.getByRole('article', { name: 'Reel para Instagram' }).getByLabel('Desarrollo de «Reel para Instagram»')).toHaveValue('Tres consejos en 30 segundos');
  expect(await readLegacy(page)).toMatchObject(OLD);
});
