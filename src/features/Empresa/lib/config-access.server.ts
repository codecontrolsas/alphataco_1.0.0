import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';

/**
 * Permisos de los catálogos de Configuración (módulo `configuracion`) validados en el servidor.
 * Las claves son las mismas que usa la UI (`permissions-map.ts`).
 *
 * Módulo server-only (NO es una Server Action).
 */

export type ConfigTab =
  | 'accesos-externos'
  | 'cost-center'
  | 'organigrama'
  | 'listado'
  | 'diagrams'
  | 'contract-types'
  | 'positions'
  | 'aptitudes'
  | 'convenios'
  | 'tipos'
  | 'marcas'
  | 'modelos'
  | 'subtipos'
  | 'titulares';

export type ConfigAction = 'view' | 'create' | 'update' | 'delete';

const ACTION_LABELS: Record<ConfigAction, string> = {
  view: 'ver',
  create: 'crear',
  update: 'editar',
  delete: 'eliminar',
};

export class ConfigPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigPermissionError';
  }
}

/** Mensaje de error si falta el permiso, o `null` si está permitido (para acciones que devuelven `fail(...)`). */
export async function configPermissionError(tab: ConfigTab, action: ConfigAction): Promise<string | null> {
  if (await checkPermissionServer('configuracion', tab, action)) return null;
  return `No tenés permiso para ${ACTION_LABELS[action]} este recurso de Configuración.`;
}

/** Lanza `ConfigPermissionError` si el usuario no tiene `action` sobre la tab `tab` de Configuración. */
export async function requireConfigTabPermission(tab: ConfigTab, action: ConfigAction): Promise<void> {
  const message = await configPermissionError(tab, action);
  if (message) throw new ConfigPermissionError(message);
}

/** Mensaje legible para el cliente: los errores lanzados se enmascaran en producción. */
export function configFailureMessage(error: unknown, fallback: string): string {
  if (error instanceof ConfigPermissionError) return error.message;
  return fallback;
}
