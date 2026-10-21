import { expect, test } from '@playwright/test';

/**
 * Ingreso con el usuario de prueba que crea `scripts/seed-auth-fixtures.ts` (sobre la empresa que deja el seed).
 * Requiere esos datos de prueba cargados en la instancia (ver `.github/workflows/_e2e.yml`).
 */
const ADMIN = { email: 'admin@p4.test', password: 'P4-verificacion-123' };

test.describe('ingreso', () => {
  test('un usuario con credenciales válidas llega al dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(ADMIN.email);
    await page.getByTestId('login-password-input').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Ingresar' }).click();

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('con una contraseña incorrecta se queda en el ingreso', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(ADMIN.email);
    await page.getByTestId('login-password-input').fill('contraseña-incorrecta');
    await page.getByRole('button', { name: 'Ingresar' }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByLabel('Correo electrónico')).toBeVisible();
  });
});
