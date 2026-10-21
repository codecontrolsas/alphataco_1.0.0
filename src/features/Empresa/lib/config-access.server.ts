import 'server-only';

import { canViewServer, checkPermissionServer } from '@/features/Permissions/actionsServer';

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
  | 'org-chart'
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

/** Pestaña que consume un selector: `[módulo, tab]` con las mismas claves que `permissions-map.ts`. */
export type ViewerTab = readonly [moduleSlug: string, tabSlug: string];

/** Mensaje de una lectura de selector denegada (se muestra tal cual: no es una lista vacía). */
export const SELECTOR_DENIED_MESSAGE = 'No tenés permiso para ver estas opciones.';

/** `true` si el usuario tiene `view` en AL MENOS UNA de las pestañas (`canViewServer`: incluye el `view` inferido). */
export async function hasAnyViewServer(tabs: readonly ViewerTab[]): Promise<boolean> {
  for (const [moduleSlug, tabSlug] of tabs) {
    if (await canViewServer(moduleSlug, tabSlug)) return true;
  }
  return false;
}

/**
 * Guard de las lecturas "selector" de los catálogos de Configuración (opciones de un combo, ids
 * asignados a un registro). Se permite si el usuario ve CUALQUIERA de las pestañas que consumen
 * ese selector —el catálogo en Configuración y los formularios de otros módulos que lo usan—. Sin
 * permiso lanza `ConfigPermissionError`: nunca devuelve `[]`, que se leería como "no hay opciones".
 * Va FUERA del `try` de la lectura para que el `catch` que devuelve `[]` no lo trague.
 */
export async function requireAnyView(tabs: readonly ViewerTab[]): Promise<void> {
  if (!(await hasAnyViewServer(tabs))) throw new ConfigPermissionError(SELECTOR_DENIED_MESSAGE);
}
