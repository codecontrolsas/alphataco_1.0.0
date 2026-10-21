import { defineConfig, devices } from '@playwright/test';

/**
 * E2E contra una instancia ya levantada (el compose de producción de este repo, ver `.github/workflows/_e2e.yml`).
 * Local: `docker compose --env-file .env.docker up -d --build app`, cargar los datos de prueba con
 * `scripts/seed-company.ts` y `scripts/seed-auth-fixtures.ts`, y correr `npm run e2e`.
 *
 * Cada clon de una instancia hereda estos tests y los adapta a su proyecto: si un cliente cambia un flujo, sus specs
 * se ajustan en su repo (`docs/arquitectura/MODELO-DE-TRABAJO.md`).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  // En CI se reintenta una vez: un fallo que se repite es real, uno que no, es ruido de infraestructura.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['blob'], ['list']] : [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    // Hora y fechas siempre en hora argentina, como la app.
    timezoneId: 'America/Argentina/Buenos_Aires',
    locale: 'es-AR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
