'use client';

import { Button } from '@/components/ui/button';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { ActiveStatusBadge } from '../../components/ActiveStatusBadge';
import type { EquipmentBrandListItem } from './actions.server';

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
  onEdit: (item: EquipmentBrandListItem) => void,
  /** Acción de fila "Ver modelos": filtra la tabla relacionada. Si no se pasa, la acción no se muestra. */
  onViewRelated?: (item: EquipmentBrandListItem) => void
): ColumnDef<EquipmentBrandListItem>[] {
  const canUpdate = permissions.hasPermission('configuracion', 'marcas', 'update');

  return [
    // ── Nombre ──────────────────────────────────────────────────────────────
    {
      accessorKey: 'name',
      meta: { title: 'Nombre' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name ?? '-'}</span>,
      // filterFn no necesario para filtros text
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
    ...(canUpdate || onViewRelated
      ? ([
          {
            id: 'actions',
            meta: { title: '', excludeFromExport: true },
            enableSorting: false,
            enableHiding: false,
            cell: ({ row }) => (
              <div className="flex items-center gap-3">
                {canUpdate ? (
                  <Button
                    size="sm"
                    variant="link"
                    type="button"
                    className="h-auto p-0"
                    aria-label={`Editar ${row.original.name ?? 'marca'}`}
                    onClick={() => onEdit(row.original)}
                  >
                    Editar
                  </Button>
                ) : null}
                {onViewRelated ? (
                  <Button
                    size="sm"
                    variant="link"
                    type="button"
                    className="h-auto p-0"
                    aria-label={`Ver modelos de ${row.original.name ?? 'marca'}`}
                    onClick={() => onViewRelated(row.original)}
                  >
                    Ver modelos
                  </Button>
                ) : null}
              </div>
            ),
          },
        ] as ColumnDef<EquipmentBrandListItem>[])
      : []),
  ];
}
