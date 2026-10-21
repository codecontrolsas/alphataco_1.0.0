import { expect, test } from '@playwright/test';

/**
 * Humo de una instancia recién levantada: que responda, que la base y el storage estén sanos y que la pantalla de
 * ingreso se muestre. Es lo mínimo que tiene que cumplir cualquier clon; cada cliente suma sus propios flujos.
 */
test.describe('instancia levantada', () => {
  test('el health informa base y storage sanos', async ({ request }) => {
    const response = await request.get('/api/health');

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok', storage: 'ok' });
  });

  test('la pantalla de ingreso se muestra', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByLabel('Correo electrónico')).toBeVisible();
    await expect(page.getByTestId('login-password-input')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
  });
});
