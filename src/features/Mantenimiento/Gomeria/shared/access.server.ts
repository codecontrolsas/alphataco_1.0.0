import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { prisma } from '@/shared/lib/prisma';
import { getSessionEmployeeIdClaim } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';

/**
 * Permisos de servidor de Gomería (módulo `mantenimiento`).
 *
 * Sin RLS cada `'use server'` exportado es un endpoint público: el permiso se verifica acá
 * y no en el botón del cliente. Hay DOS caminos según quién llama:
 *
 * 1. **Dashboard** (`requireGomeriaPermission`): el usuario tiene empresa activa y se exige la
 *    acción de la pestaña que corresponde (leer = view, crear = create, editar = update,
 *    borrar = delete).
 * 2. **Operación por recurso** (`requireGomeriaAccessForCompany`): la operación de gomería
 *    también corre desde el QR del equipo, donde el operario tiene sesión con el legajo
 *    validado por CUIL pero NO roles del dashboard. Se acepta el permiso del dashboard (sobre
 *    la empresa activa, que tiene que ser la del recurso) O ser un empleado activo de la
 *    empresa del recurso (claim `employeeId` de la sesión, que sólo escribe el servidor).
 *
 * Módulo server-only (NO es una Server Action).
 */

const MODULE_SLUG = 'mantenimiento';

export type GomeriaTab =
  | 'catalogo_cubiertas'
  | 'plantillas_cubiertas'
  | 'ordenes_gomeria'
  | 'marcas_cubiertas'
  | 'tipos_cubiertas';

export type GomeriaAction = 'view' | 'create' | 'update' | 'delete';

const ACTION_VERBS: Record<GomeriaAction, string> = {
  view: 'ver',
  create: 'crear',
  update: 'modificar',
  delete: 'eliminar',
};

/**
 * La pestaña Cubiertas de la ficha de Equipos (`equipos:cubiertas-equipo`) embebe el detalle de las órdenes de
 * gomería y los depósitos de devolución: quien puede VER esa pestaña puede LEER esos datos aunque no tenga
 * `mantenimiento:ordenes_gomeria:view`. Solo aplica a lecturas de órdenes.
 */
async function canReadViaEquipmentTires(tab: GomeriaTab, action: GomeriaAction): Promise<boolean> {
  if (tab !== 'ordenes_gomeria' || action !== 'view') return false;
  const [canView, canUpdate] = await Promise.all([
    checkPermissionServer('equipos', 'cubiertas-equipo', 'view'),
    checkPermissionServer('equipos', 'cubiertas-equipo', 'update'),
  ]);
  return canView || canUpdate;
}

/** Dashboard: exige la acción en la pestaña y devuelve la empresa activa. */
export async function requireGomeriaPermission(tab: GomeriaTab, action: GomeriaAction): Promise<string> {
  const [allowed, companyId] = await Promise.all([
    checkPermissionServer(MODULE_SLUG, tab, action),
    getActiveCompanyId(),
  ]);
  if (!allowed && !(await canReadViaEquipmentTires(tab, action))) {
    throw new Error(`No tenés permiso para ${ACTION_VERBS[action]} en Gomería`);
  }
  return companyId;
}

/**
 * Dashboard: alcanza con UNA de las acciones indicadas (los desplegables de un formulario los
 * usa quien puede ver el catálogo de origen o quien puede cargar el formulario que los consume).
 */
export async function requireAnyGomeriaPermission(
  checks: ReadonlyArray<readonly [GomeriaTab, GomeriaAction]>
): Promise<string> {
  const [results, companyId] = await Promise.all([
    Promise.all(checks.map(([tab, action]) => checkPermissionServer(MODULE_SLUG, tab, action))),
    getActiveCompanyId(),
  ]);
  if (!results.some(Boolean)) throw new Error('No tenés permiso para esta operación de Gomería');
  return companyId;
}

/** ¿La sesión es de un empleado activo de `companyId`? (legajo validado por el login del QR). */
async function isEmployeeOfCompany(companyId: string): Promise<boolean> {
  const employeeId = await getSessionEmployeeIdClaim();
  if (!employeeId) return false;
  const employee = await prisma.employees.findFirst({
    where: { id: employeeId, company_id: companyId, is_active: true },
    select: { id: true },
  });
  return employee !== null;
}

/**
 * Operación sobre un recurso de la empresa `companyId` (derivada del vehículo o de la orden):
 * permiso del dashboard sobre esa empresa activa O empleado de esa empresa (flujo del QR).
 */
export async function requireGomeriaAccessForCompany(
  companyId: string,
  tab: GomeriaTab,
  action: GomeriaAction
): Promise<void> {
  const activeCompanyId = await getActiveCompanyId().catch(() => null);
  if (activeCompanyId === companyId && (await checkPermissionServer(MODULE_SLUG, tab, action))) return;
  if (activeCompanyId === companyId && (await canReadViaEquipmentTires(tab, action))) return;
  if (await isEmployeeOfCompany(companyId)) return;
  throw new Error(`No tenés permiso para ${ACTION_VERBS[action]} en Gomería`);
}
