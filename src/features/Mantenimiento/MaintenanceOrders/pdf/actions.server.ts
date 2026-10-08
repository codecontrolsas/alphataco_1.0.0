'use server';

/**
 * Borde servidor del PDF de Orden de Mantenimiento (ticket 684).
 *
 * Lo unico que hace es resolver quien esta emitiendo el documento, verificar que la orden
 * sea de la empresa activa y delegar en `buildMaintenanceOrderReportData`. La consulta y
 * el mapeo viven en `report-data.ts` — sin directiva — para que se puedan ejecutar tambien
 * fuera de Next (verificacion del PDF con datos reales).
 *
 * No importa nada de `@react-pdf/renderer`: el layout lo carga el boton, en el
 * cliente y recien al hacer clic.
 */

import { checkPermissionServer } from '@/features/Permissions';
import { getSessionUserId } from '@/shared/lib/session';
import { assertOrderInActiveCompany } from '../actions/order-perimeter';
import { buildMaintenanceOrderReportData } from './report-data';
import type { MaintenanceOrderReportData } from './types';

/** Datos completos del PDF de una orden, listos para el layout. */
export async function getMaintenanceOrderReportData(orderId: string): Promise<MaintenanceOrderReportData> {
  // Perímetro: la orden tiene que ser de la empresa activa.
  await assertOrderInActiveCompany(orderId);

  const [issuerUserId, withPrices] = await Promise.all([
    getSessionUserId(),
    checkPermissionServer('almacenes', 'movimientos', 'view_prices'),
  ]);

  return buildMaintenanceOrderReportData(orderId, issuerUserId, { withPrices });
}
