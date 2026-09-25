import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { onboard, register, seedLegacy } from './helpers';

// Accesibilidad automática (axe, WCAG 2.2 A/AA) en cada pantalla. Corre en los
// dos proyectos: escritorio con tema claro y móvil con tema oscuro.

async function expectAccessible(page: Page, screen: string) {
  // Esperar a que terminen las cargas: axe no debe ver esqueletos a medias.
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => `${n.target.join(' ')} ${n.any[0]?.message ?? ''}`).join('\n  ')}`);
  expect(summary, `${screen}: problemas de accesibilidad`).toEqual([]);
}

test('pantallas públicas', async ({ page }) => {
  for (const [path, heading] of [
    ['/entrar', 'Hola de nuevo'],
    ['/registro', 'Crea tu cuenta'],
    ['/recuperar', 'Recupera tu contraseña'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
    await expectAccessible(page, path);
  }
});

test('onboarding y pantallas de la app', async ({ page }) => {
  await register(page, 'a11y');
  await expectAccessible(page, '/bienvenida');
  await onboard(page);

  // Herramientas con datos de la app anterior, para revisar también sus listas.
  const month = new Date().toISOString().slice(0, 7);
  await seedLegacy(page, {
    blocks: [
      { id: 'b1', label: 'Estudiar', sub: 'Cálculo', start: 9, dur: 1.5, kind: 'study' },
      { id: 'b2', label: 'Pausa', sub: '', start: 10.5, dur: 0.5, kind: 'break' },
    ],
    tasks: [{ id: 't1', title: 'Entregar ensayo', pri: 'alta', time: null, rem: false, done: true, tags: '' }],
    todos: [
      { id: 'td1', title: 'Pagar la luz', done: false },
      { id: 'td2', title: 'Llamar al banco', done: true },
    ],
    subtasks: [{ id: 's1', todoId: 'td1', title: 'Buscar el recibo', done: false }],
    reminders: [{ id: 'r1', day: 14, title: 'Dentista', when: '14:00', color: '#4F7CFF', icon: 'doc', on: true }],
    workouts: [{ id: 'w1', date: `${month}-10`, plan: 'Full body', minutes: 30 }],
    classes: [{ id: 'c1', day: 2, start: '08:00', end: '09:30', title: 'Cálculo', room: 'A-201', color: '#8B5CF6', subject: '' }],
    focus: [{ id: 'f1', mode: 'focus', seconds: 1500, dateKey: new Date().toISOString().slice(0, 10) }],
  });

  for (const path of ['/', '/check-in', '/progreso', '/retos', '/habitos', '/perfil', '/mas', '/agenda', '/agenda?vista=tareas', '/pendientes', '/calendario', '/horario', '/enfoque', '/no-existe']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectAccessible(page, path);
  }

  // Diálogos: nuevo hábito y borrar cuenta.
  await page.goto('/habitos');
  await page.getByRole('button', { name: 'Nuevo hábito' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectAccessible(page, 'diálogo de hábito');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Subtareas desplegadas y diálogos de las herramientas.
  await page.goto('/pendientes');
  await page.getByRole('button', { name: /Subtareas de «Pagar la luz»/ }).click();
  await expectAccessible(page, 'subtareas');
  for (const [path, button] of [
    ['/agenda', 'Nuevo bloque'],
    ['/calendario', 'Nuevo evento'],
    ['/horario', 'Nueva clase'],
  ] as const) {
    await page.goto(path);
    await page.getByRole('button', { name: button }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectAccessible(page, `diálogo ${button}`);
  }

  await page.goto('/perfil');
  await page.getByRole('button', { name: 'Borrar mi cuenta' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectAccessible(page, 'diálogo de borrar cuenta');
});
