'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { ActiveStatusBadge } from '../../components/ActiveStatusBadge';
import type { EquipmentTypeListItem } from './actions.server';

// ============================================================================
// LABELS Y MAPEOS
// ============================================================================

export const APPLIES_TO_LABELS: Record<string, string> = {
  vehicle: 'Vehículos',
  other_equipment: 'Otros Equipos',
};

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['created_at', 'is_operative', 'has_hitch', 'generates_qr'];

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
  onEdit: (item: EquipmentTypeListItem) => void,
  /** Acción de fila "Ver subtipos": filtra la tabla relacionada. Si no se pasa, la acción no se muestra. */
  onViewRelated?: (item: EquipmentTypeListItem) => void
): ColumnDef<EquipmentTypeListItem>[] {
  const canUpdate = permissions.hasPermission('configuracion', 'tipos', 'update');

  return [
    // ── Nombre ──────────────────────────────────────────────────────────────
    {
      accessorKey: 'name',
      meta: { title: 'Nombre' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      // filterFn no necesario para filtros text
    },

    // ── Aplica a ─────────────────────────────────────────────────────────────
    {
      accessorKey: 'applies_to',
      meta: { title: 'Aplica a' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Aplica a" />,
      cell: ({ row }) => {
        const val = row.original.applies_to;
        if (!val) return <span className="text-muted-foreground">—</span>;
        return <span>{APPLIES_TO_LABELS[val] ?? val}</span>;
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
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

    // ── Unidad Tractora (oculta por defecto) ──────────────────────────────────
    {
      accessorKey: 'is_tractor_unit',
      meta: { title: 'Unidad Tractora' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Unidad Tractora" />,
      cell: ({ row }) => {
        const val = row.original.is_tractor_unit;
        if (val === null || val === undefined) return <span className="text-muted-foreground">—</span>;
        return <Badge variant={val ? 'default' : 'secondary'}>{val ? 'Sí' : 'No'}</Badge>;
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id);
        if (val === null || val === undefined) return value.includes(NULL_FILTER_VALUE);
        return value.includes(String(val));
      },
    },

    // ── Lleva Enganche (oculta por defecto) ───────────────────────────────────
    {
      accessorKey: 'has_hitch',
      meta: { title: 'Lleva Enganche' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Lleva Enganche" />,
      cell: ({ row }) => {
        const val = row.original.has_hitch;
        if (val === null || val === undefined) return <span className="text-muted-foreground">—</span>;
        return <span>{val ? 'Sí' : 'No'}</span>;
      },
      enableSorting: false,
    },

    // ── Operativo (oculta por defecto) ────────────────────────────────────────
    {
      accessorKey: 'is_operative',
      meta: { title: 'Operativo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Operativo" />,
      cell: ({ row }) => {
        const val = row.original.is_operative;
        if (val === null || val === undefined) return <span className="text-muted-foreground">—</span>;
        return <span>{val ? 'Sí' : 'No'}</span>;
      },
      enableSorting: false,
    },

    // ── Genera QR (oculta por defecto) ────────────────────────────────────────
    {
      accessorKey: 'generates_qr',
      meta: { title: 'Genera QR' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Genera QR" />,
      cell: ({ row }) => {
        const val = row.original.generates_qr;
        if (val === null || val === undefined) return <span className="text-muted-foreground">—</span>;
        return <span>{val ? 'Sí' : 'No'}</span>;
      },
      enableSorting: false,
    },

    // ── Fecha de creación (oculta por defecto) ─────────────────────────────────
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
                    aria-label={`Editar ${row.original.name ?? 'tipo'}`}
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
                    aria-label={`Ver subtipos de ${row.original.name ?? 'tipo'}`}
                    onClick={() => onViewRelated(row.original)}
                  >
                    Ver subtipos
                  </Button>
                ) : null}
              </div>
            ),
          },
        ] as ColumnDef<EquipmentTypeListItem>[])
      : []),
  ];
}
