import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import type { Prisma } from '@/generated/prisma/client';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { getActiveCompanyId } from '@/shared/lib/tenant';

/**
 * Alcance de los pedidos de materiales: empresa + visibilidad. Es la ÚNICA definición: la usan la lista,
 * el export, las facetas, la banda de atención y el contador de la sub-navegación, así sus números
 * coinciden siempre con lo que se ve al filtrar la tabla.
 */
export interface RequestScope {
  companyId: string;
  /** Si no es null, el usuario solo ve sus propios pedidos (sin `view_all_requests`). */
  ownProfileId: string | null;
}

/** Empresa + visibilidad. `null` = sin acceso (sin `view` o sin perfil). */
export async function resolveRequestScope(): Promise<RequestScope | null> {
  const [canView, canViewAll] = await Promise.all([
    checkPermissionServer('almacenes', 'pedidos', 'view'),
    checkPermissionServer('almacenes', 'pedidos', 'view_all_requests'),
  ]);
  if (!canView) return null;

  const companyId = await getActiveCompanyId();
  if (canViewAll) return { companyId, ownProfileId: null };

  const profile = await getServerAuthProfile();
  if (!profile) return null;
  return { companyId, ownProfileId: profile.id };
}

/** Condiciones de alcance (empresa y, sin `view_all_requests`, solo los pedidos propios). */
export function requestScopeConditions(scope: RequestScope): Prisma.material_requestsWhereInput[] {
  const conditions: Prisma.material_requestsWhereInput[] = [{ company_id: scope.companyId }];
  if (scope.ownProfileId) conditions.push({ requested_by: scope.ownProfileId });
  return conditions;
}
