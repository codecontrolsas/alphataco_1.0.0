import 'server-only';

import { resolveViewScope, type ViewScope } from '@/features/Permissions/lib/view-scope.server';
import type { Prisma } from '@/generated/prisma/client';

/**
 * Alcance de los pedidos de materiales: empresa + visibilidad. Es la ÚNICA definición: la usan la lista,
 * el export, las facetas, la banda de atención y el contador de la sub-navegación, así sus números
 * coinciden siempre con lo que se ve al filtrar la tabla.
 */
export type RequestScope = ViewScope;

/** Empresa + visibilidad. `null` = sin acceso (sin `view` o sin perfil). */
export const resolveRequestScope = () => resolveViewScope('almacenes', 'pedidos');

/** Condiciones de alcance (empresa y, sin `view_all_requests`, solo los pedidos propios). */
export function requestScopeConditions(scope: RequestScope): Prisma.material_requestsWhereInput[] {
  const conditions: Prisma.material_requestsWhereInput[] = [{ company_id: scope.companyId }];
  if (scope.ownProfileId) conditions.push({ requested_by: scope.ownProfileId });
  return conditions;
}
