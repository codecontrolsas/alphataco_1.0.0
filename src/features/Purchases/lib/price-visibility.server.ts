import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { cache } from 'react';
import type { PricedPurchaseTab } from './price-visibility';

/**
 * ¿El usuario ve los importes de esta pestaña de Compras? Solo Solicitudes, Cotizaciones, Órdenes y
 * Recepciones tienen `view_prices`; en Facturas, Pagos, Retenciones, Libro IVA y Proveedores ver la
 * pestaña implica ver importes. Cacheado por request: lista, export, facets y detalle preguntan una vez.
 */
export const canViewPurchasePrices = cache(
  (tab: PricedPurchaseTab): Promise<boolean> => checkPermissionServer('compras', tab, 'view_prices')
);
