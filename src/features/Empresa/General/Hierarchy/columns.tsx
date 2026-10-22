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
import type { HierarchyListItem } from './actions.server';

/** Rótulo de los sectores sin padre; igual al del filtro "Depende de". */
export const ROOT_SECTOR_LABEL = 'Ninguno (sector raíz)';

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
  onEdit: (item: HierarchyListItem) => void
): ColumnDef<HierarchyListItem>[] {
  const canUpdate = permissions.hasPermission('configuracion', 'organigrama', 'update');

  return [
    // ── Nombre ──────────────────────────────────────────────────────────────
    nameColumn<HierarchyListItem>(),

    // ── Depende de (FK nullable a hierarchy) ─────────────────────────────────
    {
      id: 'parent',
      accessorFn: (row) => row.parent?.name ?? '',
      ...titled('Depende de'),
      cell: ({ row }) =>
        row.original.parent ? (
          <span>{row.original.parent.name}</span>
        ) : (
          <span className="text-muted-foreground">{ROOT_SECTOR_LABEL}</span>
        ),
      filterFn: (row, _id, value: string[]) => {
        const parentId = row.original.parent?.id;
        if (parentId == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(parentId);
      },
    },

    // ── Estado (is_active — booleano nullable) ───────────────────────────────
    activeStatusColumn<HierarchyListItem>(),

    // ── Fecha de creación (oculta por defecto) ────────────────────────────────
    createdAtColumn<HierarchyListItem>(),

    // ── Acciones ─────────────────────────────────────────────────────────────
    ...editActionColumn<HierarchyListItem>({ canEdit: canUpdate, onEdit, getName: (item) => item.name }),
  ];
}
