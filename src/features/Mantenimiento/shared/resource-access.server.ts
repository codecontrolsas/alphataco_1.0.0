import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { prisma } from '@/shared/lib/prisma';
import { getSessionEmployeeIdClaim, getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { getResourceCompanyId } from './resource-company';
import type { MaintenanceResourceKind } from './maintenance-resource';

/**
 * Acceso a un recurso de mantenimiento (vehículo o equipamiento) con DOS caminos.
 *
 * Sin RLS cada `'use server'` exportado es un endpoint público, y varias acciones de
 * Mantenimiento reciben del cliente un `equipmentId` y derivaban la empresa del propio
 * equipo: eso sirve para que el QR funcione sin ser miembro, pero dejaba a CUALQUIERA (incluso
 * sin sesión) operar sobre el equipo de cualquier empresa. Acá la empresa del recurso sigue
 * saliendo del recurso, pero el que llama tiene que probar que pertenece a ella:
 *
 * 1. **Operario del QR** (`field`): la sesión tiene el claim de legajo que escribió el login
 *    por CUIL (`writeMaintenanceClaims`, server-only) y ese empleado es de la empresa del
 *    recurso y está activo.
 * 2. **Dashboard** (`dashboard`): la empresa ACTIVA de la sesión es la del recurso y el
 *    usuario tiene alguno de los permisos pedidos (si no se pide ninguno, alcanza con la
 *    pertenencia a la empresa activa: lectura sin tab propia).
 *
 * Sin sesión, o con ninguno de los dos caminos, lanza. Módulo server-only (NO es Server Action).
 */

export type ResourceAccessVia = 'field' | 'dashboard';

export interface ResourcePermission {
  module: string;
  tab: string;
  action: string;
}

export interface ResourceAccess {
  companyId: string;
  via: ResourceAccessVia;
}

const FORBIDDEN_MESSAGE = 'No tenés acceso a este equipo';

/** `true` si el claim de legajo de la sesión es un empleado activo de `companyId`. */
async function isFieldEmployeeOfCompany(companyId: string): Promise<boolean> {
  const employeeId = await getSessionEmployeeIdClaim();
  if (!employeeId) return false;

  const employee = await prisma.employees.findFirst({
    where: { id: employeeId, company_id: companyId, NOT: { is_active: false } },
    select: { id: true },
  });
  return !!employee;
}

/** `true` si `companyId` es la empresa activa de la sesión y el usuario tiene algún permiso pedido. */
async function hasDashboardAccess(companyId: string, permissions: ResourcePermission[]): Promise<boolean> {
  let activeCompanyId: string;
  try {
    activeCompanyId = await getActiveCompanyId();
  } catch {
    return false;
  }
  if (activeCompanyId !== companyId) return false;
  if (permissions.length === 0) return true;

  for (const permission of permissions) {
    if (await checkPermissionServer(permission.module, permission.tab, permission.action)) return true;
  }
  return false;
}

/**
 * Valida el acceso a la empresa `companyId` (ya resuelta del recurso) por cualquiera de los dos
 * caminos. Lanza si no corresponde ninguno.
 */
export async function requireCompanyAccessForResource(
  companyId: string,
  options?: { dashboardPermissions?: ResourcePermission[] }
): Promise<ResourceAccess> {
  if (!(await getSessionUserId())) throw new Error('Usuario no autenticado');

  if (await isFieldEmployeeOfCompany(companyId)) return { companyId, via: 'field' };

  if (await hasDashboardAccess(companyId, options?.dashboardPermissions ?? [])) {
    return { companyId, via: 'dashboard' };
  }

  throw new Error(FORBIDDEN_MESSAGE);
}

/**
 * Resuelve la empresa del recurso (vehículo o equipamiento) y valida el acceso por los dos
 * caminos. Devuelve la empresa y por cuál camino entró.
 */
export async function requireResourceAccess(
  kind: MaintenanceResourceKind | undefined,
  resourceId: string,
  options?: { dashboardPermissions?: ResourcePermission[] }
): Promise<ResourceAccess> {
  const companyId = await getResourceCompanyId(prisma, kind, resourceId);
  return requireCompanyAccessForResource(companyId, options);
}

/** Permiso del dashboard para crear pedidos/solicitudes (tab Nuevo Pedido, módulo Mantenimiento). */
export const NUEVO_PEDIDO_CREATE: ResourcePermission = {
  module: 'mantenimiento',
  tab: 'nuevo_pedido',
  action: 'create',
};

/** Permiso del dashboard para ver la tab Nuevo Pedido (lecturas de apoyo del formulario). */
export const NUEVO_PEDIDO_VIEW: ResourcePermission = {
  module: 'mantenimiento',
  tab: 'nuevo_pedido',
  action: 'view',
};
