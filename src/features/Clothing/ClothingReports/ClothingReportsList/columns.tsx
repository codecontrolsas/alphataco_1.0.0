'use client';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { DeliveryRowActions, formatEmployeeLabel } from '@/features/Clothing/components/DeliveryRowActions';
import { DeliveryStatusBadge } from '@/features/Clothing/components/DeliveryStatusBadge';
import { DELIVERY_STATUS_ACTIVE, DELIVERY_STATUS_CANCELLED } from '@/features/Clothing/lib/delivery-stock-where';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { clothingDeliveryTypeBadges, clothingDeliveryTypeLabels } from '@/features/Clothing/utils/mappers';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
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

export interface ClothingReportsColumnsOptions {
  /** `almacenes:movimientos:view_prices`: sin permiso la columna Costo no existe. */
  canViewPrices: boolean;
  /** `empleados:indumentaria_empleado:delete`: habilita la accion Anular. */
  canCancel: boolean;
  /** Key de la query de la tabla, para refrescarla al anular. */
  queryKey: readonly unknown[];
}

export function getColumns({
  canViewPrices,
  canCancel,
  queryKey,
}: ClothingReportsColumnsOptions): ColumnDef<ClothingReportListItem>[] {
  return [
    // ── select ────────────────────────────────────────────────────────────────
    {
      id: 'select',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Seleccionar todas las visibles"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Seleccionar entrega"
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },

    // ── delivered_at ──────────────────────────────────────────────────────────
    {
      accessorKey: 'delivered_at',
      id: 'delivered_at',
      meta: { title: 'Fecha de entrega' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de entrega" />,
      cell: ({ row }) => (row.original.delivered_at ? moment(row.original.delivered_at).format('DD/MM/YYYY') : '-'),
    },

    // ── employee_file — legajo del receptor ───────────────────────────────────
    {
      id: 'employee_file',
      accessorFn: (row) => row.employees_clothing_deliveries_employee_idToemployees?.file ?? '',
      meta: { title: 'Legajo Receptor' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Legajo" />,
      cell: ({ row }) => {
        const file = row.original.employees_clothing_deliveries_employee_idToemployees?.file;
        return <span className="font-mono text-xs">{file ?? '-'}</span>;
      },
    },

    // ── employee — FK ─────────────────────────────────────────────────────────
    {
      id: 'employee',
      meta: { title: 'Empleado' },
      accessorFn: (row) => {
        const emp = row.employees_clothing_deliveries_employee_idToemployees;
        if (!emp) return '-';
        return `${emp.lastname} ${emp.firstname}`;
      },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Empleado" />,
      cell: ({ row }) => {
        const emp = row.original.employees_clothing_deliveries_employee_idToemployees;
        if (!emp) return <span className="text-muted-foreground">-</span>;
        return (
          <span>
            {emp.lastname} {emp.firstname}
          </span>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const empId = row.original.employee_id;
        if (empId == null) return false;
        return value.includes(empId);
      },
    },

    // ── delivered_by_file — legajo del que entrega ────────────────────────────
    {
      id: 'delivered_by_file',
      accessorFn: (row) => row.employees_clothing_deliveries_delivered_by_idToemployees?.file ?? '',
      meta: { title: 'Legajo Entregado por' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Legajo (entregó)" />,
      cell: ({ row }) => {
        const file = row.original.employees_clothing_deliveries_delivered_by_idToemployees?.file;
        return <span className="font-mono text-xs">{file ?? '-'}</span>;
      },
    },

    // ── delivered_by — FK ─────────────────────────────────────────────────────
    {
      id: 'delivered_by',
      meta: { title: 'Entregado por' },
      accessorFn: (row) => {
        const emp = row.employees_clothing_deliveries_delivered_by_idToemployees;
        if (!emp) return '-';
        return `${emp.lastname} ${emp.firstname}`;
      },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Entregado por" />,
      cell: ({ row }) => {
        const emp = row.original.employees_clothing_deliveries_delivered_by_idToemployees;
        if (!emp) return <span className="text-muted-foreground">-</span>;
        return (
          <span>
            {emp.lastname} {emp.firstname}
          </span>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const empId = row.original.delivered_by_id;
        if (empId == null) return false;
        return value.includes(empId);
      },
    },

    // ── delivery_type — enum ──────────────────────────────────────────────────
    {
      accessorKey: 'delivery_type',
      id: 'delivery_type',
      meta: { title: 'Tipo de entrega' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de entrega" />,
      cell: ({ row }) => {
        const type = row.original.delivery_type;
        return <Badge variant={clothingDeliveryTypeBadges[type]}>{clothingDeliveryTypeLabels[type]}</Badge>;
      },
      filterFn: (row, id, value: string[]) => {
        return value.includes(row.getValue(id) as string);
      },
    },

    // ── status (virtual: cancelled_at) ────────────────────────────────────────
    {
      id: 'status',
      accessorFn: (row) => (row.cancelled_at ? DELIVERY_STATUS_CANCELLED : DELIVERY_STATUS_ACTIVE),
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => (
        <DeliveryStatusBadge cancelledAt={row.original.cancelled_at} cancelReason={row.original.cancel_reason} />
      ),
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id) as string),
    },

    // ── warehouse — FK nullable ───────────────────────────────────────────────
    {
      id: 'warehouse',
      accessorFn: (row) => row.warehouse?.name ?? '',
      meta: { title: 'Depósito' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Depósito" />,
      cell: ({ row }) => row.original.warehouse?.name ?? <span className="text-muted-foreground">—</span>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.warehouse?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },

    // ── cost — total_cost de la salida de stock (solo con view_prices) ─────────
    ...(canViewPrices
      ? [
          {
            id: 'cost',
            accessorFn: (row: ClothingReportListItem) => row.cost,
            meta: { title: 'Costo' },
            header: ({ column }) => <DataTableColumnHeader column={column} title="Costo" />,
            cell: ({ row }) =>
              row.original.cost != null ? (
                <span className="tabular-nums">{formatMoney(row.original.cost)}</span>
              ) : (
                <span className="text-muted-foreground">Sin costo</span>
              ),
          } satisfies ColumnDef<ClothingReportListItem>,
        ]
      : []),

    // ── items_summary — virtual (no filter) ───────────────────────────────────
    {
      id: 'items_summary',
      meta: { title: 'Artículos' },
      enableSorting: false,
      accessorFn: (row) => row.clothing_delivery_items.length,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Artículos" />,
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
      meta: { title: 'Firma' },
      enableSorting: false,
      accessorFn: (row) => (row.signature_url != null ? 'true' : 'false'),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Firma" />,
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

    // ── notes (hidden by default) ─────────────────────────────────────────────
    {
      accessorKey: 'notes',
      id: 'notes',
      meta: { title: 'Notas' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Notas" />,
      cell: ({ row }) => (
        <span className="max-w-xs truncate text-sm text-muted-foreground">{row.original.notes ?? '-'}</span>
      ),
    },

    // ── created_at (hidden by default) ─────────────────────────────────────────
    {
      accessorKey: 'created_at',
      id: 'created_at',
      meta: { title: 'Fecha de registro' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de registro" />,
      cell: ({ row }) => (row.original.created_at ? moment(row.original.created_at).format('DD/MM/YYYY') : '-'),
    },

    // ── actions — PDF download ──────────────────────────────────────────────────
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <DeliveryRowActions
          deliveryId={row.original.id}
          employeeLabel={formatEmployeeLabel(row.original.employees_clothing_deliveries_employee_idToemployees)}
          canCancel={canCancel}
          isCancelled={row.original.cancelled_at != null}
          hasStock={row.original.warehouse_id != null}
          queryKey={queryKey}
        />
      ),
    },
  ];
}
