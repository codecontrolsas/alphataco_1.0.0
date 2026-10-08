'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { ColumnDef } from '@tanstack/react-table';
import { Barcode, Check, Hash, Layers, X, type LucideIcon } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { TRACKING_TYPE_LABELS } from '../../../lib/labels';
import type { MaterialTrackingTypeValue } from '../../../schemas/stock-movement';
import { MaterialRowActions } from '../MaterialRowActions';
import type { MaterialListItem } from './actions.server';

// Iconos compartidos entre celdas y filtros (consistencia)
export const trackingIcons: Record<MaterialTrackingTypeValue, LucideIcon> = {
  QUANTITY: Hash,
  SERIAL: Barcode,
  BATCH: Layers,
};
export const boolIcons: Record<'true' | 'false', LucideIcon> = { true: Check, false: X };

export const HIDDEN_COLUMNS_BY_DEFAULT = ['description', 'created_at'];

interface MaterialPermissions {
  canUpdate: boolean;
  canDelete: boolean;
}

export function getColumns({ canUpdate, canDelete }: MaterialPermissions): ColumnDef<MaterialListItem>[] {
  const dim = (row: MaterialListItem) => !row.is_active && 'opacity-50';

  return [
    {
      id: 'code',
      accessorKey: 'code',
      meta: { title: 'Código' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Código" />,
      cell: ({ row }) => (
        <span className={cn('font-mono text-sm font-medium', dim(row.original))}>{row.original.code}</span>
      ),
    },
    {
      id: 'name',
      accessorKey: 'name',
      meta: { title: 'Nombre' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
      cell: ({ row }) => (
        <Link
          href={`/dashboard/warehouse/materials/${row.original.id}`}
          className={cn('font-medium text-blue-600 hover:underline', dim(row.original))}
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      id: 'description',
      accessorKey: 'description',
      meta: { title: 'Descripción' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Descripción" />,
      cell: ({ row }) => <span className={cn(dim(row.original))}>{row.original.description ?? '-'}</span>,
    },
    {
      id: 'category',
      accessorFn: (row) => row.category?.name ?? '',
      meta: { title: 'Categoría' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Categoría" />,
      cell: ({ row }) => <span className={cn(dim(row.original))}>{row.original.category?.name ?? '-'}</span>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.category?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },
    {
      id: 'unit',
      accessorFn: (row) => row.unit.name,
      meta: { title: 'Unidad' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Unidad" />,
      cell: ({ row }) => <span className={cn(dim(row.original))}>{row.original.unit.name}</span>,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.unit.id),
    },
    {
      id: 'tracking_type',
      accessorKey: 'tracking_type',
      meta: { title: 'Tipo de control' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de control" />,
      cell: ({ row }) => {
        const Icon = trackingIcons[row.original.tracking_type];
        return (
          <Badge variant="outline" className={cn('gap-1', dim(row.original))}>
            <Icon className="h-3 w-3" />
            {TRACKING_TYPE_LABELS[row.original.tracking_type]}
          </Badge>
        );
      },
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id) as string),
    },
    {
      id: 'requires_approval',
      accessorKey: 'requires_approval',
      meta: { title: 'Requiere aprobación' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Requiere aprobación" />,
      cell: ({ row }) => {
        const Icon = boolIcons[String(row.original.requires_approval) as 'true' | 'false'];
        return (
          <Badge variant="outline" className={cn('gap-1', dim(row.original))}>
            <Icon className="h-3 w-3" />
            {row.original.requires_approval ? 'Sí' : 'No'}
          </Badge>
        );
      },
      filterFn: (row, id, value: string[]) => value.includes(String(row.getValue(id))),
    },
    {
      id: 'min_stock',
      accessorKey: 'min_stock',
      meta: { title: 'Stock mínimo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Stock mínimo" />,
      cell: ({ row }) => <span className={cn('tabular-nums', dim(row.original))}>{row.original.min_stock ?? '-'}</span>,
    },
    {
      id: 'is_active',
      accessorKey: 'is_active',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const Icon = boolIcons[String(row.original.is_active) as 'true' | 'false'];
        return (
          <Badge variant={row.original.is_active ? 'default' : 'secondary'} className="gap-1">
            <Icon className="h-3 w-3" />
            {row.original.is_active ? 'Activo' : 'Inactivo'}
          </Badge>
        );
      },
      filterFn: (row, id, value: string[]) => value.includes(String(row.getValue(id))),
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      meta: { title: 'Creado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Creado" />,
      cell: ({ row }) => <span>{moment(row.original.created_at).format('DD/MM/YYYY')}</span>,
    },
    {
      id: 'actions',
      meta: { title: '', excludeFromExport: true },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <MaterialRowActions
          materialId={row.original.id}
          isActive={row.original.is_active}
          canUpdate={canUpdate}
          canDelete={canDelete}
        />
      ),
    },
  ];
}
