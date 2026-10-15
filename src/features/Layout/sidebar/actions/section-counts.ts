'use server';

import {
  getDeviationsSectionCount,
  getOperacionesSectionCount,
  getTallerSectionCount,
} from '@/features/Mantenimiento/lib/section-counts';
import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import * as purchases from '@/features/Purchases/lib/section-counts';
import * as treasury from '@/features/Treasury/lib/section-counts';
import * as warehouses from '@/features/Warehouses/lib/section-counts';
import { Logger } from '@/lib/logger';
import type { SectionCountsByTab } from '../types/section-counts';

const logger = new Logger('features/Layout/sidebar');

type CountLoader = () => Promise<number | null>;

/**
 * Contador de cada sub-item con badge, por módulo y `tabSlug`. Son los mismos cálculos que antes dibujaba
 * la fila de secciones de cada módulo: cada uno exige su propio permiso y comparte `where` con su lista.
 * Las claves deben coincidir con `SECTION_COUNTER_LABELS` (constants/navigation.ts).
 */
const LOADERS: Record<string, Record<string, CountLoader>> = {
  mantenimiento: {
    maint_operaciones: getOperacionesSectionCount,
    maint_taller: getTallerSectionCount,
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
 * Contadores de los sub-items de UN módulo del sidebar (bajo demanda: solo el módulo desplegado).
 * Una sección sin permiso de `view` o que no se pudo calcular vuelve `null`: la UI no dibuja badge,
 * nunca un 0 inventado.
 */
export async function getModuleSectionCounts(moduleSlug: string): Promise<SectionCountsByTab> {
  const loaders = Object.hasOwn(LOADERS, moduleSlug) ? LOADERS[moduleSlug] : undefined;
  if (!loaders) return {};

  const entries = await Promise.all(
    Object.entries(loaders).map(async ([tabSlug, load]): Promise<[string, number | null]> => {
      try {
        if (!(await checkPermissionServer(moduleSlug, tabSlug, 'view'))) return [tabSlug, null];
        return [tabSlug, await load()];
      } catch (error) {
        logger.error('Error al calcular el contador de sección', { data: { error, moduleSlug, tabSlug } });
        return [tabSlug, null];
      }
    })
  );

  return Object.fromEntries(entries);
}
