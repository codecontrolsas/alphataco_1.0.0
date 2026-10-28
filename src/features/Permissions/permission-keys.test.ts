import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MOBILE_PERMISSION_KEYS } from './permission-catalog';
import { PERMISSIONS } from './permissions-map';

/**
 * Claves `modulo:tab:accion` escritas como texto donde el compilador no las valida (el tipo de la pestaña es `string`):
 *
 * - `MOBILE_PERMISSION_KEYS`: las que consulta la API móvil. Una clave mal escrita deja a TODOS sin esa función en la
 *   app sin ningún error.
 * - Las que piden las políticas RLS y las funciones SQL de HSE y del portal (`app_has_permission('hse', 'actas', …)`,
 *   `'hse:capacitaciones:view'`): una mal escrita cierra la tabla para todos, o la deja sin el cerco que se buscaba.
 *
 * Cada clave tiene que existir en `permissions-map.ts` (la pestaña, a cualquier profundidad, con esa acción permitida).
 */

type MapTab = { allowedActions?: readonly string[]; subtabs?: Record<string, MapTab> };
const MAP = PERMISSIONS as unknown as Record<string, { tabs: Record<string, MapTab> }>;

function findTab(tabs: Record<string, MapTab>, slug: string): MapTab | null {
  if (tabs[slug]) return tabs[slug];
  for (const tab of Object.values(tabs)) {
    const found = tab.subtabs ? findTab(tab.subtabs, slug) : null;
    if (found) return found;
  }
  return null;
}

function allowedActions(key: string): readonly string[] | null {
  const [moduleSlug, tabSlug] = key.split(':');
  const moduleDef = MAP[moduleSlug ?? ''];
  if (!moduleDef || !tabSlug) return null;
  return findTab(moduleDef.tabs, tabSlug)?.allowedActions ?? null;
}

/** Claves de permiso que aparecen en el SQL de HSE y del portal (funciones y migraciones). */
function sqlPermissionKeys(): string[] {
  const root = process.cwd();
  const migrations = readdirSync(join(root, 'prisma/migrations'))
    .filter((dir) => /(employee_portal_access|hse_)/.test(dir))
    .map((dir) => join(root, 'prisma/migrations', dir, 'migration.sql'));
  const files = [join(root, 'prisma/sql/hse.sql'), ...migrations];
  const keys = new Set<string>();
  for (const file of files) {
    const sql = readFileSync(file, 'utf8');
    for (const m of sql.matchAll(/'((?:hse|empleados):[a-z0-9_-]+:[a-z_]+)'/g)) keys.add(m[1]!);
    for (const m of sql.matchAll(/app_has_permission\('([a-z_-]+)', '([a-z0-9_-]+)', '([a-z_]+)'\)/g)) {
      keys.add(`${m[1]}:${m[2]}:${m[3]}`);
    }
  }
  return [...keys].sort();
}

describe('claves de permiso escritas como texto', () => {
  it.each(MOBILE_PERMISSION_KEYS.map((key) => [key]))('API móvil: %s existe en el mapa', (key) => {
    const action = key.split(':')[2]!;
    expect(allowedActions(key), key).toContain(action);
  });

  const sqlKeys = sqlPermissionKeys();

  it('encuentra las claves del SQL de HSE y del portal', () => {
    expect(sqlKeys.length).toBeGreaterThanOrEqual(15);
    expect(sqlKeys).toEqual(expect.arrayContaining(['hse:actas:approve', 'empleados:portal_empleado:portal_access']));
  });

  it.each(sqlKeys.map((key) => [key]))('SQL: %s existe en el mapa', (key) => {
    const action = key.split(':')[2]!;
    expect(allowedActions(key), key).toContain(action);
  });
});
