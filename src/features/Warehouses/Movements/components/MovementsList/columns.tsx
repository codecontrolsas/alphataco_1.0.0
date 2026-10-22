'use client';

import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { ColumnDef } from '@tanstack/react-table';
import { formatArgentinaDateTime, formatDateAr } from '@/shared/lib/argentina-time';
import { Building2, ClipboardList, ExternalLink, Truck, User, Wrench, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { WarehouseStatusBadge } from '../../../components/WarehouseStatusBadge';
import { DESTINATION_TYPE_LABELS } from '../../../lib/labels';
import { MOVEMENT_TYPE_UI, REVERSAL_STATUS_UI } from '../../../lib/status-presentation';
import type { StockDestinationTypeValue } from '../../../schemas/stock-movement';
import { formatMoney } from '../../../lib/format';
import type { MovementListItem, MovementReversalStatus } from './actions.server';

// Iconos de tipo de destino compartidos entre celdas y filtros (consistencia)
export const destinationTypeIcons: Record<StockDestinationTypeValue, LucideIcon> = {
  EMPLOYEE: User,
  VEHICLE: Truck,
  OTHER_EQUIPMENT: Wrench,
  MAINTENANCE_ORDER: ClipboardList,
  CUSTOMER: Building2,
};

/** Etiquetas de la vigencia, de la misma fuente que el badge de la columna Estado. */
export const REVERSAL_STATUS_LABELS: Record<MovementReversalStatus, string> = {
  VALID: REVERSAL_STATUS_UI.VALID.label,
  REVERSED: REVERSAL_STATUS_UI.REVERSED.label,
  REVERSAL: REVERSAL_STATUS_UI.REVERSAL.label,
};

export const HIDDEN_COLUMNS_BY_DEFAULT = ['target_warehouse', 'notes', 'created_at'];

interface MovementColumnsOptions {
  canViewPrices: boolean;
  /** Abre el panel lateral de detalle del movimiento. */
  onOpenDetail: (id: string) => void;
}

/** `occurred_on` es `@db.Date`: llega como medianoche UTC, se toma el día calendario tal cual. */
export const formatOccurredOn = (value: string | Date) => formatDateAr(new Date(value).toISOString().slice(0, 10));

export function getColumns({ canViewPrices, onOpenDetail }: MovementColumnsOptions): ColumnDef<MovementListItem>[] {
  const columns: ColumnDef<MovementListItem>[] = [
    {
      id: 'number',
      accessorKey: 'number',
      meta: { title: 'Número' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Número" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="text-brand-ink focus-visible:ring-ring rounded-sm font-mono text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
            aria-label={`Ver detalle del movimiento ${row.original.number}`}
            onClick={() => onOpenDetail(row.original.id)}
          >
            {row.original.number}
          </button>
          <Link
            href={`/dashboard/warehouse/movements/${row.original.id}`}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-sm focus-visible:ring-2 focus-visible:outline-none"
            aria-label={`Abrir página del movimiento ${row.original.number}`}
            title="Abrir página"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      ),
    },
    {
      id: 'type',
      accessorKey: 'type',
      meta: { title: 'Tipo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
      cell: ({ row }) => <WarehouseStatusBadge entity="movementType" status={row.original.type} />,
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id) as string),
    },
    {
      id: 'occurred_on',
      accessorKey: 'occurred_on',
      meta: { title: 'Fecha' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
      cell: ({ row }) => <span>{formatOccurredOn(row.original.occurred_on)}</span>,
    },
    {
      id: 'warehouse',
      accessorFn: (row) => row.warehouse.name,
      meta: { title: 'Depósito' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Depósito" />,
      cell: ({ row }) => <span>{row.original.warehouse.name}</span>,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.warehouse.id),
    },
    {
      id: 'target_warehouse',
      accessorFn: (row) => row.target_warehouse?.name ?? '',
      meta: { title: 'Depósito destino' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Depósito destino" />,
      cell: ({ row }) => <span>{row.original.target_warehouse?.name ?? '-'}</span>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.target_warehouse?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },
    {
      id: 'destination_type',
      accessorKey: 'destination_type',
      meta: { title: 'Tipo de destino' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de destino" />,
      cell: ({ row }) => {
        const t = row.original.destination_type;
        if (!t) return <span>-</span>;
        const Icon = destinationTypeIcons[t];
        return (
          <Badge variant="outline" className="gap-1">
            <Icon className="h-3 w-3" aria-hidden="true" />
            {DESTINATION_TYPE_LABELS[t]}
          </Badge>
        );
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
    },
    {
      id: 'destination',
      accessorFn: (row) => row.destination ?? '',
      meta: { title: 'Destino' },
      // Calculado desde varias relaciones (empleado/equipo/orden/cliente): no ordenable.
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Destino" />,
      cell: ({ row }) => <span>{row.original.destination ?? '-'}</span>,
    },
    {
      id: 'reference',
      accessorKey: 'reference',
      meta: { title: 'Referencia' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Referencia" />,
      cell: ({ row }) => <span>{row.original.reference ?? '-'}</span>,
    },
    {
      id: 'notes',
      accessorKey: 'notes',
      meta: { title: 'Notas' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Notas" />,
      cell: ({ row }) => <span>{row.original.notes ?? '-'}</span>,
    },
    {
      id: 'status',
      accessorFn: (row) => row.status,
      meta: { title: 'Estado' },
      // Calculado (reversed_by / reverses_movement_id): no ordenable.
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => <WarehouseStatusBadge entity="reversal" status={row.original.status} />,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.status),
    },
    {
      id: 'created_by',
      accessorFn: (row) => row.creator.name,
      meta: { title: 'Creado por' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Creado por" />,
      cell: ({ row }) => <span>{row.original.creator.name}</span>,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.creator.id),
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      meta: { title: 'Fecha de carga' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de carga" />,
      cell: ({ row }) => <span>{formatArgentinaDateTime(row.original.created_at)}</span>,
    },
  ];

  if (canViewPrices) {
    columns.push({
      id: 'total_cost',
      accessorFn: (row) => (row.total_cost != null ? Number(row.total_cost) : null),
      meta: { title: 'Total' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {row.original.total_cost != null ? formatMoney(row.original.total_cost) : '-'}
        </span>
      ),
    });
  }

  return columns;
}
