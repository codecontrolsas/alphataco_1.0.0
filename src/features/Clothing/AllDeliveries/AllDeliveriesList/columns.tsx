'use client';

import {
  deliveredAtColumn,
  deliveredByFileColumn,
  deliveredByIdColumn,
  deliveryStatusColumn,
  deliveryTypeColumn,
  itemsDetailColumn,
  notesColumn,
  personFileColumn,
  personIdColumn,
  selectColumn,
  signatureIconColumn,
} from '@/features/Clothing/components/delivery-columns';
import { DeliveryReceiptButton } from '@/features/Clothing/pdf/DeliveryReceiptButton';
import type { ColumnDef } from '@tanstack/react-table';
import type { AllDeliveryListItem } from './actions.server';

// ============================================================================
// COLUMNS HIDDEN BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT = ['notes', 'delivered_by_file', 'employee_file'];

// ============================================================================
// COLUMNS
// ============================================================================

export function getColumns(): ColumnDef<AllDeliveryListItem>[] {
  return [
    selectColumn(),
    deliveredAtColumn(),
    // Legajo del destinatario
    personFileColumn(
      'employee_file',
      (row: AllDeliveryListItem) => row.employees_clothing_deliveries_employee_idToemployees,
      'Legajo (destinatario)',
      'Legajo (destinatario)'
    ),
    // Nombre del destinatario
    personIdColumn(
      'employee_id',
      'Destinatario',
      (row: AllDeliveryListItem) => row.employees_clothing_deliveries_employee_idToemployees
    ),
    deliveryTypeColumn(),
    deliveryStatusColumn(),
    deliveredByFileColumn('Legajo (entregó)'),
    deliveredByIdColumn(),
    itemsDetailColumn(),
    signatureIconColumn(),
    notesColumn(),
    // Descarga de la constancia en PDF
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => <DeliveryReceiptButton deliveryId={row.original.id} compact />,
    },
  ];
}
