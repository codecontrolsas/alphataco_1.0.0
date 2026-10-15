import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { cache } from 'react';

/** Tabs/subtabs del módulo `dashboard` con permiso `view` propio (ver permissions-map.ts). */
export type DashboardTab =
  | 'principal'
  | 'empleados'
  | 'vehiculos'
  | 'operaciones'
  | 'rrhh'
  | 'mantenimiento'
  | 'desvios';

/**
 * Mensaje que ven los consumidores cuando se deniega la lectura. Las acciones LANZAN este error en
 * vez de devolver [] o 0: un vacío se lee como buena noticia y acá fue falta de permiso.
 */
export const DASHBOARD_FORBIDDEN_MESSAGE = 'No tenés permiso para ver esta información';

/** Memoizado por request: varias acciones del mismo render comparten una sola consulta. */
export const canViewDashboard = cache(
  async (tab: DashboardTab): Promise<boolean> => checkPermissionServer('dashboard', tab, 'view')
);

/** Corta la acción si el usuario no tiene `dashboard:<tab>:view`. Va ANTES de cualquier lectura. */
export async function requireDashboardView(tab: DashboardTab): Promise<void> {
  if (!(await canViewDashboard(tab))) {
    throw new Error(DASHBOARD_FORBIDDEN_MESSAGE);
  }
}
