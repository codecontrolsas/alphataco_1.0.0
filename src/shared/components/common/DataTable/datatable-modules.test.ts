import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Cada `_*DataTable.tsx` se evalúa al cargar la página, en el servidor (SSR) y en el navegador. Un error al nivel del
 * módulo (usar una constante antes de declararla, p. ej. `DAYS_OPTIONS = DAYS_VALUES.map(... daysIcons[v])` arriba de
 * `const daysIcons`) tira toda la pantalla con `ReferenceError: Cannot access 'X' before initialization`, y ni `tsc`
 * ni los tests de las acciones lo ven: TypeScript no marca el uso dentro de una flecha aunque se ejecute en el acto
 * (ticket 801, Pagos → Vencimientos).
 *
 * Este test importa cada módulo de tabla en Node, que respeta la zona muerta de `const` igual que el navegador: si la
 * evaluación del módulo falla, falla el test con el mismo error. Las acciones que importan se cargan pero no se
 * llaman, así que el cliente de Prisma se crea con una URL de relleno y nunca conecta.
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

function findDataTableModules(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : findDataTableModules(full);
    return /^_.*DataTable\.tsx$/.test(entry.name) ? [full] : [];
  });
}

const modules = findDataTableModules(SRC).map((file) => path.relative(ROOT, file));

describe('módulos de tablas (_*DataTable.tsx)', () => {
  it('encuentra los módulos a revisar', () => {
    expect(modules.length).toBeGreaterThan(50);
  });

  it.each(modules)(
    '%s se evalúa sin errores al cargarse',
    async (file) => {
      // Relleno para el cliente de Prisma que crean los imports de acciones: no se conecta nunca. Va acá y no global
      // para no habilitar las suites de integración (se activan con DATABASE_URL); cada archivo de test corre en su
      // propio proceso.
      process.env.DATABASE_URL ??= 'postgresql://placeholder:placeholder@127.0.0.1:1/placeholder';
      await expect(import(path.join(ROOT, file))).resolves.toBeDefined();
      // El primer import transforma las dependencias compartidas (DataTable, UI, Prisma): tarda más que el resto.
    },
    60_000
  );
});
