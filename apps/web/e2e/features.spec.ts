import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { onboard, PASSWORD, register, signIn } from './helpers';

// Recorridos por funciones concretas, cada uno con una cuenta nueva.

test('retos: subir de nivel, completar y el límite de tres', async ({ page }) => {
  await register(page, 'retos');
  await onboard(page);
  await page.goto('/retos');
  const active = page.getByRole('region', { name: 'En curso' });
  await expect(active.getByRole('heading', { name: 'Pantallas fuera 30 minutos antes de dormir' })).toBeVisible();

  await active.getByRole('button', { name: 'Subir nivel' }).click();
  await expect(active.getByRole('heading', { name: 'Acuéstate a la misma hora cinco noches' })).toBeVisible();
  await expect(active.getByRole('heading', { name: 'Pantallas fuera 30 minutos antes de dormir' })).toHaveCount(0);

  // Dos más del catálogo: con tres, el resto queda deshabilitado.
  const catalog = page.getByRole('region', { name: 'Catálogo' });
  for (const title of ['Camina 10 minutos después de una comida', 'Sin cafeína después de las 14:00']) {
    await catalog.getByRole('article').filter({ hasText: title }).getByRole('button', { name: 'Empezar' }).click();
    await expect(active.getByRole('heading', { name: title })).toBeVisible();
  }
  await expect(page.getByText('3 de 3')).toBeVisible();
  await expect(catalog.getByRole('button', { name: 'Empezar' }).first()).toBeDisabled();

  // Terminar uno como completado lo mueve al historial y libera un hueco.
  await active.getByRole('article').filter({ hasText: 'Sin cafeína después de las 14:00' }).getByRole('button', { name: 'Terminar' }).click();
  await page.getByRole('dialog', { name: 'Terminar el reto' }).getByRole('button', { name: 'Darlo por completado' }).click();
  const past = page.getByRole('region', { name: 'Últimos 60 días' });
  await expect(past.getByText('Sin cafeína después de las 14:00')).toBeVisible();
  await expect(past.getByText('Completado')).toBeVisible();
  await expect(page.getByText('2 de 3')).toBeVisible();
  await expect(catalog.getByRole('button', { name: 'Empezar' }).first()).toBeEnabled();
});

test('hábitos: editar, archivar y recuperar', async ({ page }) => {
  await register(page, 'habitos');
  await onboard(page);
  await page.goto('/habitos');
  await page.getByRole('button', { name: 'Nuevo hábito' }).click();
  await page.getByLabel('¿Qué vas a hacer?').fill('Meditar');
  await page.getByRole('radio', { name: 'Enfoque' }).check();
  await page.getByRole('button', { name: 'Crear hábito' }).click();

  await page.getByRole('button', { name: 'Editar «Meditar»' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar hábito' });
  await dialog.getByLabel('¿Qué vas a hacer?').fill('Meditar 5 minutos');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { name: 'Meditar 5 minutos' })).toBeVisible();

  await page.getByRole('button', { name: 'Archivar «Meditar 5 minutos»' }).click();
  await expect(page.getByRole('heading', { name: 'Aún no tienes hábitos' })).toBeVisible();
  await page.getByLabel('Mostrar archivados').check();
  await page.getByRole('button', { name: 'Recuperar «Meditar 5 minutos»' }).click();
  await page.getByLabel('Mostrar archivados').uncheck();
  await expect(page.getByRole('heading', { name: 'Meditar 5 minutos' })).toBeVisible();

  // En Hoy aparece como hábito del día.
  await page.goto('/');
  await expect(page.getByRole('checkbox', { name: /Meditar 5 minutos/ })).toBeVisible();
});

test('perfil: descargar los datos y cambiar la contraseña', async ({ page }) => {
  const address = await register(page, 'perfil');
  await onboard(page);
  await page.goto('/perfil');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar mis datos' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^design-your-core-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readFile(await file.path(), 'utf8'));
  expect(data.user.email).toBe(address);
  expect(data.profile.focusPillars).toEqual(expect.arrayContaining(['descanso', 'enfoque']));
  expect(data.challenges).toHaveLength(1);

  await page.getByLabel('Contraseña actual').fill(PASSWORD);
  await page.getByLabel('Nueva contraseña').fill('otra-clave-segura');
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByText('Contraseña cambiada')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();

  await signIn(page, address);
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos');
  await signIn(page, address, 'otra-clave-segura');
  await expect(page.getByRole('heading', { name: 'Hábitos de hoy' })).toBeVisible();
});

test('pareja: dos personas se vinculan con un código', async ({ page, browser }, info) => {
  await register(page, 'pareja-a', 'Ana');
  await onboard(page);
  await page.goto('/perfil');
  const partnerA = page.getByRole('region', { name: 'Pareja' });
  await partnerA.getByRole('button', { name: 'Solo el código' }).click();
  const code = (await partnerA.locator('.code').textContent())?.trim() ?? '';
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  const other = await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL });
  const pageB = await other.newPage();
  await register(pageB, 'pareja-b', 'Bruno');
  await onboard(pageB);
  await pageB.goto('/perfil');
  const partnerB = pageB.getByRole('region', { name: 'Pareja' });
  await partnerB.getByLabel('¿Te dieron un código?').fill(code);
  await partnerB.getByRole('button', { name: 'Vincular' }).click();
  await expect(partnerB.getByText('Ana')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('region', { name: 'Pareja' }).getByText('Bruno')).toBeVisible();
  await other.close();
});

test('la sección Más conserva los módulos anteriores', async ({ page }) => {
  await register(page, 'mas');
  await onboard(page);
  await page.goto('/perfil');
  await page.getByRole('link', { name: /Más herramientas/ }).click();
  await expect(page).toHaveURL(/\/mas$/);
  // Lo que aún no está en la app nueva sigue listado con su enlace a la app anterior.
  for (const group of ['Organización y trabajo', 'Bienestar']) {
    await expect(page.getByRole('region', { name: group })).toBeVisible();
  }
  await expect(page.getByRole('region', { name: 'Organización y trabajo' }).getByText('Notas (Bodega)')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Organización y trabajo' }).getByText('Finanzas')).toHaveCount(0);
  const tools = page.getByRole('region', { name: 'Herramientas' });
  await expect(tools.getByRole('list', { name: 'Estudio y trabajo' }).getByRole('link')).toHaveCount(6);
  await expect(tools.getByRole('list', { name: 'Vida personal' }).getByRole('link')).toHaveCount(3);
  // Ciclo está en Salud aunque no se muestre en el menú.
  await expect(tools.getByRole('list', { name: 'Salud' }).getByRole('link')).toHaveCount(5);
  await expect(tools.getByRole('link', { name: /Ciclo.*oculto en el menú/ })).toBeVisible();
  await tools.getByRole('link', { name: /Pendientes/ }).click();
  await expect(page).toHaveURL(/\/pendientes$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Pendientes' })).toBeVisible();
  await page.goto('/mas');
  await page.getByRole('region', { name: 'Herramientas' }).getByRole('link', { name: /Cuadernos/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cuadernos' })).toBeVisible();
});
