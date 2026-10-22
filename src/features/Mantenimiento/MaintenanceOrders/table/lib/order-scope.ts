import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { getHiddenEquipmentTypeIds } from '../../../utils/equipmentTypeVisibility';

/**
 * Listado "En Taller" y sus métricas: cada una exige `view` de `mantenimiento/ordenes_mantenimiento` (la
 * misma tab que muestra la UI) y resuelve la empresa y los tipos ocultos en el servidor.
 */
const MODULE = 'mantenimiento';
const TAB = 'ordenes_mantenimiento';

/** Perímetro del usuario actual, o `null` si no puede ver el paso. */
export async function resolveOrdersScope() {
  if (!(await checkPermissionServer(MODULE, TAB, 'view'))) return null;
  const [companyId, hiddenTypeIds] = await Promise.all([getActiveCompanyId(), getHiddenEquipmentTypeIds()]);
  return { companyId, hiddenTypeIds };
}
