'use client';

import { useMemo } from 'react';

/** Verificador de permisos armado desde el mapa plano que serializa el servidor. */
export type PermissionChecker = {
  hasPermission: (module: string, tab: string, action: string) => boolean;
};

/**
 * Arma el verificador de permisos de una tabla a partir del mapa `"modulo:tab:accion" -> boolean` que el
 * Server Component le pasa como prop (no se vuelve a pedir en el cliente).
 */
export function usePermissionChecker(permissionsMap: Record<string, boolean>): PermissionChecker {
  return useMemo(
    () => ({
      hasPermission: (module: string, tab: string, action: string) =>
        permissionsMap[`${module}:${tab}:${action}`] === true,
    }),
    [permissionsMap]
  );
}
