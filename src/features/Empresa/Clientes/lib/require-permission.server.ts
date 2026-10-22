import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';

type ComercialAction = 'view' | 'create' | 'update' | 'delete' | 'view_prices' | 'update_prices';

const ACTION_LABELS: Record<ComercialAction, string> = {
  view: 'ver',
  create: 'crear',
  update: 'editar',
  delete: 'eliminar',
  view_prices: 'ver importes de',
  update_prices: 'modificar importes de',
};

/**
 * Verifica en el servidor que el usuario tenga `action` sobre la tab `tab` del módulo Comercial.
 * Devuelve `null` si está permitido, o el mensaje de error para devolver con `fail(...)`.
 */
export async function requireComercialPermission(tab: string, action: ComercialAction): Promise<string | null> {
  const allowed = await checkPermissionServer('comercial', tab, action);
  if (allowed) return null;
  return `No tenés permiso para ${ACTION_LABELS[action]} este recurso del módulo Comercial.`;
}

/** `true` si el usuario tiene `action` en AL MENOS UNA de las pestañas (`tabs`) del módulo Comercial. */
export async function hasAnyComercialPermission(tabs: readonly string[], action: ComercialAction): Promise<boolean> {
  const results = await Promise.all(tabs.map((tab) => checkPermissionServer('comercial', tab, action)));
  return results.some(Boolean);
}

/**
 * Lanza si el usuario no tiene `view` en NINGUNA de las pestañas (`tabs`) del módulo Comercial.
 * Para lecturas que alimentan más de una pestaña (p. ej. catálogos que consume la pantalla de Contratos).
 */
export async function assertComercialView(tabs: readonly string[]): Promise<void> {
  if (await hasAnyComercialPermission(tabs, 'view')) return;
  throw new Error(`No tenés permiso para ${ACTION_LABELS.view} este recurso del módulo Comercial.`);
}
