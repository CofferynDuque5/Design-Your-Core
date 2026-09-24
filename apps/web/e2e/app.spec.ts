import { expect, test } from '@playwright/test';
import { onboard, PASSWORD, register } from './helpers';

// Una persona nueva: registro, onboarding, check-in, hábito, reto, progreso,
// ajustes y cierre de sesión, todo contra la API real.

test('recorrido completo de una persona nueva', async ({ page }) => {
  const address = await register(page, 'flujo');
  await onboard(page);

  // Hoy: saludo, reto del onboarding (pilar descanso, el más bajo) y check-in rápido.
  await expect(page.getByRole('heading', { name: /Nathan$/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Retos activos' })).toBeVisible();
  await expect(page.getByText('Pantallas fuera 30 minutos antes de dormir').first()).toBeVisible();
  await page.getByRole('group', { name: 'Ánimo' }).getByRole('radio', { name: /^4/ }).check();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check-in de hoy' })).toBeVisible();
  await expect(page.getByText(/Registraste ánimo 4\/5/)).toBeVisible();

  // Hábito nuevo, marcado desde Hoy.
  await page.goto('/habitos');
  await page.getByRole('button', { name: 'Nuevo hábito' }).click();
  await page.getByLabel('¿Qué vas a hacer?').fill('Leer 10 páginas');
  await page.getByRole('radio', { name: 'Propósito' }).check();
  await page.getByRole('button', { name: 'Crear hábito' }).click();
  await expect(page.getByRole('heading', { name: 'Leer 10 páginas' })).toBeVisible();
  await page.goto('/');
  const habit = page.getByRole('checkbox', { name: /Leer 10 páginas/ });
  await habit.click();
  await expect(habit).toBeChecked();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: /Leer 10 páginas/ })).toBeChecked();

  // Reto: marcar hoy.
  await page.getByRole('button', { name: 'Marcar hoy como hecho' }).click();
  await expect(page.getByRole('button', { name: 'Hecho hoy' })).toBeVisible();

  // Check-in completo con reflexión.
  await page.goto('/check-in');
  await expect(page.getByRole('group', { name: 'Ánimo' }).getByRole('radio', { name: /^4/ })).toBeChecked();
  await page.getByLabel('Horas de sueño').fill('7.5');
  await page.getByLabel('Reflexión del día').fill('Buen día.');
  await page.getByRole('button', { name: 'Guardar check-in' }).click();
  await expect(page).toHaveURL(/\/$/);

  // Progreso: los seis pilares y la evolución.
  await page.goto('/progreso');
  await expect(page.getByRole('heading', { name: 'Tus pilares' })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveCount(6);
  await expect(page.getByRole('progressbar', { name: 'Descanso' })).toHaveAttribute('aria-valuenow', /[1-9]/);
  await page.getByRole('button', { name: 'Mes' }).click();
  await expect(page.getByRole('img', { name: /Puntuación general por día/ })).toBeVisible();

  // Ajustes: tema oscuro persistente y cierre de sesión.
  await page.goto('/perfil');
  await page.getByRole('button', { name: 'Oscuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/entrar$/);

  // Volver a entrar lleva directo a Hoy (onboarding ya hecho).
  await page.getByLabel('Correo').fill(address);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Hábitos de hoy' })).toBeVisible();
});

test('borrar la cuenta cierra la sesión y ya no se puede entrar', async ({ page }) => {
  const address = await register(page, 'borrar');
  await onboard(page);
  await page.goto('/perfil');
  await page.getByRole('button', { name: 'Borrar mi cuenta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Borrar tu cuenta' });
  await dialog.getByLabel('Escribe tu contraseña para confirmar').fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Borrar definitivamente' }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await page.getByLabel('Correo').fill(address);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos');
});
