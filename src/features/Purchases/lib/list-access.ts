import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import type { AllTabSlugsUnion } from '@/features/Permissions/permissions-map';
import { getActiveCompanyId } from '@/shared/lib/tenant';

type PurchasesTab = AllTabSlugsUnion<'compras'>;

/** Empresa activa si el usuario puede ver la pestaña de Compras; `null` = sin acceso (la lista queda vacía). */
export async function companyIdIfCanView(tab: PurchasesTab): Promise<string | null> {
  if (!(await checkPermissionServer('compras', tab, 'view'))) return null;
  return getActiveCompanyId();
}
