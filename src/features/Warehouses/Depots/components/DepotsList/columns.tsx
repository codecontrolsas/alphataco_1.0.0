'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { StackedCell } from '@/shared/components/common/StackedCell';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, X, type LucideIcon } from 'lucide-react';
import { employeeLabel } from '../../../lib/labels';
import { DepotRowActions } from '../DepotRowActions';
import type { DepotListItem } from './actions.server';

/** Iconos del estado (celda y filtro usan los mismos). */
export const activeIcons: Record<'true' | 'false', LucideIcon> = { true: Check, false: X };

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['created_at'];

interface DepotPermissions {
  canUpdate: boolean;
  canDelete: boolean;
}

export function getColumns({ canUpdate, canDelete }: DepotPermissions): ColumnDef<DepotListItem>[] {
  const dim = (row: DepotListItem) => !row.is_active && 'opacity-50';

  return [
    {
      id: 'code',
      accessorKey: 'code',
      ...titled('Código'),
      cell: ({ row }) => (
        <span className={cn('font-mono text-sm font-medium', dim(row.original))}>{row.original.code}</span>
      ),
    },
    {
      id: 'name',
      accessorKey: 'name',
      ...titled('Nombre'),
      cell: ({ row }) => <span className={cn('font-medium', dim(row.original))}>{row.original.name}</span>,
    },
    {
      id: 'address',
      accessorKey: 'address',
      ...titled('Dirección'),
      cell: ({ row }) => <span className={cn(dim(row.original))}>{row.original.address ?? '-'}</span>,
    },
    // Legajo SIEMPRE como columna separada y antes del nombre (regla del repo).
    {
      id: 'fileNumber',
      accessorFn: (row) => row.manager?.file ?? '',
      ...titled('Legajo responsable'),
      cell: ({ row }) => (
        <span className={cn('font-mono text-sm', dim(row.original))}>{row.original.manager?.file ?? '-'}</span>
      ),
    },
    {
      id: 'manager',
      accessorFn: (row) => (row.manager ? employeeLabel(row.manager) : ''),
      ...titled('Responsable'),
      cell: ({ row }) => (
        <StackedCell
          className={cn(dim(row.original))}
          primary={row.original.manager ? employeeLabel(row.original.manager) : '—'}
        />
      ),
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.manager?.id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },
    {
      id: 'is_active',
      accessorKey: 'is_active',
      ...titled('Estado'),
      cell: ({ row }) => {
        const key = String(row.original.is_active) as 'true' | 'false';
        const Icon = activeIcons[key];
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
      ...titled('Creado'),
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums">{formatArgentinaDay(row.original.created_at)}</span>
      ),
    },
    {
      id: 'actions',
      meta: { title: '', excludeFromExport: true },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <DepotRowActions
          warehouseId={row.original.id}
          isActive={row.original.is_active}
          canUpdate={canUpdate}
          canDelete={canDelete}
        />
      ),
    },
  ];
}
