'use client';

import {
  catalogActionsColumns,
  catalogActiveColumn,
  catalogCreatedAtColumn,
  catalogNameColumn,
} from '@/features/Clothing/components/catalog-columns';
import type { PermissionChecker } from '@/features/Permissions/hooks/usePermissionChecker';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import type { ColumnDef } from '@tanstack/react-table';
import type { ClothingItemListItem } from './actions.server';

// ============================================================================
// COLUMNS HIDDEN BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT = ['created_at', 'description'];

// ============================================================================
// TYPES
// ============================================================================

type ActionsHandlers = {
  onEdit: (item: ClothingItemListItem) => void;
  onToggleActive: (item: ClothingItemListItem) => void;
};

// ============================================================================
// COLUMNS
// ============================================================================

export function getColumns(
  permissions: PermissionChecker,
  handlers: ActionsHandlers
): ColumnDef<ClothingItemListItem>[] {
  return [
    catalogNameColumn(true),

    // ── Code ──────────────────────────────────────────────────────────────────
    {
      accessorKey: 'code',
      id: 'code',
      ...titled('Código'),
      cell: ({ row }) => <span className="font-mono text-sm text-muted-foreground">{row.original.code ?? '-'}</span>,
    },

    // ── Description (hidden by default) ───────────────────────────────────────
    {
      accessorKey: 'description',
      id: 'description',
      ...titled('Descripción'),
      cell: ({ row }) => (
        <span className="max-w-[300px] truncate text-sm text-muted-foreground">{row.original.description ?? '-'}</span>
      ),
    },

    catalogActiveColumn('muted'),
    catalogCreatedAtColumn(),
    ...catalogActionsColumns<ClothingItemListItem>({
      canUpdate: permissions.hasPermission('configuracion', 'articulos_indumentaria', 'update'),
      canDelete: permissions.hasPermission('configuracion', 'articulos_indumentaria', 'delete'),
      ...handlers,
    }),
  ];
}
