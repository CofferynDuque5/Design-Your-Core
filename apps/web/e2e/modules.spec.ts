import { expect, test } from '@playwright/test';
import { onboard, readLegacy, register, seedLegacy } from './helpers';

// Herramientas de la app anterior (tanda 1) contra la API real. Cada recorrido
// comprueba además que el documento de /api/sync (el que lee la app anterior)
// conserva sus formatos y las claves que la app nueva no conoce.

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
  await page.reload();
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
  await page.reload();
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

  await page.reload();
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
  await page.reload();
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

  await page.reload();
  await expect(page.locator('.stat', { hasText: 'Sesiones hoy' }).locator('.stat__value')).toHaveText('1');
  const doc = await readLegacy(page);
  expect(doc.focus).toEqual([expect.objectContaining({ mode: 'focus', seconds: 120, dateKey: new Date().toISOString().slice(0, 10) })]);
  expect(doc).toMatchObject(OLD);
});
