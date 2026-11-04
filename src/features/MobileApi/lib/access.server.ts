import 'server-only';

import type { TenantContext } from '@/shared/lib/tenant-context';
import { resolveDocumentAccess, type DocumentAccess } from '../documents/access';
import { resolveEmployeeAccess, type EmployeeAccess } from '../employees/access';
import { resolveEquipmentAccess, type EquipmentAccess } from '../equipment/access';
import { resolveTrainingAccess, type TrainingAccess } from '../trainings/access';
import { resolveDashboardAccess, type DashboardAccess } from '../dashboards/access';
import { resolveSearchAccess, type SearchAccess } from '../search/access';
import { getEnabledModulesFor } from '@/features/Modules/server/modules.server';
import { loadMobilePermissions, type MobileKeyPermissions } from './user-permissions';

/** Todo lo que el usuario de la petición puede ver en la app, con UNA lectura de permisos. */
export async function loadMobileAccess(ctx: TenantContext): Promise<{
  employees: EmployeeAccess;
  equipment: EquipmentAccess;
  documents: DocumentAccess;
  training: TrainingAccess;
  /** Los permisos ya leídos, para resolver con ellos lo que dependa de los módulos de la empresa (tableros, búsqueda). */
  perms: MobileKeyPermissions;
}> {
  const perms = await loadMobilePermissions(ctx);
  return {
    employees: resolveEmployeeAccess(perms),
    equipment: resolveEquipmentAccess(perms),
    documents: resolveDocumentAccess(perms),
    training: resolveTrainingAccess(perms),
    perms,
  };
}

export async function loadEquipmentAccess(ctx: TenantContext): Promise<EquipmentAccess> {
  return resolveEquipmentAccess(await loadMobilePermissions(ctx));
}

export async function loadDocumentAccess(ctx: TenantContext): Promise<DocumentAccess> {
  return resolveDocumentAccess(await loadMobilePermissions(ctx));
}

export async function loadTrainingAccess(ctx: TenantContext): Promise<TrainingAccess> {
  return resolveTrainingAccess(await loadMobilePermissions(ctx));
}

/** Tableros: permisos de la web (widgets visibles) y módulos encendidos de la empresa. */
export async function loadDashboardAccess(ctx: TenantContext): Promise<DashboardAccess> {
  const [perms, enabled] = await Promise.all([loadMobilePermissions(ctx), getEnabledModulesFor(ctx.companyId)]);
  return resolveDashboardAccess(perms, enabled);
}

/** Búsqueda global: qué grupos puede ver (permisos de las listas y módulos encendidos). */
export async function loadSearchAccess(ctx: TenantContext): Promise<SearchAccess> {
  const [perms, enabled] = await Promise.all([loadMobilePermissions(ctx), getEnabledModulesFor(ctx.companyId)]);
  return resolveSearchAccess(perms, enabled);
}
