'use client';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RowActionsMenu, type RowAction } from '@/features/Mantenimiento/Gomeria/shared/RowActionsMenu';
import { tireTreadTypeLabels } from '@/features/Mantenimiento/Gomeria/shared/tire-mappers';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Pencil, Power, PowerOff, X } from 'lucide-react';
import type { TireTypeListItem } from '../actions/type-list.server';

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
  onEdit: (tireType: TireTypeListItem) => void,
  onToggle: (tireType: TireTypeListItem) => void
): ColumnDef<TireTypeListItem>[] {
  const canUpdate = permissions.hasPermission('mantenimiento', 'tipos_cubiertas', 'update');

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

    // ── Size ─────────────────────────────────────────────────────────────────
    {
      accessorKey: 'size',
      id: 'size',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Medida" />,
      cell: ({ row }) => <div className="font-mono text-sm">{row.original.size}</div>,
      meta: { title: 'Medida' },
    },

    // ── Tread Type ───────────────────────────────────────────────────────────
    {
      accessorKey: 'tread_type',
      id: 'tread_type',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de banda" />,
      cell: ({ row }) => <div>{tireTreadTypeLabels[row.original.tread_type] ?? row.original.tread_type}</div>,
      filterFn: (row, id, value: string[]) => {
        return value.includes(row.getValue(id) as string);
      },
      meta: { title: 'Tipo de banda' },
    },

    // ── Status ──────────────────────────────────────────────────────────────
    {
      accessorKey: 'is_active',
      id: 'is_active',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
          {row.original.is_active ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
          {row.original.is_active ? 'Activo' : 'Inactivo'}
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

    // ── Actions: menú ⋯ (editar y activar/desactivar = update) ──────────────
    ...(canUpdate
      ? [
          {
            id: 'actions',
            header: () => null,
            cell: ({ row }: { row: import('@tanstack/react-table').Row<TireTypeListItem> }) => {
              const item = row.original;
              const actions: RowAction[] = [
                { key: 'edit', label: 'Editar', icon: Pencil, onSelect: () => onEdit(item) },
                {
                  key: 'toggle',
                  label: item.is_active ? 'Desactivar' : 'Activar',
                  icon: item.is_active ? PowerOff : Power,
                  onSelect: () => onToggle(item),
                },
              ];
              return <RowActionsMenu label={`Acciones de tipo ${item.name}`} actions={actions} />;
            },
            enableSorting: false,
            enableHiding: false,
            meta: { excludeFromExport: true, title: '' },
          } satisfies ColumnDef<TireTypeListItem>,
        ]
      : []),
  ];
}
