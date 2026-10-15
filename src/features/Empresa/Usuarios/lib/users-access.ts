import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';

/** Tab de Configuración que gobierna la lista de usuarios (clave existente en `permissions-map.ts`). */
const USERS_TAB = 'usuarios-empleados';

export const USERS_VIEW_DENIED_MESSAGE = 'No tenés permiso para ver los usuarios de la empresa.';

/** `true` si el usuario de la sesión puede ver la lista de usuarios (`configuracion:usuarios-empleados:view`). */
export function canViewCompanyUsers(): Promise<boolean> {
  return checkPermissionServer('configuracion', USERS_TAB, 'view');
}

/** Lanza si falta el permiso `view`. Las lecturas nunca devuelven vacío/0 ante una denegación. */
export async function assertCanViewCompanyUsers(): Promise<void> {
  if (!(await canViewCompanyUsers())) throw new Error(USERS_VIEW_DENIED_MESSAGE);
}
