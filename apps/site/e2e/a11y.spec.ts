import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Cada página del sitio pasa axe (WCAG 2.2 A/AA), en claro y en oscuro.
const STYLES = ['editorial', 'bento', 'contraste', 'cristal'];
for (const path of ['/', '/descargar', '/privacidad', '/condiciones', '/no-existe']) for (const style of STYLES) {
  test(`accesibilidad de ${path} (${style})`, async ({ page }) => {
    await page.goto(path);
    await page.evaluate((s) => (document.documentElement.dataset.siteStyle = s), style);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => `${n.target.join(' ')} ${n.any[0]?.message ?? ''}`).join('\n  ')}`);
    expect(summary).toEqual([]);
  });
}

test('la navegación con teclado empieza por el enlace para saltar al contenido', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const focused = page.locator(':focus');
  await expect(focused).toHaveAttribute('href', '#main');
  await expect(focused).toBeVisible();
});
