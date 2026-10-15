'use client';

import type { BadgeProps } from '@/components/ui/badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  tireServiceOrderStatusBadges,
  tireServiceOrderStatusLabels,
} from '@/features/Mantenimiento/Gomeria/shared/tire-mappers';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye } from 'lucide-react';
import type { VehicleTireOrderItem } from '../actions/orders.server';

type BadgeVariant = NonNullable<BadgeProps['variant']>;

export function getColumns(onViewDetail: (order: VehicleTireOrderItem) => void): ColumnDef<VehicleTireOrderItem>[] {
  return [
    {
      accessorKey: 'service_date',
      id: 'service_date',
      meta: { title: 'Fecha' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
      cell: ({ row }) => (
        <div className="text-sm">{row.original.service_date ? formatArgentinaDay(row.original.service_date) : '-'}</div>
      ),
    },
    {
      accessorKey: 'kilometer',
      id: 'kilometer',
      meta: { title: 'Kilómetros' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Kilómetros" />,
      cell: ({ row }) => <div className="text-sm font-mono">{row.original.kilometer ?? '-'}</div>,
    },
    {
      accessorKey: 'status',
      id: 'status',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const status = row.original.status;
        const variant: BadgeVariant = (tireServiceOrderStatusBadges[status] ?? 'default') as BadgeVariant;
        return <Badge variant={variant}>{tireServiceOrderStatusLabels[status] ?? status}</Badge>;
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
    },
    {
      id: 'interventions',
      meta: { title: 'Intervenciones' },
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Intervenciones" />,
      cell: ({ row }) => <div className="text-sm text-center">{row.original._count.items}</div>,
    },
    {
      id: 'creator',
      meta: { title: 'Creado por' },
      accessorFn: (row) => row.creator?.fullname ?? null,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Creado por" />,
      cell: ({ row }) => <div className="text-sm">{row.original.creator?.fullname ?? '-'}</div>,
      filterFn: (row, _id, value: string[]) => {
        const createdBy = row.original.created_by;
        if (createdBy == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(createdBy);
      },
    },
    {
      accessorKey: 'closed_at',
      id: 'closed_at',
      meta: { title: 'Cerrado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cerrado" />,
      cell: ({ row }) => (
        <div className="text-sm">{row.original.closed_at ? formatArgentinaDay(row.original.closed_at) : '-'}</div>
      ),
    },
    {
      id: 'actions',
      meta: { title: '', excludeFromExport: true },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onViewDetail(row.original)}
          title="Ver detalle de orden"
        >
          <Eye className="h-4 w-4 mr-1" />
          Ver detalle
        </Button>
      ),
    },
  ];
}
