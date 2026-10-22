'use client';

import {
  costColumns,
  deliveredAtColumn,
  deliveredByFileColumn,
  deliveredByIdColumn,
  deliveryActionsColumn,
  deliveryStatusColumn,
  deliveryTypeColumn,
  itemsDetailColumn,
  notesColumn,
  selectColumn,
  signatureIconColumn,
  warehouseColumn,
  type DeliveryColumnsOptions,
} from '@/features/Clothing/components/delivery-columns';
import type { ColumnDef } from '@tanstack/react-table';
import type { EmployeeDeliveryListItem } from './actions.server';

// ============================================================================
// COLUMNS HIDDEN BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT = ['notes'];

// ============================================================================
// COLUMNS
// ============================================================================

export function getColumns({
  canViewPrices,
  canCancel,
  queryKey,
}: DeliveryColumnsOptions): ColumnDef<EmployeeDeliveryListItem>[] {
  return [
    selectColumn(),
    deliveredAtColumn(),
    deliveryTypeColumn(),
    deliveryStatusColumn(),
    warehouseColumn(),
    deliveredByFileColumn('Legajo Entregado por'),
    deliveredByIdColumn(),
    itemsDetailColumn(),
    // Costo de la salida de stock (solo con view_prices)
    ...costColumns<EmployeeDeliveryListItem>(canViewPrices),
    signatureIconColumn(),
    notesColumn(),
    deliveryActionsColumn({ canCancel, queryKey }),
  ];
}
