import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { onboard, register } from './helpers';

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

  for (const path of ['/', '/check-in', '/progreso', '/retos', '/habitos', '/perfil', '/mas', '/no-existe']) {
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

  await page.goto('/perfil');
  await page.getByRole('button', { name: 'Borrar mi cuenta' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectAccessible(page, 'diálogo de borrar cuenta');
});
