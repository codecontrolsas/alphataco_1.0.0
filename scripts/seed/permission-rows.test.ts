import { describe, expect, it } from 'vitest';
import { buildPermissionRows, type PermissionsMap } from './permission-rows.ts';

describe('buildPermissionRows', () => {
  it('produce modulos, tabs (con parent_tab_id en subtabs), acciones unicas y role_permissions = tabs x acciones x 3 roles', () => {
    const minimalMap: PermissionsMap = {
      testmodule: {
        slug: 'testmodule',
        name: 'Test Module',
        moduleId: '00000000-0000-0000-0000-000000000001',
        tabs: {
          maintab: {
            slug: 'maintab',
            name: 'Main Tab',
            tabId: '00000000-0000-0000-0000-000000000010',
            parent: null,
            allowedActions: ['view', 'create'],
            subtabs: {
              subtab: {
                slug: 'subtab',
                name: 'Sub Tab',
                tabId: '00000000-0000-0000-0000-000000000011',
                parent: 'maintab',
                allowedActions: ['view', 'create'],
              },
            },
          },
        },
      },
    };

    const result = buildPermissionRows(minimalMap);

    expect(result).toEqual({
      modules: [{ id: '00000000-0000-0000-0000-000000000001', slug: 'testmodule', name: 'Test Module' }],
      tabs: [
        {
          id: '00000000-0000-0000-0000-000000000010',
          moduleId: '00000000-0000-0000-0000-000000000001',
          parentTabId: null,
          slug: 'maintab',
          name: 'Main Tab',
          orderIndex: 0,
        },
        {
          id: '00000000-0000-0000-0000-000000000011',
          moduleId: '00000000-0000-0000-0000-000000000001',
          parentTabId: '00000000-0000-0000-0000-000000000010',
          slug: 'subtab',
          name: 'Sub Tab',
          orderIndex: 0,
        },
      ],
      actions: [
        { slug: 'view', name: 'view' },
        { slug: 'create', name: 'create' },
      ],
      rolePermissions: [
        { roleSlug: 'admin', tabId: '00000000-0000-0000-0000-000000000010', actionSlug: 'view' },
        { roleSlug: 'administrador', tabId: '00000000-0000-0000-0000-000000000010', actionSlug: 'view' },
        {
          roleSlug: 'full-access-provisional',
          tabId: '00000000-0000-0000-0000-000000000010',
          actionSlug: 'view',
        },
        { roleSlug: 'admin', tabId: '00000000-0000-0000-0000-000000000010', actionSlug: 'create' },
        { roleSlug: 'administrador', tabId: '00000000-0000-0000-0000-000000000010', actionSlug: 'create' },
        {
          roleSlug: 'full-access-provisional',
          tabId: '00000000-0000-0000-0000-000000000010',
          actionSlug: 'create',
        },
        { roleSlug: 'admin', tabId: '00000000-0000-0000-0000-000000000011', actionSlug: 'view' },
        { roleSlug: 'administrador', tabId: '00000000-0000-0000-0000-000000000011', actionSlug: 'view' },
        {
          roleSlug: 'full-access-provisional',
          tabId: '00000000-0000-0000-0000-000000000011',
          actionSlug: 'view',
        },
        { roleSlug: 'admin', tabId: '00000000-0000-0000-0000-000000000011', actionSlug: 'create' },
        {
          roleSlug: 'administrador',
          tabId: '00000000-0000-0000-0000-000000000011',
          actionSlug: 'create',
        },
        {
          roleSlug: 'full-access-provisional',
          tabId: '00000000-0000-0000-0000-000000000011',
          actionSlug: 'create',
        },
      ],
    });
  });

  it('deduplica acciones repetidas entre modulos distintos y respeta nombres provistos', () => {
    const map: PermissionsMap = {
      a: {
        slug: 'a',
        name: 'Modulo A',
        moduleId: '00000000-0000-0000-0000-0000000000a1',
        tabs: {
          t1: {
            slug: 't1',
            name: 'Tab 1',
            tabId: '00000000-0000-0000-0000-0000000000a2',
            parent: null,
            allowedActions: ['view'],
          },
        },
      },
      b: {
        slug: 'b',
        name: 'Modulo B',
        moduleId: '00000000-0000-0000-0000-0000000000b1',
        tabs: {
          t2: {
            slug: 't2',
            name: 'Tab 2',
            tabId: '00000000-0000-0000-0000-0000000000b2',
            parent: null,
            allowedActions: ['view', 'delete'],
          },
        },
      },
    };

    const result = buildPermissionRows(map, { view: 'Ver', delete: 'Eliminar' });

    expect(result.actions).toEqual([
      { slug: 'view', name: 'Ver' },
      { slug: 'delete', name: 'Eliminar' },
    ]);
    expect(result.modules).toHaveLength(2);
    expect(result.tabs).toHaveLength(2);
    expect(result.rolePermissions).toHaveLength(9); // t1: 1 accion x 3 roles + t2: 2 acciones x 3 roles
  });
});

describe('PERMISSIONS (mapa real)', () => {
  // Las migraciones insertan tabs con `ON CONFLICT (id) DO UPDATE`: un id repetido entre dos
  // modulos no falla, PISA la tab del otro modulo (nombre y permisos). Paso con Almacenes, que
  // nacio con el prefijo `50000000-` de Documentacion.
  it('no repite ids de modulo ni de tab', async () => {
    const { PERMISSIONS, ACTIONS } = await import('../../src/features/Permissions/permissions-map.ts');
    const actionNames = Object.fromEntries(Object.values(ACTIONS).map((a) => [a.slug, a.name]));
    const { modules, tabs } = buildPermissionRows(PERMISSIONS, actionNames);

    const repeated = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(repeated(modules.map((m) => m.id))).toEqual([]);
    expect(repeated(tabs.map((t) => t.id))).toEqual([]);
    expect(repeated([...modules.map((m) => m.id), ...tabs.map((t) => t.id)])).toEqual([]);
  });
});
