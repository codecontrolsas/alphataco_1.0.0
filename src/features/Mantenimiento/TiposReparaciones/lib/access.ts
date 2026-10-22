import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';

/**
 * Permisos de la configuración de Tipos de Reparación y Grupos. Las claves son las que usa la
 * UI (`EmpresaComponent` y los formularios): `configuracion:type_of_repair` y
 * `configuracion:maintenance_groups`.
 *
 * Módulo server-only (NO es una Server Action).
 */

type ConfigTab = 'type_of_repair' | 'maintenance_groups';
type ConfigAction = 'view' | 'create' | 'update' | 'delete';

export class ConfigPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigPermissionError';
  }
}

export async function requireConfigPermission(tab: ConfigTab, action: ConfigAction): Promise<void> {
  if (!(await checkPermissionServer('configuracion', tab, action))) {
    throw new ConfigPermissionError('No tenés permiso para realizar esta acción');
  }
}

/** Mensaje legible para el cliente: los errores lanzados se enmascaran en producción. */
export function failureMessage(error: unknown, fallback: string): string {
  if (error instanceof ConfigPermissionError) return error.message;
  return fallback;
}
