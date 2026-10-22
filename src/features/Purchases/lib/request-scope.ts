import 'server-only';

import { resolveViewScope, type ViewScope } from '@/features/Permissions/lib/view-scope.server';
import type { Prisma } from '@/generated/prisma/client';

/**
 * Alcance de las solicitudes de compra: empresa + visibilidad. Es la ÚNICA definición: la usan la lista,
 * el export, las facetas, la banda de atención y el contador de la sub-navegación, así sus números
 * coinciden siempre con lo que se ve al filtrar la tabla.
 */
export type PurchaseRequestScope = ViewScope;

/** Empresa + visibilidad. `null` = sin acceso (sin `view` o sin perfil). */
export const resolvePurchaseRequestScope = () => resolveViewScope('compras', 'solicitudes');

/** Condiciones de alcance (empresa y, sin `view_all_requests`, solo las solicitudes propias). */
export function purchaseRequestScopeConditions(scope: PurchaseRequestScope): Prisma.purchase_requestsWhereInput[] {
  const conditions: Prisma.purchase_requestsWhereInput[] = [{ company_id: scope.companyId }];
  if (scope.ownProfileId) conditions.push({ requested_by: scope.ownProfileId });
  return conditions;
}
