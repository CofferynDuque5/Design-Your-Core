import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { onboard, register, seedLegacy, sessionToken } from './helpers';

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
  // Recorre todas las pantallas y sus diálogos: tarda más que un recorrido normal.
  test.setTimeout(240_000);
  await register(page, 'a11y');
  await expectAccessible(page, '/bienvenida');
  await onboard(page);

  // Herramientas con datos de la app anterior, para revisar también sus listas.
  const month = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);
  // Ciclo usa la fecha local del navegador, como la app anterior.
  const localToday = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
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
    subjects: [{ id: 'mat1', name: 'Física', teacher: 'Prof. Ruiz', room: 'B-3', color: '#E8912A', nextClass: 'Lunes 8:00', topics: [{ id: 'xa1', name: 'Ondas', done: true }, { id: 'xa2', name: 'Óptica', done: false }] }],
    projects: [
      { id: 'p1', title: 'Maqueta', subject: 'Física', deadline: '20 SEP', status: 'revision', color: '#E8912A', milestones: [{ id: 'm1', name: 'Boceto', date: '', done: true }] },
      { id: 'p2', title: 'Ensayo', subject: '', deadline: '', status: 'entregado', color: '#14B8A6', milestones: [] },
    ],
    roadmaps: [{ id: 'rm1', name: 'Ingeniería', color: '#E8912A', steps: [{ id: 's1', name: 'Cálculo I', done: true }, { id: 's2', name: 'Cálculo II', done: false }, { id: 's3', name: 'Ecuaciones', done: false }, { id: 's4', name: 'Física II', done: false }] }],
    notebooks: [{ id: 'nb1', title: 'Apuntes', category: 'Universidad', subject: 'Cálculo', topic: 'Derivadas', color: '#111827', emoji: '🧮' }],
    noteBoxes: [
      { id: 'bx1', notebookId: 'nb1', title: 'Regla', text: 'La derivada de una suma…', color: '#FFE8D6', kind: 'text', lang: '' },
      { id: 'bx2', notebookId: 'nb1', title: 'main.py', text: 'print(1)', color: '#1e1e2e', kind: 'code', lang: 'python' },
    ],
    content: [
      { id: 'ct1', title: 'Probé 100 apps', stage: 'guion', platform: 'youtube', notes: '', script: 'Gancho', due: '12 sep' },
      { id: 'ct2', title: 'Mi escritorio', stage: 'publicado', platform: 'tiktok', notes: '', script: '', due: '' },
    ],
    ideas: [{ id: 'i1', title: 'App de hábitos', body: 'Para estudiantes', category: 'marketing', tags: 'saas, urgente' }],
    transactions: [
      { id: 'tx1', date: today, amount: 1200, type: 'income', category: 'Sueldo', note: '' },
      { id: 'tx2', date: today, amount: 45.5, type: 'expense', category: 'Comida', note: 'Mercado' },
    ],
    budget: { monthly: 500 },
    goals: [
      { id: 'g1', title: 'Publicar 8 videos', target: 8, current: 5, unit: 'videos', deadline: '2026-12-31', category: 'creador', done: false },
      { id: 'g2', title: 'Leer 12 libros', target: 12, current: 12, unit: 'libros', deadline: '', category: 'estudio', done: true },
    ],
    pets: [{ id: 'pet1', name: 'Luna', species: 'cat', note: '3 años' }],
    petCares: [{ id: 'pc1', petId: 'pet1', kind: 'comida', title: 'Darle de comer', time: '08:00', days: '1234567', sound: true, enabled: true, lastDone: today }],
    period: [{ id: 'pd1', date: localToday, flow: 'medium', symptoms: 'Cólicos', mood: '😴', note: 'Algo cansada' }],
    cycle: { cycleLength: 28, periodLength: 5 },
    sleep: [{ id: 'sl1', date: today, bedtime: '23:15', waketime: '07:00', quality: 4, note: '' }],
    journal: [{ id: 'j1', date: today, mood: '😄', gratitude: 'El sol', note: 'Buen día' }],
    routines: [{ id: 'rt1', title: 'Tomar vitaminas', time: '08:30', days: '1234567', icon: 'bell', sound: true, enabled: true }],
    meals: [{ id: 'ml1', label: 'Desayuno', time: '08:00', note: 'Avena', dateKey: today }],
    dayLog: { dateKey: today, water: 3, waterGoal: 8 },
  });
  // Con Ciclo activado, el menú y el Calendario muestran también el ciclo.
  const token = await sessionToken(page);
  expect((await page.request.patch('/api/v2/me', { data: { showCycle: true }, headers: { Authorization: `Bearer ${token}` } })).ok()).toBe(true);

  for (const path of ['/', '/check-in', '/progreso', '/retos', '/habitos', '/perfil', '/mas', '/agenda', '/agenda?vista=tareas', '/pendientes', '/calendario', '/horario', '/enfoque', '/materias', '/proyectos', '/roadmaps', '/cuadernos', '/cuadernos/nb1', '/contenido', '/ideas', '/finanzas', '/metas', '/mascotas', '/ciclo', '/ejercicio', '/sueno', '/diario', '/rutina', '/no-existe']) {
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
  await page.goto('/materias');
  await page.getByRole('button', { name: /^Temas/ }).click();
  await expectAccessible(page, 'temas desplegados');
  await page.goto('/proyectos');
  await page.getByRole('button', { name: /^Hitos/ }).first().click();
  await expectAccessible(page, 'hitos desplegados');
  await page.goto('/ideas');
  await page.getByRole('button', { name: 'Borrar «App de hábitos»' }).click();
  await expectAccessible(page, 'ideas vacías con ejemplos');
  for (const [path, button] of [
    ['/agenda', 'Nuevo bloque'],
    ['/calendario', 'Nuevo evento'],
    ['/horario', 'Nueva clase'],
    ['/materias', 'Nueva materia'],
    ['/materias', 'Editar «Física»'],
    ['/proyectos', 'Nuevo proyecto'],
    ['/roadmaps', 'Nuevo roadmap'],
    ['/cuadernos', 'Nuevo cuaderno'],
    ['/cuadernos/nb1', 'Decorar'],
    ['/contenido', 'Editar «Probé 100 apps»'],
    ['/finanzas', 'Nuevo movimiento'],
    ['/finanzas', 'Editar: Gasto de 45,5 en Comida (Mercado)'],
    ['/finanzas', 'Cambiar'],
    ['/metas', 'Nueva meta'],
    ['/metas', 'Editar «Leer 12 libros»'],
    ['/mascotas', 'Nueva mascota'],
    ['/mascotas', 'Editar a Luna'],
    ['/mascotas', 'Añadir cuidado'],
    ['/mascotas', 'Editar «Darle de comer» de Luna'],
    ['/ejercicio', 'Registrar entreno'],
    ['/ejercicio', 'Editar Full body del'],
    ['/sueno', 'Registrar noche'],
    ['/sueno', 'Editar la noche del'],
    ['/rutina', 'Nueva rutina'],
    ['/rutina', 'Editar «Tomar vitaminas»'],
    ['/rutina', 'Añadir comida'],
    ['/rutina', 'Editar Desayuno'],
  ] as const) {
    await page.goto(path);
    await page.getByRole('button', { name: button }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectAccessible(page, `diálogo ${button}`);
    // Confirmación de borrado dentro del diálogo.
    const remove = page.getByRole('dialog').getByRole('button', { name: 'Borrar', exact: true });
    if (await remove.count()) {
      await remove.click();
      await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
      await expectAccessible(page, `confirmar borrado ${button}`);
    }
  }

  await page.goto('/perfil');
  await page.getByRole('button', { name: 'Borrar mi cuenta' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectAccessible(page, 'diálogo de borrar cuenta');
});
