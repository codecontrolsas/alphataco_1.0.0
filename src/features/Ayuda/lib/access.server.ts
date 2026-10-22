import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { cache } from 'react';

/**
 * Permisos de servidor del módulo Ayuda (`ayuda:tickets` y `ayuda:manual`).
 *
 * Sin RLS cada `'use server'` exportado es un endpoint público: el permiso se verifica acá y no en la
 * pestaña del cliente. La identidad reporter/aprobador sigue resolviéndose contra TaskApp (no hay claves
 * nuevas para aprobar, cerrar ni comentar).
 *
 * Ojo: `SupportTicketsRealtimeProvider` (dashboard/layout) y `useUnreadSupportTicketsCount` (sidebar)
 * corren para TODOS los usuarios. Las lecturas, ante falta de permiso, devuelven `[]`/`null` sin lanzar
 * (usar `canSupportTickets`); solo las mutaciones lanzan (`requireSupportTickets`).
 *
 * Módulo server-only (NO es una Server Action). `cache` dedupe la consulta dentro de un mismo request,
 * porque las acciones se llaman entre sí.
 */

const MODULE_SLUG = 'ayuda';

/** ¿La sesión puede usar los tickets de soporte (`ayuda:tickets:view`)? */
export const canSupportTickets = cache(async (): Promise<boolean> => {
  return checkPermissionServer(MODULE_SLUG, 'tickets', 'view');
});

/** ¿La sesión puede usar el manual (`ayuda:manual:view`)? */
export const canManual = cache(async (): Promise<boolean> => {
  return checkPermissionServer(MODULE_SLUG, 'manual', 'view');
});

/** Exige `ayuda:tickets:view`; si no lo tiene, lanza (para mutaciones). */
export async function requireSupportTickets(): Promise<void> {
  if (!(await canSupportTickets())) {
    throw new Error('No tenés permiso para usar los tickets de soporte');
  }
}
