import { expect, test, type Page } from '@playwright/test';

/**
 * Los listados clave MUESTRAN filas, sin errores en el navegador ni respuestas 5xx. Requiere los datos de
 * `scripts/seed-auth-fixtures.ts` y `scripts/seed-e2e-fixtures.ts` (ver `.github/workflows/_e2e.yml`).
 *
 * Es lo que no veía el e2e anterior, que solo comprobaba que las páginas cargaran:
 * - con la app bajo RLS (`e2e-rls`), una lista que consulta sin la empresa en el contexto devuelve CERO filas y la
 *   página carga igual, vacía (ticket 800: Taller vacío con el contador en 9; Configuración → Usuarios vacía);
 * - un error al evaluar un módulo en el navegador tira la pantalla entera (ticket 801: `daysIcons` usado antes de
 *   declararse en Pagos → Vencimientos), y solo se ve como excepción de página o en el error boundary.
 */
const ADMIN = { email: 'admin@p4.test', password: 'P4-verificacion-123' };

/**
 * 5xx esperables en CI. TaskApp (tickets de soporte) no está configurado en la instancia de prueba y su proxy de eventos
 * responde 500 a propósito (`src/app/api/taskapp/events/route.ts`).
 */
const ALLOWED_5XX = [/\/api\/taskapp\/events/];

/**
 * Desajuste de hidratación de React (#418) que ya existe en Mantenimiento → Taller con el build de producción (no lo
 * produce la RLS ni estos datos: aparece con y sin ellos). Se anota en el reporte del test para seguirlo aparte, pero
 * no corta la corrida. Cualquier otra excepción (p. ej. un `ReferenceError` al evaluar un módulo) sí la corta.
 */
const KNOWN_PAGE_ERRORS = [/Minified React error #418/];

interface BrowserProblems {
  pageErrors: string[];
  consoleErrors: string[];
  serverErrors: string[];
}

function watchProblems(page: Page): BrowserProblems {
  const problems: BrowserProblems = { pageErrors: [], consoleErrors: [], serverErrors: [] };
  page.on('pageerror', (error) => {
    if (KNOWN_PAGE_ERRORS.some((pattern) => pattern.test(error.message))) {
      test
        .info()
        .annotations.push({ type: 'error conocido', description: `${page.url()}: ${error.message.slice(0, 120)}` });
      return;
    }
    problems.pageErrors.push(error.message);
  });
  page.on('console', (message) => {
    // Los recursos que fallan ya se cuentan por su respuesta (y ahí se aplica la lista de permitidos).
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
      problems.consoleErrors.push(message.text());
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 500 && !ALLOWED_5XX.some((pattern) => pattern.test(response.url()))) {
      problems.serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  return problems;
}

/**
 * `sortBy`: columna por la que se reordena la tabla. Reordenar pide la página con una ACCIÓN de servidor (la tabla en
 * modo cliente), que es el camino que la demo dejaba vacío: ahí la función `'use cache'` no encuentra la empresa del
 * request y, bajo RLS, guarda cero filas ("No hay usuarios registrados" en Usuarios). La carga inicial (SSR) a veces sí
 * la ve, así que mirar solo la primera página no alcanza.
 */
const SCREENS: { name: string; path: string; row: string; sortBy: string | null }[] = [
  {
    name: 'Configuración → Usuarios',
    path: '/dashboard/configuration?tab=general&subtab=users&usertab=usuarios-empleados',
    row: ADMIN.email,
    sortBy: 'Correo',
  },
  {
    name: 'Compras → Pagos → Vencimientos',
    path: '/dashboard/purchases?tab=pagos&vista=vencimientos',
    row: 'Proveedor E2E',
    sortBy: 'Proveedor',
  },
  {
    name: 'Mantenimiento → Taller (en taller)',
    path: '/dashboard/maintenance?vista=taller&taller_step=in_workshop',
    row: 'E2E-TALLER-1',
    sortBy: 'Ingreso a Taller',
  },
  {
    name: 'Mantenimiento → Taller (aprobaciones)',
    path: '/dashboard/maintenance?vista=taller&taller_step=approvals',
    row: 'E2E-VALIDAR-1',
    sortBy: null,
  },
];

/** La tabla visible que muestra la fila (no el resto de la página: el correo del admin también está en el menú). */
function visibleTableWith(page: Page, row: string) {
  return page.locator('table').filter({ visible: true }).filter({ hasText: row }).first();
}

test.describe('listados clave con datos', () => {
  test('cada listado muestra sus filas, sin errores de página, de consola ni 5xx', async ({ page }) => {
    // Un solo ingreso para todas las pantallas: la primera compilación/carga de cada una es lo que más tarda.
    test.setTimeout(180_000);
    const problems = watchProblems(page);

    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(ADMIN.email);
    await page.getByTestId('login-password-input').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    for (const screen of SCREENS) {
      await test.step(screen.name, async () => {
        await page.goto(screen.path);
        const table = visibleTableWith(page, screen.row);
        await expect(table).toBeVisible({ timeout: 30_000 });
        if (screen.sortBy) {
          await table.locator('thead').getByRole('button', { name: screen.sortBy, exact: true }).click();
          await page.getByRole('menuitem', { name: 'Ascendente' }).click();
          await expect(page).toHaveURL(/__sort=/);
          await expect(visibleTableWith(page, screen.row)).toBeVisible({ timeout: 30_000 });
        }
        await expect(page.getByText('Error en el Dashboard')).toHaveCount(0);
        // Las excepciones de la hidratación llegan después de que se ve la fila: se espera a que la página se calme.
        await page.waitForLoadState('networkidle').catch(() => undefined);
      });
    }

    expect(problems.pageErrors, 'excepciones en el navegador').toEqual([]);
    expect(problems.consoleErrors, 'errores de consola').toEqual([]);
    expect(problems.serverErrors, 'respuestas 5xx').toEqual([]);
  });
});
