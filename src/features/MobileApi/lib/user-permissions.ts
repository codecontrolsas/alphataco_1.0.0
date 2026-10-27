import 'server-only';

import { createTabVisibilityChecker } from '@/features/Permissions/lib/tab-visibility';
import type { MobilePermissionKey } from '@/features/Permissions/permission-catalog';
import { prismaBase } from '@/shared/lib/prisma';
import { runWithTenantContext, type TenantContext } from '@/shared/lib/tenant-context';

/** Permisos del usuario de la petición móvil, resueltos UNA vez por petición. */
export interface MobilePermissions {
  /** Permiso explícito (igual que `checkPermissionServer`). Solo acepta claves que la app declara usar. */
  has: (key: MobilePermissionKey) => boolean;
  /**
   * Visibilidad de una pestaña con la regla única de la web (`createTabVisibilityChecker`, igual que `canViewServer`):
   * `view` propio o de alguna subpestaña.
   */
  isTabVisible: (key: MobilePermissionKey) => boolean;
}

/**
 * Lee TODOS los permisos del usuario en la empresa con la misma función de la base que usa la web
 * (`get_user_permissions`, que es la que consulta `user_has_permission`) y arma el mapa `modulo:tab:accion`.
 * Una sola consulta por petición en vez de una por clave.
 */
export async function loadMobilePermissions(ctx: TenantContext): Promise<MobilePermissions> {
  if (!ctx.userId) return { has: () => false, isTabVisible: () => false };
  const rows = await runWithTenantContext(
    prismaBase,
    ctx,
    (tx) =>
      tx.$queryRaw<{ module_slug: string; tab_slug: string; action_slug: string; is_granted: boolean | null }[]>`
      SELECT module_slug, tab_slug, action_slug, is_granted
      FROM get_user_permissions(${ctx.userId}::uuid, ${ctx.companyId}::uuid)`
  );

  const map: Record<string, boolean> = {};
  // Igual que `user_has_permission` (EXISTS ... is_granted): basta una fila concedida para la clave.
  for (const row of rows) {
    const key = `${row.module_slug}:${row.tab_slug}:${row.action_slug}`;
    map[key] = map[key] === true || row.is_granted === true;
  }
  const isVisible = createTabVisibilityChecker(map);

  return {
    has: (key) => map[key] === true,
    isTabVisible: (key) => {
      const [moduleSlug, tabSlug] = key.split(':');
      return isVisible(moduleSlug, tabSlug);
    },
  };
}
