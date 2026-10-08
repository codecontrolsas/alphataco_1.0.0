'use client';

import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Ban,
  Building2,
  CheckCircle2,
  ClipboardList,
  RotateCcw,
  SlidersHorizontal,
  Truck,
  Undo2,
  User,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { DESTINATION_TYPE_LABELS, MOVEMENT_TYPE_LABELS, type MovementKind } from '../../../lib/labels';
import type { StockDestinationTypeValue } from '../../../schemas/stock-movement';
import { formatMoney } from '../../../lib/format';
import type { MovementListItem, MovementReversalStatus } from './actions.server';

// Iconos compartidos entre celdas y filtros (consistencia)
export const movementTypeIcons: Record<MovementKind, LucideIcon> = {
  ENTRY: ArrowDownToLine,
  EXIT: ArrowUpFromLine,
  TRANSFER: ArrowLeftRight,
  ADJUSTMENT: SlidersHorizontal,
  // Undo2 ya identifica la anulacion en la columna Estado: la devolucion usa otro icono.
  RETURN: RotateCcw,
};

export const destinationTypeIcons: Record<StockDestinationTypeValue, LucideIcon> = {
  EMPLOYEE: User,
  VEHICLE: Truck,
  OTHER_EQUIPMENT: Wrench,
  MAINTENANCE_ORDER: ClipboardList,
  CUSTOMER: Building2,
};

export const REVERSAL_STATUS_LABELS: Record<MovementReversalStatus, string> = {
  VALID: 'Vigente',
  REVERSED: 'Anulado',
  REVERSAL: 'Anulación',
};

export const reversalStatusIcons: Record<MovementReversalStatus, LucideIcon> = {
  VALID: CheckCircle2,
  REVERSED: Ban,
  REVERSAL: Undo2,
};

const reversalVariants: Record<MovementReversalStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  VALID: 'default',
  REVERSED: 'destructive',
  REVERSAL: 'secondary',
};

export const HIDDEN_COLUMNS_BY_DEFAULT = ['target_warehouse', 'notes', 'created_at'];

interface MovementColumnsOptions {
  canViewPrices: boolean;
}

export function getColumns({ canViewPrices }: MovementColumnsOptions): ColumnDef<MovementListItem>[] {
  const columns: ColumnDef<MovementListItem>[] = [
    {
      id: 'number',
      accessorKey: 'number',
      meta: { title: 'Número' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Número" />,
      cell: ({ row }) => (
        <Link
          href={`/dashboard/warehouse/movements/${row.original.id}`}
          className="font-mono text-sm font-medium text-blue-600 hover:underline"
        >
          {row.original.number}
        </Link>
      ),
    },
    {
      id: 'type',
      accessorKey: 'type',
      meta: { title: 'Tipo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
      cell: ({ row }) => {
        const Icon = movementTypeIcons[row.original.type];
        return (
          <Badge variant="outline" className="gap-1">
            <Icon className="h-3 w-3" />
            {MOVEMENT_TYPE_LABELS[row.original.type]}
          </Badge>
        );
      },
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id) as string),
    },
    {
      id: 'occurred_on',
      accessorKey: 'occurred_on',
      meta: { title: 'Fecha' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
      // @db.Date llega como medianoche UTC: se formatea en UTC para no correr un dia
      cell: ({ row }) => <span>{moment.utc(row.original.occurred_on).format('DD/MM/YYYY')}</span>,
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
            <Icon className="h-3 w-3" />
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
      cell: ({ row }) => {
        const Icon = reversalStatusIcons[row.original.status];
        return (
          <Badge variant={reversalVariants[row.original.status]} className="gap-1">
            <Icon className="h-3 w-3" />
            {REVERSAL_STATUS_LABELS[row.original.status]}
          </Badge>
        );
      },
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
      cell: ({ row }) => <span>{moment(row.original.created_at).format('DD/MM/YYYY HH:mm')}</span>,
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
