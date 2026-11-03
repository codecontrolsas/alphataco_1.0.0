import type { MobilePermissionKey } from '@/features/Permissions/permission-catalog';
import type { DocumentResource } from '../contracts/documents';
import type { MobilePermissions } from '../lib/user-permissions';

/**
 * Qué puede ver de Documentación el usuario de la app móvil, con las reglas de la web:
 *
 * - Listas (`assertDocumentListAccess` / `loadAuthorizedCompanyDocumentRows`): la pestaña del recurso visible y el
 *   `view` de la subpestaña de permanentes o de mensuales. Los tipos privados, con `view_private` de la pestaña.
 * - Ficha de un documento (`assertDocumentDetailView`): `detalle-de-documento:view`. La app además exige poder ver la
 *   lista de ese recurso y período (no se llega a una ficha sin pasar por su lista).
 *
 * Los MÓDULOS no se resuelven acá (no son permisos): los documentos de empleados exigen además `empleados` y los de
 * equipos, `equipos` (`TAB_ALSO_REQUIRES` del catálogo). Ver `allowedResources`.
 */

const TABS: Record<
  DocumentResource,
  { tab: MobilePermissionKey; permanent: MobilePermissionKey; monthly: MobilePermissionKey; private: MobilePermissionKey }
> = {
  employee: {
    tab: 'documentacion:documentos-de-empleados:view',
    permanent: 'documentacion:docs-empleados-permanentes:view',
    monthly: 'documentacion:docs-empleados-mensuales:view',
    private: 'documentacion:documentos-de-empleados:view_private',
  },
  equipment: {
    tab: 'documentacion:documentos-de-equipos:view',
    permanent: 'documentacion:docs-equipos-permanentes:view',
    monthly: 'documentacion:docs-equipos-mensuales:view',
    private: 'documentacion:documentos-de-equipos:view_private',
  },
  company: {
    tab: 'documentacion:documentos-de-empresa:view',
    permanent: 'documentacion:docs-empresa-permanentes:view',
    monthly: 'documentacion:docs-empresa-mensuales:view',
    private: 'documentacion:documentos-de-empresa:view_private',
  },
};

function resourceAccess(perms: MobilePermissions, resource: DocumentResource) {
  const keys = TABS[resource];
  const tab = perms.isTabVisible(keys.tab);
  return {
    permanent: tab && perms.has(keys.permanent),
    monthly: tab && perms.has(keys.monthly),
    privateTypes: perms.has(keys.private),
  };
}

export function resolveDocumentAccess(perms: MobilePermissions) {
  return {
    employee: resourceAccess(perms, 'employee'),
    equipment: resourceAccess(perms, 'equipment'),
    company: resourceAccess(perms, 'company'),
    detail: perms.has('documentacion:detalle-de-documento:view'),
  };
}

export type DocumentAccess = ReturnType<typeof resolveDocumentAccess>;
export type ResourceDocumentAccess = DocumentAccess['employee'];

/** Módulo que, además de `documentacion`, exige cada clase de recurso (`TAB_ALSO_REQUIRES`). */
export const RESOURCE_MODULE = { employee: 'empleados', equipment: 'equipos', company: null } as const;

/**
 * Clases de recurso que el usuario puede listar en esta empresa: permiso de alguna de sus listas y el módulo de la
 * clase encendido.
 */
export function allowedResources(access: DocumentAccess, enabledModules: ReadonlySet<string>): DocumentResource[] {
  return (['employee', 'equipment', 'company'] as const).filter((resource) => {
    const required = RESOURCE_MODULE[resource];
    if (required && !enabledModules.has(required)) return false;
    return access[resource].permanent || access[resource].monthly;
  });
}

/** Puede ver la lista de ese recurso y período. */
export function canListPeriod(access: ResourceDocumentAccess, monthly: boolean): boolean {
  return monthly ? access.monthly : access.permanent;
}
