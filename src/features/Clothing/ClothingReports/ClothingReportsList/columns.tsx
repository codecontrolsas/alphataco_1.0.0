'use client';

import {
  costColumns,
  deliveredAtColumn,
  deliveredByFileColumn,
  deliveryActionsColumn,
  deliveryStatusColumn,
  deliveryTypeColumn,
  notesColumn,
  personFileColumn,
  selectColumn,
  warehouseColumn,
  type DeliveryColumnsOptions,
} from '@/features/Clothing/components/delivery-columns';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, X } from 'lucide-react';
import moment from 'moment';
import type { ClothingReportListItem } from './actions.server';

// ============================================================================
// COLUMNS HIDDEN BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT = ['notes', 'created_at'];

// ============================================================================
// COLUMNS
// ============================================================================

type ReportPerson = ClothingReportListItem['employees_clothing_deliveries_employee_idToemployees'];

/** Persona de la entrega (empleado o quien entregó): se ordena y exporta por "Apellido Nombre". */
function personNameColumn(
  id: string,
  title: string,
  getPerson: (row: ClothingReportListItem) => ReportPerson,
  getPersonId: (row: ClothingReportListItem) => string | null
): ColumnDef<ClothingReportListItem> {
  return {
    id,
    ...titled(title),
    accessorFn: (row) => {
      const person = getPerson(row);
      if (!person) return '-';
      return `${person.lastname} ${person.firstname}`;
    },
    cell: ({ row }) => {
      const person = getPerson(row.original);
      if (!person) return <span className="text-muted-foreground">-</span>;
      return (
        <span>
          {person.lastname} {person.firstname}
        </span>
      );
    },
    filterFn: (row, _id, value: string[]) => {
      const personId = getPersonId(row.original);
      if (personId == null) return false;
      return value.includes(personId);
    },
  };
}

export function getColumns({
  canViewPrices,
  canCancel,
  queryKey,
}: DeliveryColumnsOptions): ColumnDef<ClothingReportListItem>[] {
  return [
    selectColumn(),
    deliveredAtColumn(),
    // Legajo del receptor
    personFileColumn(
      'employee_file',
      (row: ClothingReportListItem) => row.employees_clothing_deliveries_employee_idToemployees,
      'Legajo Receptor',
      'Legajo'
    ),
    personNameColumn(
      'employee',
      'Empleado',
      (row) => row.employees_clothing_deliveries_employee_idToemployees,
      (row) => row.employee_id
    ),
    deliveredByFileColumn('Legajo Entregado por'),
    personNameColumn(
      'delivered_by',
      'Entregado por',
      (row) => row.employees_clothing_deliveries_delivered_by_idToemployees,
      (row) => row.delivered_by_id
    ),
    deliveryTypeColumn(),
    deliveryStatusColumn(),
    warehouseColumn(),
    // Costo de la salida de stock (solo con view_prices)
    ...costColumns<ClothingReportListItem>(canViewPrices),

    // ── items_summary — virtual (no filter) ───────────────────────────────────
    {
      id: 'items_summary',
      ...titled('Artículos'),
      enableSorting: false,
      accessorFn: (row) => row.clothing_delivery_items.length,
      cell: ({ row }) => {
        const count = row.original.clothing_delivery_items.length;
        return (
          <span className="text-sm text-muted-foreground">
            {count} artículo{count !== 1 ? 's' : ''}
          </span>
        );
      },
    },

    // ── has_signature — computed boolean ───────────────────────────────────────
    {
      id: 'has_signature',
      ...titled('Firma'),
      enableSorting: false,
      accessorFn: (row) => (row.signature_url != null ? 'true' : 'false'),
      cell: ({ row }) => {
        const hasSig = row.original.signature_url != null;
        return hasSig ? (
          <span className="flex items-center gap-1 text-green-600">
            <Check className="h-4 w-4" />
            <span className="text-xs">Con firma</span>
          </span>
        ) : (
          <span className="flex items-center gap-1 text-muted-foreground">
            <X className="h-4 w-4" />
            <span className="text-xs">Sin firma</span>
          </span>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const val = row.original.signature_url != null ? 'true' : 'false';
        return value.includes(val);
      },
    },

    notesColumn('max-w-xs truncate text-sm text-muted-foreground'),

    // ── created_at (hidden by default) ─────────────────────────────────────────
    {
      accessorKey: 'created_at',
      id: 'created_at',
      ...titled('Fecha de registro'),
      cell: ({ row }) => (row.original.created_at ? moment(row.original.created_at).format('DD/MM/YYYY') : '-'),
    },

    deliveryActionsColumn({ canCancel, queryKey }),
  ];
}
