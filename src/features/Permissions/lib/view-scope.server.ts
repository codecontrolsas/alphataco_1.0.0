import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { getActiveCompanyId } from '@/shared/lib/tenant';

/** Alcance de lo que el usuario puede ver en una pestaña: su empresa y, si no ve todo, solo lo propio. */
export interface ViewScope {
  companyId: string;
  /** Si no es null, el usuario solo ve los registros que creó (sin `view_all_requests`). */
  ownProfileId: string | null;
}

/**
 * Empresa + visibilidad de una pestaña con `view` y `view_all_requests` (solicitudes de compra, pedidos
 * de almacén). `null` = sin acceso (sin `view` o sin perfil).
 */
export async function resolveViewScope(moduleSlug: string, tabSlug: string): Promise<ViewScope | null> {
  const [canView, canViewAll] = await Promise.all([
    checkPermissionServer(moduleSlug, tabSlug, 'view'),
    checkPermissionServer(moduleSlug, tabSlug, 'view_all_requests'),
  ]);
  if (!canView) return null;

  const companyId = await getActiveCompanyId();
  if (canViewAll) return { companyId, ownProfileId: null };

  const profile = await getServerAuthProfile();
  if (!profile) return null;
  return { companyId, ownProfileId: profile.id };
}
