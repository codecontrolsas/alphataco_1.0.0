'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, PowerOff } from 'lucide-react';
import type { TireBrandListItem } from '../actions/brand-list.server';

// ============================================================================
// TYPES
// ============================================================================

type Permissions = {
  hasPermission: (module: string, tab: string, action: string) => boolean;
};

// ============================================================================
// COLUMNS
// ============================================================================

export function getColumns(
  permissions: Permissions,
  onEdit: (brand: TireBrandListItem) => void,
  onToggle: (brand: TireBrandListItem) => void
): ColumnDef<TireBrandListItem>[] {
  const canUpdate = permissions.hasPermission('mantenimiento', 'marcas_cubiertas', 'update');

  return [
    // ── Select ──────────────────────────────────────────────────────────────
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Seleccionar todo"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Seleccionar fila"
        />
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { excludeFromExport: true, title: '' },
    },

    // ── Name ────────────────────────────────────────────────────────────────
    {
      accessorKey: 'name',
      id: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
      cell: ({ row }) => <div className="font-medium">{row.original.name}</div>,
      meta: { title: 'Nombre' },
    },

    // ── Status ──────────────────────────────────────────────────────────────
    {
      accessorKey: 'is_active',
      id: 'is_active',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'outline'}>
          {row.original.is_active ? 'Activa' : 'Inactiva'}
        </Badge>
      ),
      filterFn: (row, id, value: string[]) => {
        return value.includes(String(row.getValue(id)));
      },
      meta: { title: 'Estado' },
    },

    // ── Tire count ───────────────────────────────────────────────────────────
    {
      id: 'tire_count',
      accessorFn: (row) => row._count?.tires ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cubiertas" />,
      cell: ({ row }) => {
        const count = row.original._count?.tires ?? 0;
        return (
          <Badge variant="outline" className="tabular-nums">
            {count}
          </Badge>
        );
      },
      enableSorting: false,
      meta: { title: 'Cubiertas' },
    },

    // ── Created At ──────────────────────────────────────────────────────────
    {
      accessorKey: 'created_at',
      id: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Creado" />,
      cell: ({ row }) => <div>{row.original.created_at ? formatArgentinaDay(row.original.created_at) : '-'}</div>,
      meta: { title: 'Creado' },
    },

    // ── Actions ─────────────────────────────────────────────────────────────
    {
      id: 'actions',
      header: () => null,
      cell: ({ row }) => (
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center gap-1">
            {canUpdate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onEdit(row.original)}
                    aria-label="Editar marca"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Editar</TooltipContent>
              </Tooltip>
            )}
            {canUpdate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onToggle(row.original)}
                    aria-label={row.original.is_active ? 'Desactivar marca' : 'Activar marca'}
                  >
                    <PowerOff className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{row.original.is_active ? 'Desactivar' : 'Activar'}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { excludeFromExport: true, title: '' },
    },
  ];
}
