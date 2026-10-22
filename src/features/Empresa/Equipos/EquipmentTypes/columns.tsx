'use client';

import { Badge } from '@/components/ui/badge';
import {
  RowLinkButton,
  activeStatusColumn,
  createdAtColumn,
  nameColumn,
} from '@/features/Empresa/components/catalog-columns';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { ColumnDef } from '@tanstack/react-table';
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
    nameColumn<EquipmentTypeListItem>(),

    // ── Aplica a ─────────────────────────────────────────────────────────────
    {
      accessorKey: 'applies_to',
      ...titled('Aplica a'),
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
    activeStatusColumn<EquipmentTypeListItem>(),

    // ── Unidad Tractora (oculta por defecto) ──────────────────────────────────
    {
      accessorKey: 'is_tractor_unit',
      ...titled('Unidad Tractora'),
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
      ...titled('Lleva Enganche'),
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
      ...titled('Operativo'),
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
      ...titled('Genera QR'),
      cell: ({ row }) => {
        const val = row.original.generates_qr;
        if (val === null || val === undefined) return <span className="text-muted-foreground">—</span>;
        return <span>{val ? 'Sí' : 'No'}</span>;
      },
      enableSorting: false,
    },

    // ── Fecha de creación (oculta por defecto) ─────────────────────────────────
    createdAtColumn<EquipmentTypeListItem>(),

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
                  <RowLinkButton
                    label="Editar"
                    ariaLabel={`Editar ${row.original.name ?? 'tipo'}`}
                    onClick={() => onEdit(row.original)}
                  />
                ) : null}
                {onViewRelated ? (
                  <RowLinkButton
                    label="Ver subtipos"
                    ariaLabel={`Ver subtipos de ${row.original.name ?? 'tipo'}`}
                    onClick={() => onViewRelated(row.original)}
                  />
                ) : null}
              </div>
            ),
          },
        ] as ColumnDef<EquipmentTypeListItem>[])
      : []),
  ];
}
