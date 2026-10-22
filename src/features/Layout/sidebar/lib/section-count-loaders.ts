import 'server-only';

import { getDeviationsSectionCount, getGestionSectionCount } from '@/features/Mantenimiento/lib/section-counts';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import * as purchases from '@/features/Purchases/lib/section-counts';
import * as treasury from '@/features/Treasury/lib/section-counts';
import * as warehouses from '@/features/Warehouses/lib/section-counts';
import { Logger } from '@/lib/logger';
import { cache } from 'react';

const logger = new Logger('features/Layout/sidebar/section-count-loaders');

type CountLoader = () => Promise<number | null>;

/**
 * Contador de cada sub-item con badge, por módulo y `tabSlug`. Cada uno exige su propio permiso y comparte
 * `where` con su lista. Las claves deben coincidir con `SECTION_COUNTER_LABELS` (constants/navigation.ts).
 * Lo usan el sidebar (`getModuleSectionCounts`) y la bandeja «Para atender» del Dashboard.
 */
export const SECTION_COUNT_LOADERS: Record<string, Record<string, CountLoader>> = {
  mantenimiento: {
    maint_operaciones: getGestionSectionCount,
    equipments_with_deviations: getDeviationsSectionCount,
  },
  almacenes: {
    stock: warehouses.getStockSectionCount,
    prestamos: warehouses.getLoansSectionCount,
    pedidos: warehouses.getRequestsSectionCount,
  },
  compras: {
    solicitudes: purchases.getRequestsSectionCount,
    ordenes: purchases.getOrdersSectionCount,
    recepciones: purchases.getReceiptsSectionCount,
    facturas: purchases.getInvoicesSectionCount,
    pagos: purchases.getPaymentsSectionCount,
  },
  tesoreria: {
    cobranzas: treasury.getCollectionsSectionCount,
    cheques: treasury.getChecksSectionCount,
    'cheques-propios': treasury.getOwnChecksSectionCount,
    conciliacion: treasury.getReconciliationSectionCount,
  },
};

/**
 * `checkPermissionServer` memoizado por request: el Resumen del Dashboard y el sidebar piden muchas claves
 * en un mismo render y cada llamada sin memo es una consulta.
 */
export const hasPermissionCached = cache((moduleSlug: string, tabSlug: string, actionSlug: string) =>
  checkPermissionServer(moduleSlug, tabSlug, actionSlug)
);

/** Resultado de un contador: sin permiso y error se distinguen para no mostrar un vacío que engaña. */
export type SectionCountResult = { status: 'ok'; count: number } | { status: 'forbidden' } | { status: 'error' };

export async function loadSectionCountResult(moduleSlug: string, tabSlug: string): Promise<SectionCountResult> {
  const load = SECTION_COUNT_LOADERS[moduleSlug]?.[tabSlug];
  if (!load) return { status: 'forbidden' };
  try {
    // El contador de Gestión (maint_operaciones) lo habilita también el permiso de Taller; lo filtra su loader.
    const gated = moduleSlug === 'mantenimiento' && tabSlug === 'maint_operaciones';
    if (!gated && !(await hasPermissionCached(moduleSlug, tabSlug, 'view'))) return { status: 'forbidden' };
    const count = await load();
    // Los loaders devuelven `null` cuando la acción que resuelve lo contado no está permitida.
    return count === null ? { status: 'forbidden' } : { status: 'ok', count };
  } catch (error) {
    logger.error('Error al calcular el contador de sección', { data: { error, moduleSlug, tabSlug } });
    return { status: 'error' };
  }
}

/**
 * Un contador de sección. `null` = sin permiso de `view` o no se pudo calcular: quien lo muestra no dibuja
 * nada, nunca un 0 inventado.
 */
export async function loadSectionCount(moduleSlug: string, tabSlug: string): Promise<number | null> {
  const result = await loadSectionCountResult(moduleSlug, tabSlug);
  return result.status === 'ok' ? result.count : null;
}
