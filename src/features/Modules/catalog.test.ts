import { JOB_NAMES } from '@/features/Jobs/lib/types';
import { MOBILE_MODULES } from '@/features/MobileApi/lib/config';
import { PERMISSIONS } from '@/features/Permissions/permissions-map';
import { STORAGE_BUCKETS } from '@/shared/lib/storage-buckets';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CORE_MODULE,
  MODULE_CATALOG,
  MODULE_KEYS,
  TABLE_ALSO_REQUIRES,
  TAB_ALSO_REQUIRES,
  UNGATED_TABLES,
  dependentsOf,
  isModuleEnabled,
  missingDependencies,
  moduleForPath,
  requiresClosure,
  routeModules,
  shutdownOrder,
  type ModuleKey,
} from './catalog';
import { allTabPaths, buildTabOwners, declaredTabOwners } from './tab-owners';

/**
 * Reglas del catálogo funcional (blueprint F3, §3.3 y §4.2). Si una pestaña, un job, un bucket o un modelo nuevo
 * no tiene dueño, o una FK obligatoria cruza hacia una clave que el dueño no requiere, falla acá y no en producción.
 */

const ROOT = process.cwd();

interface Relation {
  from: string;
  to: string;
  field: string;
}

/** Modelos y relaciones OBLIGATORIAS (`campo Tipo @relation(fields: …)` sin `?`) de `schema.prisma`. */
function parseSchema(): { models: string[]; required: Relation[] } {
  const source = readFileSync(path.join(ROOT, 'prisma/schema.prisma'), 'utf8');
  const models: string[] = [];
  const required: Relation[] = [];
  let current: string | null = null;
  for (const line of source.split('\n')) {
    const start = /^model\s+(\w+)\s*\{/.exec(line);
    if (start) {
      current = start[1];
      models.push(current);
      continue;
    }
    if (current && /^\}/.test(line)) {
      current = null;
      continue;
    }
    if (!current) continue;
    const field = /^\s+(\w+)\s+(\w+)(\?|\[\])?\s+.*@relation\([^)]*fields:/.exec(line);
    if (field && !field[3]) required.push({ from: current, to: field[2], field: field[1] });
  }
  return { models, required };
}

function ownerOfTable(table: string): ModuleKey[] {
  return MODULE_KEYS.filter((key) => MODULE_CATALOG[key].tables.includes(table));
}

describe('catálogo de módulos: pestañas', () => {
  const rows = buildTabOwners(PERMISSIONS);
  const paths = allTabPaths(PERMISSIONS);

  it('todo nodo del árbol de permisos tiene exactamente un dueño', () => {
    // buildTabOwners lanza si dos claves declaran el mismo nodo o si un módulo raíz no tiene dueño.
    const tabIds = rows.map((row) => row.tabId);
    expect(new Set(tabIds).size).toBe(tabIds.length);
    expect(rows.length).toBe(paths.size - Object.keys(PERMISSIONS).length);
  });

  it('ninguna pestaña del catálogo ni de TAB_ALSO_REQUIRES apunta a un nodo inexistente', () => {
    const declared = MODULE_KEYS.flatMap((key) => MODULE_CATALOG[key].tabs);
    const missing = [...declared, ...Object.keys(TAB_ALSO_REQUIRES)].filter((p) => !paths.has(p));
    expect(missing).toEqual([]);
  });

  it('un hijo con otro dueño que su ancestro requiere (en forma dura) al dueño del ancestro', () => {
    const byPath = new Map(rows.map((row) => [row.path, row]));
    const declared = declaredTabOwners();
    const violations: string[] = [];
    for (const row of rows) {
      const parentPath = row.path.split(':').slice(0, -1).join(':');
      // El padre es otro nodo, o el módulo raíz (que no tiene fila, pero sí dueño declarado).
      const parentOwner = byPath.get(parentPath)?.owner ?? declared.get(parentPath);
      if (!parentOwner || parentOwner === row.owner || parentOwner === CORE_MODULE) continue;
      if (!requiresClosure(row.owner).has(parentOwner)) {
        violations.push(`${row.path} (${row.owner}) cuelga de ${parentOwner}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('la herencia apaga el subárbol: Gomería cae con Mantenimiento y el historial del equipo con cualquiera de los dos', () => {
    const byPath = new Map(rows.map((row) => [row.path, row]));
    expect(byPath.get('mantenimiento:gomeria:ordenes_gomeria')?.keys).toEqual(['gomeria', 'mantenimiento']);
    expect(byPath.get('equipos:detalle-equipo:historial-mantenimiento-equipo')?.keys).toEqual([
      'equipos',
      'mantenimiento',
    ]);
    expect(byPath.get('documentacion:documentos-de-empleados:docs-empleados-mensuales')?.keys).toEqual([
      'documentacion',
      'empleados',
    ]);
    // Contenedor estructural: Certificación no depende de que Clientes no herede del núcleo.
    expect(byPath.get('comercial:comerce:certificaciones')?.keys).toEqual(['certificacion', 'clientes']);
    expect(byPath.get('dashboard:principal')?.keys).toEqual([]);
  });
});

describe('catálogo de módulos: grafo de dependencias', () => {
  it('no hay ciclos y el núcleo no depende de nadie', () => {
    for (const key of MODULE_KEYS) {
      expect(requiresClosure(key).has(key), `ciclo en ${key}`).toBe(false);
    }
    expect(MODULE_CATALOG.nucleo.requires).toEqual([]);
    expect(MODULE_CATALOG.nucleo.core).toBe(true);
  });

  it('las dependencias nombran claves existentes y ninguna clave depende del núcleo', () => {
    for (const key of MODULE_KEYS) {
      const def = MODULE_CATALOG[key];
      for (const dep of [...def.requires, ...def.softDeps, ...(def.requiresAny ?? []).flat()]) {
        expect(MODULE_KEYS).toContain(dep);
        expect(dep).not.toBe(CORE_MODULE);
      }
      expect(def.key).toBe(key);
    }
  });

  it('requiresAny: Documentación funciona con Empleados O con Equipos', () => {
    expect(missingDependencies('documentacion', new Set(['empleados']))).toEqual([]);
    expect(missingDependencies('documentacion', new Set(['equipos']))).toEqual([]);
    expect(missingDependencies('documentacion', new Set())).toEqual(['empleados', 'equipos']);
    expect(dependentsOf('empleados')).toContain('documentacion');
  });

  it('decisiones del blueprint: Portal requiere HSE en forma dura y Pagos va separado de Compras', () => {
    expect(MODULE_CATALOG.portal.requires).toContain('hse');
    expect(MODULE_CATALOG.pagos.requires).toEqual(expect.arrayContaining(['compras', 'tesoreria']));
    expect(dependentsOf('almacenes')).toEqual(expect.arrayContaining(['gomeria', 'indumentaria', 'compras', 'pagos']));
  });

  it('el orden de apagado pone primero a los dependientes', () => {
    const order = shutdownOrder(['almacenes', 'compras', 'pagos', 'gomeria']);
    expect(order.indexOf('pagos')).toBeLessThan(order.indexOf('compras'));
    expect(order.indexOf('compras')).toBeLessThan(order.indexOf('almacenes'));
    expect(order.indexOf('gomeria')).toBeLessThan(order.indexOf('almacenes'));
  });

  it('el núcleo siempre está encendido', () => {
    expect(isModuleEnabled(new Set(), 'nucleo')).toBe(true);
    expect(isModuleEnabled(new Set(), 'hse')).toBe(false);
  });
});

describe('catálogo de módulos: recursos con dueño', () => {
  it('cada job, bucket, recurso externo y entrada móvil tiene exactamente un dueño', () => {
    const owners = <T extends string>(values: readonly T[], pick: (key: ModuleKey) => readonly string[]) =>
      values.map((value) => ({ value, owners: MODULE_KEYS.filter((key) => pick(key).includes(value)) }));
    for (const entry of [
      ...owners(JOB_NAMES, (key) => MODULE_CATALOG[key].jobs),
      ...owners(STORAGE_BUCKETS, (key) => MODULE_CATALOG[key].buckets),
      ...owners(MOBILE_MODULES, (key) => MODULE_CATALOG[key].mobile ?? []),
      ...owners(
        ['employees', 'vehicles', 'other-equipment', 'customers', 'commercial-sectors', 'customer-areas'],
        (key) => MODULE_CATALOG[key].externalResources ?? []
      ),
    ]) {
      expect(entry.owners, entry.value).toHaveLength(1);
    }
  });

  it('cada recurso de la API externa existe como ruta', () => {
    const declared = MODULE_KEYS.flatMap((key) => MODULE_CATALOG[key].externalResources ?? []);
    for (const resource of declared) {
      expect(() => readFileSync(path.join(ROOT, `src/app/api/external/v1/${resource}/route.ts`))).not.toThrow();
    }
  });
});

describe('catálogo de módulos: rutas', () => {
  it('el prefijo más largo gana', () => {
    expect(moduleForPath('/dashboard')).toBe('nucleo');
    expect(moduleForPath('/dashboard/maintenance')).toBe('mantenimiento');
    expect(moduleForPath('/dashboard/hse/documents/123')).toBe('hse');
    expect(moduleForPath('/dashboard/comercial')).toBe('clientes');
    expect(moduleForPath('/dashboard/comercial/facturacion/nueva')).toBe('facturacion');
    expect(moduleForPath('/dashboard/configuration/companies')).toBe('nucleo');
    expect(moduleForPath('/dashboard/configuration/customers/action')).toBe('clientes');
    expect(moduleForPath('/dashboard/maintenanceX')).toBe('nucleo');
    expect(moduleForPath('/login')).toBeNull();
  });

  it('el QR /maintenance sirve a tres claves y cada subruta exige la suya', () => {
    expect(routeModules('/maintenance')).toEqual(['mantenimiento', 'checklists', 'gomeria']);
    expect(routeModules('/maintenance/equipment/abc')).toEqual(['mantenimiento', 'checklists', 'gomeria']);
    expect(routeModules('/maintenance/equipment/abc/checklists/xyz')).toEqual(['checklists']);
    expect(routeModules('/maintenance/equipment/abc/tire-service')).toEqual(['gomeria']);
    expect(routeModules('/maintenance/equipment/abc/request')).toEqual(['mantenimiento']);
    expect(routeModules('/dashboard/configuration')).toBeNull();
    expect(routeModules('/portal/login')).toEqual(['portal']);
  });

  it('cada segmento de /dashboard tiene un dueño explícito (no cae en el núcleo por omisión)', () => {
    const expected: Record<string, ModuleKey> = {
      comercial: 'clientes',
      configuration: 'nucleo',
      document: 'documentacion',
      employee: 'empleados',
      equipment: 'equipos',
      forms: 'formularios',
      help: 'nucleo',
      hse: 'hse',
      maintenance: 'mantenimiento',
      notifications: 'nucleo',
      operations: 'operaciones',
      purchases: 'compras',
      recruitment: 'seleccion',
      treasury: 'tesoreria',
      warehouse: 'almacenes',
    };
    for (const [segment, key] of Object.entries(expected)) {
      expect(moduleForPath(`/dashboard/${segment}`), segment).toBe(key);
    }
  });
});

describe('catálogo de módulos: coherencia con el esquema (FK obligatorias)', () => {
  const { models, required } = parseSchema();

  it('todo modelo de schema.prisma tiene exactamente un dueño', () => {
    const problems = models
      .map((model) => ({ model, owners: ownerOfTable(model) }))
      .filter((entry) => entry.owners.length !== 1)
      .map((entry) => `${entry.model}: ${entry.owners.join(', ') || 'sin dueño'}`);
    expect(problems).toEqual([]);
    const declared = MODULE_KEYS.flatMap((key) => MODULE_CATALOG[key].tables);
    expect(declared.filter((table) => !models.includes(table))).toEqual([]);
    expect([...UNGATED_TABLES, ...Object.keys(TABLE_ALSO_REQUIRES)].filter((t) => !models.includes(t))).toEqual([]);
  });

  it('una FK obligatoria solo apunta al núcleo, a la propia clave o a una que la clave requiere', () => {
    const violations: string[] = [];
    for (const relation of required) {
      const [from] = ownerOfTable(relation.from);
      const [to] = ownerOfTable(relation.to);
      if (!from || !to || to === from || to === CORE_MODULE) continue;
      if (requiresClosure(from).has(to)) continue;
      if (TABLE_ALSO_REQUIRES[relation.from]?.includes(to)) continue;
      violations.push(`${relation.from}.${relation.field} (${from}) → ${relation.to} (${to})`);
    }
    expect(violations).toEqual([]);
  });
});
