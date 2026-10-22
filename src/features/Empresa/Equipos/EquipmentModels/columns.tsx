'use client';

import {
  activeStatusColumn,
  createdAtColumn,
  editActionColumn,
  nameColumn,
} from '@/features/Empresa/components/catalog-columns';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { ColumnDef } from '@tanstack/react-table';
import type { EquipmentModelListItem } from './actions.server';

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
  onEdit: (item: EquipmentModelListItem) => void
): ColumnDef<EquipmentModelListItem>[] {
  const canUpdate = permissions.hasPermission('configuracion', 'modelos', 'update');

  return [
    // ── Nombre ──────────────────────────────────────────────────────────────
    nameColumn<EquipmentModelListItem>('-'),

    // ── Marca (FK BigInt a brand_vehicles) ───────────────────────────────────
    {
      id: 'brand',
      accessorFn: (row) => row.brand_vehicles?.name ?? '',
      ...titled('Marca'),
      cell: ({ row }) => {
        const brandName = row.original.brand_vehicles?.name;
        if (!brandName) {
          return <span className="text-muted-foreground italic">Sin marca</span>;
        }
        return <span>{brandName}</span>;
      },
      filterFn: (row, _id, value: string[]) => {
        const brandId = row.original.brand;
        if (brandId == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(String(brandId));
      },
      // enableSorting: true por defecto — FK_SORT_MAP en actions.server.ts resuelve el orderBy
    },

    // ── Estado (is_active — booleano nullable) ───────────────────────────────
    activeStatusColumn<EquipmentModelListItem>(),

    // ── Fecha de creación (oculta por defecto) ────────────────────────────────
    createdAtColumn<EquipmentModelListItem>(),

    // ── Acciones ─────────────────────────────────────────────────────────────
    ...editActionColumn<EquipmentModelListItem>({
      canEdit: canUpdate,
      onEdit,
      getName: (item) => item.name ?? 'modelo',
    }),
  ];
}
