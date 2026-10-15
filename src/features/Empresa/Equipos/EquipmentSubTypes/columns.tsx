'use client';

import { Button } from '@/components/ui/button';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { ActiveStatusBadge } from '../../components/ActiveStatusBadge';
import type { EquipmentSubTypeListItem } from './actions.server';

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['created_at'];

// ============================================================================
// PERMISSIONS TYPE
// ============================================================================

type Permissions = {
  hasPermission: (module: string, tab: string, action: string) => boolean;
};

// ============================================================================
// COLUMNS
// ============================================================================

export function getColumns(
  permissions: Permissions,
  onEdit: (item: EquipmentSubTypeListItem) => void
): ColumnDef<EquipmentSubTypeListItem>[] {
  const canUpdate = permissions.hasPermission('configuracion', 'subtipos', 'update');

  return [
    // ── Nombre ──────────────────────────────────────────────────────────────
    {
      accessorKey: 'name',
      meta: { title: 'Nombre' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      // filterFn no necesario para filtros text
    },

    // ── Tipo de Unidad (FK a type) ────────────────────────────────────────────
    {
      id: 'type',
      accessorFn: (row) => row.type_sub_type_typeTotype?.name ?? '',
      meta: { title: 'Tipo de Unidad' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de Unidad" />,
      cell: ({ row }) => {
        const typeName = row.original.type_sub_type_typeTotype?.name;
        return <span>{typeName ?? <span className="text-muted-foreground italic">Sin tipo</span>}</span>;
      },
      filterFn: (row, _id, value: string[]) => {
        const typeId = row.original.type;
        if (typeId == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(typeId);
      },
      // enableSorting manejado por FK_SORT_MAP en actions.server.ts
    },

    // ── Estado (is_active — booleano nullable) ───────────────────────────────
    {
      accessorKey: 'is_active',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => <ActiveStatusBadge value={row.original.is_active} />,
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id);
        if (val === null || val === undefined) return value.includes(NULL_FILTER_VALUE);
        return value.includes(String(val));
      },
    },

    // ── Fecha de creación (oculta por defecto) ────────────────────────────────
    {
      accessorKey: 'created_at',
      meta: { title: 'Fecha de creación' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de creación" />,
      cell: ({ row }) => {
        const val = row.original.created_at;
        return <span>{val ? formatArgentinaDay(val) : '-'}</span>;
      },
    },

    // ── Acciones ─────────────────────────────────────────────────────────────
    ...(canUpdate
      ? ([
          {
            id: 'actions',
            meta: { title: '', excludeFromExport: true },
            enableSorting: false,
            enableHiding: false,
            cell: ({ row }) => (
              <Button
                size="sm"
                variant="link"
                type="button"
                className="h-auto p-0"
                aria-label={`Editar ${row.original.name ?? 'subtipo'}`}
                onClick={() => onEdit(row.original)}
              >
                Editar
              </Button>
            ),
          },
        ] as ColumnDef<EquipmentSubTypeListItem>[])
      : []),
  ];
}
