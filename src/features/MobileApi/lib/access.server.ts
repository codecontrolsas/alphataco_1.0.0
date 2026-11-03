import 'server-only';

import type { TenantContext } from '@/shared/lib/tenant-context';
import { resolveDocumentAccess, type DocumentAccess } from '../documents/access';
import { resolveEmployeeAccess, type EmployeeAccess } from '../employees/access';
import { resolveEquipmentAccess, type EquipmentAccess } from '../equipment/access';
import { loadMobilePermissions } from './user-permissions';

/** Todo lo que el usuario de la petición puede ver en la app, con UNA lectura de permisos. */
export async function loadMobileAccess(ctx: TenantContext): Promise<{
  employees: EmployeeAccess;
  equipment: EquipmentAccess;
  documents: DocumentAccess;
}> {
  const perms = await loadMobilePermissions(ctx);
  return {
    employees: resolveEmployeeAccess(perms),
    equipment: resolveEquipmentAccess(perms),
    documents: resolveDocumentAccess(perms),
  };
}

export async function loadEquipmentAccess(ctx: TenantContext): Promise<EquipmentAccess> {
  return resolveEquipmentAccess(await loadMobilePermissions(ctx));
}

export async function loadDocumentAccess(ctx: TenantContext): Promise<DocumentAccess> {
  return resolveDocumentAccess(await loadMobilePermissions(ctx));
}
