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
    nameColumn<EquipmentSubTypeListItem>(),

    // ── Tipo de Unidad (FK a type) ────────────────────────────────────────────
    {
      id: 'type',
      accessorFn: (row) => row.type_sub_type_typeTotype?.name ?? '',
      ...titled('Tipo de Unidad'),
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
    activeStatusColumn<EquipmentSubTypeListItem>(),

    // ── Fecha de creación (oculta por defecto) ────────────────────────────────
    createdAtColumn<EquipmentSubTypeListItem>(),

    // ── Acciones ─────────────────────────────────────────────────────────────
    ...editActionColumn<EquipmentSubTypeListItem>({
      canEdit: canUpdate,
      onEdit,
      getName: (item) => item.name ?? 'subtipo',
    }),
  ];
}
