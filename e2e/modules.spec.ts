import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * Control de módulos (F3.1) de punta a punta: apagar Formularios en la empresa del admin por la API de administración
 * lo saca del sidebar y su URL responde 404; encenderlo lo devuelve. Formularios es una hoja (nadie depende de ella) y
 * ningún otro spec la usa, así que el apagado no interfiere con los que corren en paralelo.
 *
 * Requiere `E2E_ADMIN_MODULES_TOKEN` (el mismo `ADMIN_MODULES_TOKEN` de la instancia) y los datos de
 * `scripts/seed-auth-fixtures.ts` (ver `.github/workflows/_e2e.yml`). Sin el token, se saltea.
 */
const ADMIN = { email: 'admin@p4.test', password: 'P4-verificacion-123' };
const COMPANY = '00000000-0000-0000-0000-0000000000f4';
const TOKEN = process.env.E2E_ADMIN_MODULES_TOKEN ?? '';

test.describe.configure({ mode: 'serial' });

async function setFormularios(request: APIRequestContext, enabled: boolean): Promise<void> {
  const headers = { authorization: `Bearer ${TOKEN}` };
  const listing = await request.get('/api/admin/v1/modules', { headers });
  expect(listing.status()).toBe(200);
  const { stateVersion } = (await listing.json()) as { stateVersion: string };
  const response = await request.put('/api/admin/v1/modules', {
    headers: { ...headers, 'x-actor-email': 'e2e@p4.test', 'idempotency-key': crypto.randomUUID() },
    data: {
      scope: 'company',
      companyId: COMPANY,
      changes: [{ key: 'formularios', enabled }],
      expectedStateVersion: stateVersion,
      reason: `e2e: Formularios ${enabled ? 'encendido' : 'apagado'}`,
    },
  });
  expect(response.status(), await response.text()).toBe(200);
}

test.describe('control de módulos', () => {
  test.skip(!TOKEN, 'Sin E2E_ADMIN_MODULES_TOKEN');

  test.afterAll(async ({ request }) => {
    await setFormularios(request, true);
  });

  test('apagar un módulo en la empresa lo saca del sidebar y su URL da 404; encenderlo lo devuelve', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(ADMIN.email);
    await page.getByTestId('login-password-input').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    const sidebarLink = page.locator('[data-sidebar="sidebar"] a[href="/dashboard/forms"]');
    await expect(sidebarLink.first()).toBeAttached({ timeout: 30_000 });

    await setFormularios(page.request, false);
    const off = await page.goto('/dashboard/forms');
    expect(off?.status()).toBe(404);
    await page.goto('/dashboard');
    // Selección (otro módulo de una sola pestaña, link directo) confirma que el sidebar ya cargó.
    await expect(page.locator('[data-sidebar="sidebar"] a[href="/dashboard/recruitment"]').first()).toBeAttached({
      timeout: 30_000,
    });
    await expect(sidebarLink).toHaveCount(0);

    await setFormularios(page.request, true);
    const on = await page.goto('/dashboard/forms');
    expect(on?.status()).toBe(200);
    await expect(sidebarLink.first()).toBeAttached({ timeout: 30_000 });
  });
});
