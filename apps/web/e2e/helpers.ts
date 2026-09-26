import { expect, type Page } from '@playwright/test';

// Pasos compartidos por los recorridos: cuentas nuevas contra la API real.

export const email = (tag: string) => `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
export const PASSWORD = 'contraseña-segura';

export async function register(page: Page, tag: string, name = 'Nathan') {
  const address = email(tag);
  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar$/);
  await page.getByRole('link', { name: 'Crea una' }).click();
  await page.getByLabel('Tu nombre').fill(name);
  await page.getByLabel('Correo').fill(address);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/bienvenida$/);
  return address;
}

export async function onboard(page: Page) {
  await page.getByRole('button', { name: 'Empezar' }).click();
  await page.getByRole('checkbox', { name: /^Descanso/ }).check();
  await page.getByRole('checkbox', { name: /^Enfoque mental/ }).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('group', { name: /Descanso/ }).getByRole('radio', { name: /^2/ }).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Tu intención (opcional)').fill('Dormir mejor.');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Tu primer reto' })).toBeVisible();
  await page.getByRole('button', { name: 'Empezar este reto' }).click();
  await expect(page).toHaveURL(/\/$/);
}

export async function signIn(page: Page, address: string, password = PASSWORD) {
  await page.getByLabel('Correo').fill(address);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** Token de la sesión web (lo guarda la app en localStorage). */
export async function sessionToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem('dyc.token'));
  expect(token).toBeTruthy();
  return token as string;
}

/** Deja el documento de la app anterior como si lo hubiera guardado ella (PUT /api/sync). */
export async function seedLegacy(page: Page, data: Record<string, unknown>) {
  const token = await sessionToken(page);
  const res = await page.request.put('/api/sync', { data: { data }, headers: { Authorization: `Bearer ${token}` } });
  expect(res.ok()).toBe(true);
}

/** Lee el documento completo como lo leería la app anterior (GET /api/sync). */
export async function readLegacy(page: Page): Promise<Record<string, unknown>> {
  const token = await sessionToken(page);
  const res = await page.request.get('/api/sync', { headers: { Authorization: `Bearer ${token}` } });
  return (await res.json()).data;
}
